# Authentication

Mission Control supports two auth modes via `AUTH_MODE`:

- `local`: shared bearer token auth for self-hosted deployments
- `clerk`: Clerk JWT auth

## Local mode

Backend:

- `AUTH_MODE=local`
- `LOCAL_AUTH_TOKEN=<token>`

Frontend:

- `NEXT_PUBLIC_AUTH_MODE=local`
- Provide the token via the login UI.

## Clerk mode

Backend:

- `AUTH_MODE=clerk`
- `CLERK_SECRET_KEY=<secret>`

Frontend:

- `NEXT_PUBLIC_AUTH_MODE=clerk`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<key>`

## Better Auth (Google)

Mission Control can also run a **Better Auth** server inside the Next.js
frontend at `/api/auth/*`. It owns Google OAuth and the browser session, and
its JWT plugin publishes a JWKS endpoint that the Python backend verifies
statelessly — the backend never talks to Google. `local` and `clerk` modes
keep working unchanged while this is present; Better Auth is an additional
sign-in path, not a replacement for those.

### How it works

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

### 1. Create the Google OAuth client

1. In the [Google Cloud Console](https://console.cloud.google.com/), open your
   project (or create one).
2. **APIs & Services -> OAuth consent screen**: choose *External*, fill in
   app name + support email. No extra scopes are needed — Google sign-in via
   Better Auth only asks for the standard `openid email profile` profile.
3. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**:
   type **Web application**, and add exactly this authorized redirect URI:

   | Environment | Authorized redirect URI |
   | --- | --- |
   | Local dev | `http://localhost:3000/api/auth/callback/google` |
   | Production | `https://<your-host>/api/auth/callback/google` |

   (Better Auth's built-in Google provider POSTs to
   `/api/auth/callback/google` under the app's `/api/auth` mount.)

   Record the **Client ID** and **Client secret**.

### 2. Configure the frontend

Set these on the `frontend` service (see `frontend/.env.example` and
`compose.yml`; in compose they are passed through as `BETTER_AUTH_*`):

| Variable | Required | Meaning |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | yes | 32+ chars, non-placeholder (`openssl rand -hex 32`). |
| `BETTER_AUTH_GOOGLE_CLIENT_ID` | yes | OAuth client ID from step 1. |
| `BETTER_AUTH_GOOGLE_CLIENT_SECRET` | yes | OAuth client secret from step 1. |
| `BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS` | yes | Comma-separated Google Workspace domains; the `hd` claim must match one. |
| `BETTER_AUTH_BASE_URL` | no (default `http://localhost:3000`) | App origin; used as the JWT issuer **and** audience. |
| `BETTER_AUTH_DATABASE_URL` | yes | Plain `postgresql://` URL to the shared `db` service (compose derives it from `POSTGRES_*`). |

Missing or placeholder values make the `/api/auth/*` routes fail fast with a
clear 500 naming the offending variable (the rest of the app — including
`local`/`clerk` flows — keeps working).

### 3. Apply the Better Auth migration

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

### 4. Use the JWT / API keys from the backend

- JWKS: `GET /api/auth/jwks` on the frontend origin.
- Token: the client (holding the Better Auth session cookie) requests a JWT;
  it carries `iss`/`aud` = `BETTER_AUTH_BASE_URL` and expires after 15m.
- API keys: issued per user via the `apiKey` plugin (`mc_` prefix); send
  `x-api-key: mc_...` on requests; `GET /api/auth/get-session` with that
  header resolves the owning session.

## Agent authentication

Autonomous agents primarily authenticate via an `X-Agent-Token` header. On shared user/agent routes, the backend also accepts `Authorization: Bearer <agent-token>` after user auth does not resolve. See [API reference](api.md) for details.

Security notes:

- Agent auth is rate-limited to **20 requests per 60 seconds per IP**. Exceeding this returns `429 Too Many Requests`.
- Authentication failure logs may include a short token prefix for debugging, but never the full token.
