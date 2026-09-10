# Authentication

Mission Control supports two auth modes via `AUTH_MODE`:

- `local`: shared bearer token auth for offline / air-gapped self-hosting
- `betterauth`: Google sign-in via Better Auth; the backend verifies the app's
  JWTs **statelessly** against the JWKS published by the Next.js app's
  Better Auth instance

`AUTH_MODE=clerk` is no longer accepted — Clerk was retired from this codebase.
A backend started with `AUTH_MODE=clerk` refuses to boot and names the two
working modes; see [Migrating from Clerk mode](#migrating-from-clerk-mode)
below if you are upgrading an existing deployment.

## Choosing a mode

- **`betterauth`** — the default for networked deployments. Real per-user
  identities via Google OAuth, no paid third-party identity dependency, and
  the backend stays offline on the request path (stateless JWKS verification).
- **`local`** — single shared token pasted into the UI. For offline or
  air-gapped self-hosting where no Google/identity provider is reachable.
  Everyone who holds `LOCAL_AUTH_TOKEN` is the same user; there is no
  per-user identity.

## Local mode

Backend:

- `AUTH_MODE=local`
- `LOCAL_AUTH_TOKEN=<token>`

Frontend:

- `NEXT_PUBLIC_AUTH_MODE=local`
- Provide the token via the login UI.

## Better Auth mode

The backend verifies Better Auth JWTs **statelessly**: it checks the
signature against the public keys published at the app's JWKS endpoint and
never calls Google or Better Auth on the request path. The browser keeps
sending `Authorization: Bearer <jwt>` to the API.

Backend:

- `AUTH_MODE=betterauth`
- `BETTER_AUTH_JWKS_URL=<origin>/api/auth/jwks` — e.g.
  `http://localhost:3000/api/auth/jwks`
- `BETTER_AUTH_ISSUER=<origin>` — the `iss` to expect (the app's origin,
  i.e. `BETTER_AUTH_BASE_URL`)
- `BETTER_AUTH_AUDIENCE=<origin>` — optional; defaults to `BETTER_AUTH_ISSUER`
  (Better Auth sets `aud` = `iss`)

Behavior:

- The JWKS document is fetched lazily and cached for ten minutes; the request
  path makes no network call per request. A JWKS outage degrades to a 401
  (with nothing cached) or keeps verifying against the cached keys — it does
  not turn routes into 500s.
- Tokens are checked for signature, `iss`, `aud`, and expiry. A token minted
  by a different Better Auth instance is refused.
- On first sight of a new subject (`sub` = the Better Auth user id), the
  backend provisions one `users` row (email/name from the JWT's claims) and
  one organization membership; later requests reuse it. Org roles, board
  ACLs, and `is_super_admin` are unchanged — authorization stays DB-backed
  and orthogonal to the login provider.
- The `X-Agent-Token` path (`app/core/agent_auth.py`) is untouched.

See the section below for setting up the Better Auth instance itself.

### Better Auth (Google)

Mission Control runs a **Better Auth** server inside the Next.js frontend at
`/api/auth/*`. It owns Google OAuth and the browser session, and its JWT
plugin publishes a JWKS endpoint that the Python backend verifies
statelessly — the backend never talks to Google.

#### How it works

- Google sign-in: the browser completes the Google OAuth flow at
  `/api/auth/*` and gets a Better Auth session (cookie).
- JWT: the app fetches a short-lived JWT from the token endpoint; the backend
  verifies it against `GET /api/auth/jwks` (issuer and audience are both the
  `BETTER_AUTH_BASE_URL` origin, 15-minute expiry).
- Domain admission: only Google accounts whose `hd` (hosted domain) claim is
  in the allowlist may sign in. Refused accounts leave **no** user / session /
  account row in the database.
- API keys: machine clients can be issued `mc_`-prefixed keys; send them in
  the `x-api-key` header (with `enableSessionForAPIKeys` they resolve to a
  session context on session-gated endpoints).
- Schema: Better Auth owns its tables in the dedicated `better_auth`
  Postgres schema in the shared `db` service. Alembic manages only the
  `public` schema and does not touch these tables.

#### 1. Create the Google OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), open your
   project (or create one).
2. **APIs & Services -> OAuth consent screen**: choose _External_, fill in
   app name + support email. No extra scopes are needed — Google sign-in via
   Better Auth only asks for the standard `openid email profile` profile.
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**:
   type **Web application**, and add exactly this authorized redirect URI:

   | Environment | Authorized redirect URI                          |
   | ----------- | ------------------------------------------------ |
   | Local dev   | `http://localhost:3000/api/auth/callback/google` |
   | Production  | `https://<your-host>/api/auth/callback/google`   |

   (Better Auth's built-in Google provider POSTs to
   `/api/auth/callback/google` under the app's `/api/auth` mount.)

   Record the **Client ID** and **Client secret**.

#### 2. Configure the frontend

Set these on the `frontend` service (see `frontend/.env.example` and
`compose.yml`; in compose they are passed through as `BETTER_AUTH_*`):

| Variable                             | Required                             | Meaning                                                                                      |
| ------------------------------------ | ------------------------------------ | -------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                 | yes                                  | 32+ chars, non-placeholder (`openssl rand -hex 32`).                                         |
| `BETTER_AUTH_GOOGLE_CLIENT_ID`       | yes                                  | OAuth client ID from step 1.                                                                 |
| `BETTER_AUTH_GOOGLE_CLIENT_SECRET`   | yes                                  | OAuth client secret from step 1.                                                             |
| `BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS` | yes                                  | Comma-separated Google Workspace domains; the `hd` claim must match one.                     |
| `BETTER_AUTH_BASE_URL`               | no (default `http://localhost:3000`) | App origin; used as the JWT issuer **and** audience.                                         |
| `BETTER_AUTH_DATABASE_URL`           | yes                                  | Plain `postgresql://` URL to the shared `db` service (compose derives it from `POSTGRES_*`). |

Missing or placeholder values make the `/api/auth/*` routes fail fast with a
clear 500 naming the offending variable (the `local` flow keeps working).

#### 3. Apply the Better Auth migration

Better Auth's tables are in the `better_auth` schema, managed by the
`better-auth` CLI tooling, **not** Alembic:

```bash
cd frontend
npm run db:migration:generate   # regenerate the committed SQL (rare)
BETTER_AUTH_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mission_control \
  npm run db:migration:apply     # apply frontend/better-auth/migrations/0000_initial.sql
```

`make backend-migration-check` must keep passing — Alembic only manages the
`public` schema and does not manage or trip over the `better_auth` tables.

#### 4. Use the JWT / API keys from the backend

- JWKS: `GET /api/auth/jwks` on the frontend origin.
- Token: the client (holding the Better Auth session cookie) requests a JWT;
  it carries `iss`/`aud` = `BETTER_AUTH_BASE_URL` and expires after 15m.
- API keys: issued per user via the `apiKey` plugin (`mc_` prefix); send
  `x-api-key: mc_...` on requests; `GET /api/auth/get-session` with that
  header resolves the owning session.

## Migrating from Clerk mode

Clerk was retired: the SDKs, the `clerk` auth mode, its config, and its docs
are gone. What that means for an existing Clerk deployment:

- **Clerk login no longer exists.** The old `AUTH_MODE=clerk` /
  `NEXT_PUBLIC_AUTH_MODE=clerk` values are rejected at startup / render an
  "unavailable" screen instead of a sign-in. Set both to `betterauth` (or
  `local`).
- **Existing Clerk users are not automatically migrated, and their Clerk
  identities will not match Better Auth ones.** User identity is keyed on
  `users.external_auth_id`: a Clerk user row carries the Clerk user id, while
  Better Auth identifies people by its own user id (the JWT `sub`). A Clerk
  user who signs in with Google through Better Auth provisions a **new**
  `users` row — the old Clerk row (and any board ACLs, org roles, or history
  attached to it) is **orphaned** and will not be used.
- **To keep a Clerk user's data, remap the identity manually.**
  `users.external_auth_id` has a **unique index**, so two rows can never
  carry the same Better Auth subject; the remap moves the Better Auth
  subject onto the *old* row and retires the freshly created one:

  1. Get the person's Better Auth user id (the JWT `sub`). The easiest way:
     have them sign in once via Google, which provisions a new `users` row
     carrying that `external_auth_id`; read it from `users`. (You can also
     look it up in the `better_auth` schema directly.)
  2. Delete that freshly created row — it holds no user-specific data, and
     it must not coexist with the remapped old row under the same
     `external_auth_id`:

     ```sql
     DELETE FROM users WHERE external_auth_id = '<better auth user id>';
     ```
  3. Point the old (Clerk) row at the Better Auth identity:

     ```sql
     UPDATE users SET external_auth_id = '<better auth user id>'
     WHERE external_auth_id = '<clerk user id>';
     ```

  On the person's next sign-in, the existing old row is found by
  `external_auth_id` and reused, so all existing org memberships and board
  ACLs (keyed on `users.id`) keep resolving to the Better Auth identity, and
  the default-org membership is re-guaranteed on first sight. If you already
  know the Better Auth user id up front you can skip step 1 and run only the
  `UPDATE`.

## Agent authentication

Autonomous agents primarily authenticate via an `X-Agent-Token` header. On shared user/agent routes, the backend also accepts `Authorization: Bearer <agent-token>` after user auth does not resolve. See [API reference](api.md) for details.

Security notes:

- Agent auth is rate-limited to **20 requests per 60 seconds per IP**. Exceeding this returns `429 Too Many Requests`.
- Authentication failure logs may include a short token prefix for debugging, but never the full token.
