import { describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { SqliteDialect } from "kysely";
import { jwtVerify, createLocalJWKSet } from "jose";
import { getMigrations } from "better-auth/db";
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { createAuthClient } from "better-auth/client";
import {
  BetterAuthConfigError,
  buildBetterAuthOptions,
  parseAllowedGoogleDomains,
  validateBetterAuthEnv,
  type BetterAuthEnv,
} from "./better-auth";

const BASE_URL = "http://localhost:3000";
const AUTH_BASE = `${BASE_URL}/api/auth`;
const ALLOWED_DOMAIN = "corp.example.com";

function testEnv(
  overrides?: Record<string, string | undefined>,
): BetterAuthEnv {
  return validateBetterAuthEnv({
    BETTER_AUTH_SECRET: "test-secret-0123456789-0123456789-abcd",
    BETTER_AUTH_GOOGLE_CLIENT_ID: "123456.apps.googleusercontent.com",
    BETTER_AUTH_GOOGLE_CLIENT_SECRET: "test-google-client-secret",
    BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS: ALLOWED_DOMAIN,
    BETTER_AUTH_BASE_URL: BASE_URL,
    BETTER_AUTH_DATABASE_URL:
      "postgresql://postgres:postgres@localhost:5432/mission_control",
    ...overrides,
  });
}

/**
 * A Google-style ID token, hand-rolled and unsigned (`alg: none`).
 *
 * Unsigned is fine here: the provider's `verifyIdToken` is stubbed out in
 * these tests, and the `hd` admission gate only *decodes* the claims
 * (`decodeJwt` performs no signature verification). Hand-rolling also avoids
 * jose's cross-realm key check: signing with `TextEncoder` output inside the
 * jsdom test realm is rejected by jose's `instanceof` guards.
 */
function googleIdToken(
  env: BetterAuthEnv,
  claims: { email: string; hd?: string; sub?: string },
): string {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "none", typ: "JWT" }),
  ).toString("base64url");
  const payload: Record<string, unknown> = {
    sub: claims.sub ?? "google-sub-1",
    email: claims.email,
    name: "Test User",
    picture: "https://lh3.google.com/u/0/p.png",
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: env.googleClientId,
    iat: now,
    exp: now + 3600,
  };
  if (claims.hd !== undefined) {
    payload.hd = claims.hd;
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${header}.${body}.unsigned-test-token`;
}

/** In-memory sqlite app wired exactly like the production options, with the
 * Google network verification stubbed out (unit boundary: the domain gate and
 * the row lifecycle are what these tests prove). */
async function makeApp(envOverrides?: Record<string, string | undefined>) {
  const env = testEnv(envOverrides);
  const sqlite = new Database(":memory:");
  // Documented `{ dialect, type }` shape (a bare Kysely instance is not
  // auto-detected by better-auth's adapter selection).
  const db: Parameters<typeof buildBetterAuthOptions>[1] = {
    dialect: new SqliteDialect({ database: sqlite }),
    type: "sqlite",
  };
  const base = buildBetterAuthOptions(env, db);
  const google = base.socialProviders?.google;
  if (!google) {
    throw new Error(
      "test setup: buildBetterAuthOptions omitted the google provider",
    );
  }
  const options: BetterAuthOptions = {
    ...base,
    logger: { disabled: true },
    socialProviders: {
      ...base.socialProviders,
      // Rebuilt explicitly (a spread of `google` makes the required
      // clientId/clientSecret optional again): keep every provider option
      // from buildBetterAuthOptions, override only verifyIdToken.
      google: {
        ...google,
        clientId: google.clientId,
        clientSecret: google.clientSecret,
        // Unit boundary: skip Google's certificate fetch; claim decoding and
        // the hd gate (our code) still run on every sign-in.
        verifyIdToken: async () => true,
      },
    },
  };
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
  const auth = betterAuth(options);
  const client = createAuthClient({
    // The catch-all route handler lives at /api/auth/[...all], so the
    // client base URL must include the /api/auth prefix (mirrors production).
    baseURL: AUTH_BASE,
    fetchOptions: {
      customFetchImpl: (input: string | URL | Request, init?: RequestInit) =>
        auth.handler(new Request(input, init)),
    },
  });
  return { env, sqlite, auth, client };
}

function cookieFrom(
  res: Response,
  name = "better-auth.session_token",
): string | undefined {
  const raw = res.headers.get("set-cookie");
  const hit = raw?.split("; ").find((c) => c.startsWith(`${name}=`));
  return hit ?? undefined;
}

function rowCount(
  sqlite: Database.Database,
  table: "user" | "session" | "account",
): number {
  return (
    sqlite.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as {
      c: number;
    }
  ).c;
}

/** Raw POST to /sign-in/social with a hand-rolled id token. */
function signInViaHandler(
  auth: ReturnType<typeof betterAuth>,
  env: BetterAuthEnv,
  claims: { email: string; hd?: string; sub?: string },
): Promise<Response> {
  return auth.handler(
    new Request(`${AUTH_BASE}/sign-in/social`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "google",
        callbackURL: `${BASE_URL}/boards`,
        idToken: { token: googleIdToken(env, claims) },
      }),
    }),
  );
}

describe("Better Auth env validation", () => {
  it("accepts a complete, valid environment", () => {
    const config = testEnv();
    expect(config.allowedGoogleDomains).toEqual([ALLOWED_DOMAIN]);
    expect(config.baseUrl).toBe(BASE_URL);
    expect(config.googleClientId).toBe("123456.apps.googleusercontent.com");
  });

  it("parses the allowed domains comma-separated and case-insensitively", () => {
    expect(
      parseAllowedGoogleDomains(" Corp.Example.com ,corp.example.com "),
    ).toEqual(["corp.example.com", "corp.example.com"]);
    expect(() => parseAllowedGoogleDomains("  ,  ")).toThrow(
      /BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS/,
    );
  });

  it("rejects a missing secret", () => {
    expect(() => testEnv({ BETTER_AUTH_SECRET: undefined })).toThrow(
      /BETTER_AUTH_SECRET is required/,
    );
  });

  it("rejects a short secret", () => {
    expect(() => testEnv({ BETTER_AUTH_SECRET: "too-short" })).toThrow(
      /at least 32 characters/,
    );
  });

  it("rejects a placeholder secret even when long enough", () => {
    expect(() =>
      testEnv({ BETTER_AUTH_SECRET: "your-secret-here-your-secret-here" }),
    ).toThrow(/placeholder/);
  });

  it("rejects a placeholder Google client secret", () => {
    expect(() =>
      testEnv({ BETTER_AUTH_GOOGLE_CLIENT_SECRET: "replace-me" }),
    ).toThrow(/placeholder/);
  });

  it("throws BetterAuthConfigError (not a generic error) so handlers can surface it", () => {
    expect(() => testEnv({ BETTER_AUTH_SECRET: undefined })).toThrow(
      BetterAuthConfigError,
    );
  });
});

describe("Better Auth Google sign-in (in-memory sqlite)", () => {
  it("completes sign-in for an allowed Workspace domain and persists the hd claim", async () => {
    const { auth, env, sqlite } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "user@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe("user@corp.example.com");
    expect(body.user.hd).toBe(ALLOWED_DOMAIN);
    expect(typeof body.token).toBe("string");
    expect(cookieFrom(res)).toBeTruthy();
    expect(rowCount(sqlite, "user")).toBe(1);
    expect(rowCount(sqlite, "session")).toBe(1);
    expect(rowCount(sqlite, "account")).toBe(1);
    const hd = (sqlite.prepare("SELECT hd FROM user").get() as { hd: string })
      .hd;
    expect(hd).toBe(ALLOWED_DOMAIN);
    // idempotent second sign-in for the same account: still one user.
    const again = await signInViaHandler(auth, env, {
      email: "user@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    expect(again.status).toBe(200);
    expect(rowCount(sqlite, "user")).toBe(1);
  });

  it("refuses a Google account outside the allowed domains and writes zero rows", async () => {
    const { auth, env, sqlite } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "attacker@evil.example.net",
      hd: "evil.example.net",
    });
    expect(res.status).toBe(401);
    expect(rowCount(sqlite, "user")).toBe(0);
    expect(rowCount(sqlite, "session")).toBe(0);
    expect(rowCount(sqlite, "account")).toBe(0);
  });

  it("refuses a consumer account without any hd claim and writes zero rows", async () => {
    const { auth, env, sqlite } = await makeApp();
    const res = await signInViaHandler(auth, env, { email: "guy@gmail.com" });
    expect(res.status).toBe(401);
    expect(rowCount(sqlite, "user")).toBe(0);
    expect(rowCount(sqlite, "session")).toBe(0);
    expect(rowCount(sqlite, "account")).toBe(0);
  });

  it("admits each domain of a multi-domain allowlist and still refuses outsiders", async () => {
    const second = "partner.example.com";
    const { auth, env, sqlite } = await makeApp({
      BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS: `${ALLOWED_DOMAIN},${second}`,
    });
    const inSecond = await signInViaHandler(auth, env, {
      email: "user@partner.example.com",
      hd: second,
    });
    expect(inSecond.status).toBe(200);
    expect(rowCount(sqlite, "user")).toBe(1);

    const outsider = await signInViaHandler(auth, env, {
      email: "sneak@evil.example.net",
      hd: "evil.example.net",
    });
    expect(outsider.status).toBe(401);
    expect(rowCount(sqlite, "user")).toBe(1);
    expect(rowCount(sqlite, "session")).toBe(1);
  });

  it("admits a second domain case-insensitively", async () => {
    const second = "Partner.Example.com";
    const { auth, env, sqlite } = await makeApp({
      BETTER_AUTH_ALLOWED_GOOGLE_DOMAINS: `corp.example.com,${second}`,
    });
    const res = await signInViaHandler(auth, env, {
      email: "user@partner.example.com",
      hd: "partner.example.com",
    });
    expect(res.status).toBe(200);
    expect(rowCount(sqlite, "user")).toBe(1);
  });

  it("issues a JWT that verifies against the JWKS with the configured iss/aud", async () => {
    const { auth, env } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "user@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    const sessionCookie = cookieFrom(res);
    expect(sessionCookie).toBeTruthy();

    const jwksRes = await auth.handler(new Request(`${AUTH_BASE}/jwks`));
    expect(jwksRes.status).toBe(200);
    const jwks = await jwksRes.json();
    expect(jwks.keys.length).toBeGreaterThan(0);

    const tokenRes = await auth.handler(
      new Request(`${AUTH_BASE}/token`, {
        headers: { cookie: sessionCookie! },
      }),
    );
    expect(tokenRes.status).toBe(200);
    const { token } = await tokenRes.json();
    expect(typeof token).toBe("string");

    const keySet = await createLocalJWKSet(jwks);
    const { payload } = await jwtVerify(token, keySet, {
      issuer: BASE_URL,
      audience: BASE_URL,
    });
    expect(payload.iss).toBe(BASE_URL);
    expect(payload.aud).toBe(BASE_URL);
    expect(payload.sub).toBe(body.user.id);
  });

  it("issues API keys and resolves a session through the key", async () => {
    const { auth, env } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "user@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    const body = await res.json();
    const cookie = cookieFrom(res)!;

    const createRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/create`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "machine" }),
      }),
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.key.startsWith("mc_")).toBe(true);

    const listRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/list`, { headers: { cookie } }),
    );
    expect(listRes.status).toBe(200);
    expect((await listRes.json()).length).toBe(1);

    // enableSessionForAPIKeys: the x-api-key header resolves to a session
    // context — the wire path machine clients use against this instance.
    const sessionRes = await auth.handler(
      new Request(`${AUTH_BASE}/get-session`, {
        headers: { "x-api-key": created.key },
      }),
    );
    expect(sessionRes.status).toBe(200);
    const session = await sessionRes.json();
    expect(session.user.email).toBe("user@corp.example.com");
    expect(session.user.id).toBe(body.user.id);
  });

  it("wires the vanilla client through the same handler", async () => {
    const { client, env } = await makeApp();
    const { data, error } = await client.signIn.social({
      provider: "google",
      callbackURL: `${BASE_URL}/boards`,
      idToken: {
        token: googleIdToken(env, {
          email: "user@corp.example.com",
          hd: ALLOWED_DOMAIN,
        }),
      },
    } as Parameters<typeof client.signIn.social>[0]);
    expect(error).toBeNull();
    // The client's return type unions the "redirect" and "token" shapes;
    // with an inline idToken we get the token shape, and `hd` is our
    // additionalField which the generic user type does not know about.
    const user = (data as { user?: { hd?: string } }).user;
    expect(user?.hd).toBe(ALLOWED_DOMAIN);
  });
  it("exchanges a machine API key for a JWKS-verifiable session JWT", async () => {
    const { auth, env, sqlite } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "ada@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    const body = await res.json();
    const cookie = cookieFrom(res)!;

    const createRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/create`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "mcp" }),
      }),
    );
    expect(createRes.status).toBe(200);
    const { key } = await createRes.json();
    expect(key.startsWith("mc_")).toBe(true);

    // The machine-client wire path: x-api-key on the session-gated token
    // endpoint. No session cookie is sent or set on this call.
    const tokenRes = await auth.handler(
      new Request(`${AUTH_BASE}/token`, {
        headers: { "x-api-key": key },
      }),
    );
    expect(tokenRes.status).toBe(200);
    expect(tokenRes.headers.get("set-cookie")).toBeNull();
    const { token } = await tokenRes.json();
    expect(typeof token).toBe("string");

    const jwksRes = await auth.handler(new Request(`${AUTH_BASE}/jwks`));
    const jwks = await jwksRes.json();
    const { payload } = await jwtVerify(token, await createLocalJWKSet(jwks), {
      issuer: BASE_URL,
      audience: BASE_URL,
    });
    expect(payload.sub).toBe(body.user.id);
    expect(payload.email).toBe("ada@corp.example.com");

    // A revocable credential stays revocable: no session row is minted for
    // the key, so revoking the key affects only key rows.
    expect(rowCount(sqlite, "session")).toBe(1);
  });

  it("refuses to exchange a disabled (revoked) key and mints nothing", async () => {
    const { auth, env, sqlite } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "ada@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    const cookie = cookieFrom(res)!;

    const createRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/create`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "portfolio-sync" }),
      }),
    );
    const created = await createRes.json();

    const disableRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/update`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ keyId: created.id, enabled: false }),
      }),
    );
    expect(disableRes.status).toBe(200);

    const tokenRes = await auth.handler(
      new Request(`${AUTH_BASE}/token`, {
        headers: { "x-api-key": created.key },
      }),
    );
    expect(tokenRes.status).toBe(401);
    // Refusal without mutation: the revoked key changes no user/session row.
    expect(rowCount(sqlite, "user")).toBe(1);
    expect(rowCount(sqlite, "session")).toBe(1);
    expect(rowCount(sqlite, "account")).toBe(1);
  });

  it("refuses to exchange a deleted key", async () => {
    const { auth, env } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "ada@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    const cookie = cookieFrom(res)!;

    const createRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/create`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "cypress" }),
      }),
    );
    const created = await createRes.json();

    const deleteRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/delete`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ keyId: created.id }),
      }),
    );
    expect(deleteRes.status).toBe(200);

    const tokenRes = await auth.handler(
      new Request(`${AUTH_BASE}/token`, {
        headers: { "x-api-key": created.key },
      }),
    );
    expect(tokenRes.status).toBe(401);
  });

  it("refuses to exchange an expired key", async () => {
    const { auth, env, sqlite } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "ada@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    const cookie = cookieFrom(res)!;

    const createRes = await auth.handler(
      new Request(`${AUTH_BASE}/api-key/create`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "one-shot", expiresIn: 86_400 }),
      }),
    );
    expect(createRes.status).toBe(200);
    const created = await createRes.json();
    expect(created.key).toBeTypeOf("string");

    // Backdate the stored expiry so the test does not have to wait (the
    // plugin's minExpiresIn default is one day, so we cannot create with a
    // sub-day expiry and let it lapse naturally).
    sqlite
      .prepare('UPDATE "apikey" SET "expiresAt" = ?')
      .run(new Date(Date.now() - 60_000).toISOString());

    const tokenRes = await auth.handler(
      new Request(`${AUTH_BASE}/token`, {
        headers: { "x-api-key": created.key },
      }),
    );
    expect(tokenRes.status).toBe(401);
  });

  it("refuses an unknown key and a key-less exchange request", async () => {
    const { auth } = await makeApp();
    const unknown = await auth.handler(
      new Request(`${AUTH_BASE}/token`, {
        headers: { "x-api-key": `mc_${"z".repeat(67)}` },
      }),
    );
    expect(unknown.status).toBe(401);

    const bare = await auth.handler(new Request(`${AUTH_BASE}/token`));
    expect(bare.status).toBe(401);
  });

  it("a key mints JWTs only for its owner, not for whoever is signed in", async () => {
    const { auth, env } = await makeApp();
    const ada = await signInViaHandler(auth, env, {
      email: "ada@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    const adaBody = await ada.json();
    const adaCookie = cookieFrom(ada)!;

    const adaKey = (
      await (
        await auth.handler(
          new Request(`${AUTH_BASE}/api-key/create`, {
            method: "POST",
            headers: { "content-type": "application/json", cookie: adaCookie },
            body: JSON.stringify({ name: "ada-mcp" }),
          }),
        )
      ).json()
    ).key as string;

    // A second user signs in on the same instance; the key still belongs
    // to Ada and must mint only Ada's subject.
    const grace = await signInViaHandler(auth, env, {
      email: "grace@corp.example.com",
      hd: ALLOWED_DOMAIN,
      sub: "google-sub-2",
    });
    const graceBody = await grace.json();

    const tokenRes = await auth.handler(
      new Request(`${AUTH_BASE}/token`, {
        headers: { "x-api-key": adaKey },
      }),
    );
    expect(tokenRes.status).toBe(200);
    const { token } = await tokenRes.json();
    const jwks = await (
      await auth.handler(new Request(`${AUTH_BASE}/jwks`))
    ).json();
    const { payload } = await jwtVerify(token, await createLocalJWKSet(jwks), {
      issuer: BASE_URL,
      audience: BASE_URL,
    });
    expect(payload.sub).toBe(adaBody.user.id);
    expect(payload.sub).not.toBe(graceBody.user.id);
  });

  it("creates keys without the plugin-default per-key rate cap", async () => {
    const { auth, env, sqlite } = await makeApp();
    const res = await signInViaHandler(auth, env, {
      email: "ada@corp.example.com",
      hd: ALLOWED_DOMAIN,
    });
    const cookie = cookieFrom(res)!;

    await auth.handler(
      new Request(`${AUTH_BASE}/api-key/create`, {
        method: "POST",
        headers: { "content-type": "application/json", cookie },
        body: JSON.stringify({ name: "mcp" }),
      }),
    );
    // The machine-client exchange re-mints a 15-minute JWT many times a day,
    // so the 10-requests/day plugin default must not be baked into keys.
    const row = sqlite
      .prepare('SELECT "rateLimitEnabled" FROM "apikey"')
      .get() as { rateLimitEnabled: number };
    expect(row.rateLimitEnabled).toBeFalsy();
  });
});
