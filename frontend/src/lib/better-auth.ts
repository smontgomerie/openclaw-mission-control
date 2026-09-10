/**
 * Better Auth server instance for Mission Control.
 *
 * Better Auth runs in the Next.js app and owns Google OAuth plus the browser
 * session at `/api/auth/*`. Its JWT plugin publishes a JWKS at
 * `/api/auth/jwks`; the Python backend verifies those JWTs statelessly and
 * never talks to Google.
 *
 * Design notes:
 * - Better Auth owns its tables in the dedicated `better_auth` Postgres
 *   schema; Alembic (public schema) must not manage or trip over them. The
 *   committed migration is `better-auth/migrations/0000_initial.sql`
 *   (regenerate with `npm run db:migration:generate`).
 * - Google admission is restricted to the allowed Google Workspace
 *   domain(s) via the `hd` claim. The check runs in the provider's
 *   `getUserInfo` override — the single choke point BEFORE Better Auth
 *   writes any user / session / account row — so a refused account leaves
 *   zero rows behind.
 * - The instance is built lazily on first `/api/auth/*` request (see
 *   `getAuth`), so a missing or placeholder env var fails that request with
 *   a clear 500 instead of breaking `next build` or the rest of the app.
 *   `instrumentation.ts` logs the same core check loudly at server boot.
 */
import { createRequire } from "node:module";
import type { Pool } from "pg";
import { decodeJwt } from "jose";
import { betterAuth } from "better-auth";
import type { BetterAuthOptions } from "better-auth";
import { jwt, apiKey } from "better-auth/plugins";

/** Better Auth's dedicated Postgres schema in the shared `db` service. */
export const BETTER_AUTH_SCHEMA = "better_auth";

/** Minimum length for BETTER_AUTH_SECRET (mirrors the backend token rules). */
export const BETTER_AUTH_SECRET_MIN_LENGTH = 32;

/** Values that read like template leftovers and are rejected at startup. */
export const BETTER_AUTH_PLACEHOLDERS = new Set([
  "change-me",
  "changeme",
  "replace-me",
  "your-secret-here",
  "your-secret",
  "xxx",
  "secret",
  "placeholder",
  "todo",
  "dev-secret",
  "development",
]);

export interface BetterAuthEnv {
  secret: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedGoogleDomains: string[];
  /** Origin of the app, e.g. `http://localhost:3000`. Used as the JWT issuer AND audience. */
  baseUrl: string;
  /** Plain `postgresql://` URL to the `db` service (NOT the backend's SQLAlchemy-prefixed DATABASE_URL). */
  databaseUrl: string;
}

export class BetterAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BetterAuthConfigError";
  }
}

function isPlaceholder(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (BETTER_AUTH_PLACEHOLDERS.has(v)) {
    return true;
  }
  // A template leftover pasted repeatedly to satisfy a minimum length (e.g.
  // "your-secret-here" pasted twice, joined by a separator) still reads as
  // a placeholder: reject any value that is composed of known placeholder
  // phrases plus separators/digits only. A real generated secret (hex from
  // `openssl rand -hex 32`, a passphrase, ...) always leaves real
  // characters behind.
  let rest = v;
  for (const phrase of BETTER_AUTH_PLACEHOLDERS) {
    rest = rest.split(phrase).join("");
  }
  return !/[a-z0-9]/.test(rest);
}

function requireNonEmpty(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new BetterAuthConfigError(`${name} is required but was not set.`);
  }
  return value;
}

function requireNonPlaceholder(
  name: string,
  value: string | undefined,
): string {
  const v = requireNonEmpty(name, value);
  if (isPlaceholder(v)) {
    throw new BetterAuthConfigError(
      `${name} is still a placeholder value ("${v}"). Set it to a real value — see docs/reference/authentication.md.`,
    );
  }
  return v;
}

/** Parse `BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS` (comma-separated, case-insensitive). */
export function parseAllowedGoogleDomains(raw: string | undefined): string[] {
  const domains = (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter((d) => d.length > 0);
  if (domains.length === 0) {
    throw new BetterAuthConfigError(
      "BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS must list at least one Google Workspace domain.",
    );
  }
  return domains;
}

/**
 * The env vars that must be valid for the app to boot with Better Auth at all.
 * Used by `instrumentation.ts` at server start (loud log, not crash): the
 * the local flow keeps working while these are unset; only the
 * `/api/auth/*` routes fail.
 */
export function requireCoreBetterAuthEnv(
  env: Record<string, string | undefined>,
): BetterAuthEnv {
  const secret = requireNonEmpty("BETTER_AUTH_SECRET", env.BETTER_AUTH_SECRET);
  if (secret.length < BETTER_AUTH_SECRET_MIN_LENGTH) {
    throw new BetterAuthConfigError(
      `BETTER_AUTH_SECRET must be at least ${BETTER_AUTH_SECRET_MIN_LENGTH} characters (try \`openssl rand -hex 32\`).`,
    );
  }
  if (isPlaceholder(secret)) {
    throw new BetterAuthConfigError(
      `BETTER_AUTH_SECRET is still a placeholder value ("${secret}"). Generate a real one, e.g. \`openssl rand -hex 32\`.`,
    );
  }
  return {
    secret,
    googleClientId: "",
    googleClientSecret: "",
    allowedGoogleDomains: parseAllowedGoogleDomains(
      env.BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS,
    ),
    baseUrl: requireNonEmpty(
      "BETTER_AUTH_BASE_URL",
      env.BETTER_AUTH_BASE_URL ?? "http://localhost:3000",
    ),
    databaseUrl: requireNonEmpty(
      "BETTER_AUTH_DATABASE_URL",
      env.BETTER_AUTH_DATABASE_URL,
    ),
  };
}

/**
 * Full validation: core vars plus the Google OAuth credentials. Used at
 * instance-build time — the first `/api/auth/*` request.
 */
export function validateBetterAuthEnv(
  env: Record<string, string | undefined>,
): BetterAuthEnv {
  const config = requireCoreBetterAuthEnv(env);
  config.googleClientId = requireNonEmpty(
    "BETTER_AUTH_GOOGLE_CLIENT_ID",
    env.BETTER_AUTH_GOOGLE_CLIENT_ID,
  );
  config.googleClientSecret = requireNonPlaceholder(
    "BETTER_AUTH_GOOGLE_CLIENT_SECRET",
    env.BETTER_AUTH_GOOGLE_CLIENT_SECRET,
  );
  return config;
}

type AuthDatabase = BetterAuthOptions["database"];

/**
 * The full Better Auth options for this app. Exported so the migration
 * generator (which keeps a JS mirror) and the unit tests exercise the exact
 * same schema-affecting config.
 */
export function buildBetterAuthOptions(
  config: BetterAuthEnv,
  database: AuthDatabase,
): BetterAuthOptions {
  // The `hd` claim is the admission gate. Consumer (non-Workspace) Google
  // accounts have no `hd` at all, so its absence is a refusal. This override
  // runs before Better Auth writes any user/session/account row.
  //
  // `GoogleOAuthTokens` mirrors the `OAuth2Tokens` shape better-auth 1.4.x
  // passes to the Google provider's getUserInfo override (all fields
  // optional, no index signature, so the framework's token type stays
  // assignable).
  type GoogleOAuthTokens = {
    tokenType?: string;
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: Date;
    refreshTokenExpiresAt?: Date;
    scopes?: string[];
    idToken?: string;
    raw?: Record<string, unknown>;
  };

  const googleUserInfo = async (token: GoogleOAuthTokens) => {
    // Refusals return `null` rather than throwing: the sign-in route's
    // built-in check then emits a 401 before any user/session/account row
    // is written. Throwing here would surface as an opaque 500 SERVER_ERROR
    // in this version of the framework.
    let profile: Record<string, unknown> | null = null;
    if (token.idToken) {
      try {
        profile = decodeJwt(token.idToken) as Record<string, unknown>;
      } catch {
        profile = null;
      }
    }
    if (!profile?.email) {
      return null;
    }
    const hd = profile.hd;
    if (
      typeof hd !== "string" ||
      !config.allowedGoogleDomains.includes(hd.toLowerCase())
    ) {
      console.warn(
        "[better-auth] refused Google account outside allowed domain(s)",
      );
      return null;
    }
    return {
      user: {
        id: String(profile.sub),
        name: (profile.name as string | undefined) ?? "",
        email: String(profile.email),
        image: profile.picture as string | undefined,
        emailVerified: profile.email_verified === true,
        // Persisted on the user row via user.additionalFields.hd below.
        hd,
      },
      data: profile,
    };
  };

  return {
    secret: config.secret,
    baseURL: config.baseUrl,
    database,
    // No email/password: Google is the only way in.
    emailAndPassword: { enabled: false },
    user: {
      additionalFields: {
        hd: { type: "string", required: false },
      },
    },
    socialProviders: {
      google: {
        enabled: true,
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        // UX-level restriction of the Google consent screen when exactly one
        // domain is allowed. The real gate is googleUserInfo above.
        hd:
          config.allowedGoogleDomains.length === 1
            ? config.allowedGoogleDomains[0]
            : undefined,
        getUserInfo: googleUserInfo,
      },
    },
    plugins: [
      // Stateless JWT + JWKS so the Python backend can verify JWTs without
      // ever talking to Google.
      jwt({
        jwt: {
          issuer: config.baseUrl,
          audience: config.baseUrl,
          expirationTime: "15m",
        },
      }),
      // Machine-client credential path (later items migrate the clients).
      // Machine-client credential path (later items migrate the clients).
      // enableSessionForAPIKeys: an x-api-key header resolves to a session
      // context, so machine clients can authenticate session-gated endpoints.
      apiKey({ defaultPrefix: "mc_", enableSessionForAPIKeys: true }),
    ],
  };
}

/**
 * Better Auth's Postgres connection, confined to the `better_auth` schema.
 * The session-level `search_path` is set in the connection StartupMessage
 * (libpq `options`), so every Better Auth query lands in `better_auth`
 * while unqualified names fall back to `public` for system catalog use.
 */
export function createBetterAuthDatabase(config: BetterAuthEnv): Pool {
  // `pg` is a Node-only driver, so it is loaded here through
  // `createRequire` (bundler-opaque) rather than a top-level import:
  // Next.js also bundles `src/instrumentation.ts` for the edge runtime,
  // and a static `pg` import would drag it into that bundle and fail
  // `next build` on `util/types`. This factory is only ever called from
  // nodejs route handlers (`getAuth`), where `pg` resolves from
  // node_modules.
  const requireModule = createRequire(import.meta.url);
  const { Pool } = requireModule("pg") as typeof import("pg");
  return new Pool({
    connectionString: config.databaseUrl,
    options: `-c search_path=${BETTER_AUTH_SCHEMA},public`,
  });
}

/**
 * Build a Better Auth instance from validated env. `database` is injectable
 * so tests can pass an in-memory Kysely/sqlite dialect; in the app we use
 * Postgres via `BETTER_AUTH_DATABASE_URL`, confined to the `better_auth`
 * schema.
 */
export function createAuthInstance(
  config: BetterAuthEnv,
  database?: AuthDatabase,
) {
  return betterAuth(
    buildBetterAuthOptions(
      config,
      database ?? createBetterAuthDatabase(config),
    ),
  );
}

let cachedAuth: ReturnType<typeof createAuthInstance> | undefined;

/**
 * App entry point. Validates env on first call and memoizes the instance.
 * A BetterAuthConfigError here becomes a 500 on the first `/api/auth/*`
 * request naming exactly what to fix.
 */
export function getAuth() {
  if (!cachedAuth) {
    const config = validateBetterAuthEnv(process.env);
    cachedAuth = createAuthInstance(config);
  }
  return cachedAuth;
}
