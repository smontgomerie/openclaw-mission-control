"use client";

// Browser-side Better Auth client + JWT token source for Mission Control.
//
// Better Auth runs in the Next.js app (see `src/lib/better-auth.ts`): Google
// sign-in at `/api/auth/*`, sessions in cookies on the app origin, and the
// jwt plugin publishing a short-lived JWT at `GET /api/auth/token`. The
// Python backend verifies those JWTs statelessly against `/api/auth/jwks`.
//
// The token source here is the single place that fetches and caches that JWT:
// - in-memory cache keyed on the JWT's `exp` claim (refresh 30s before expiry)
// - single-flight refresh (two callers racing the guard share one request)
// - `force` refresh used by the 401-retry in `@/auth/tokenSource`
//
// Sign-in / sign-out go through the Better Auth client, which keeps the
// session cookie on the app origin; the backend never sees the cookie.
import { decodeJwt } from "jose";
import { createAuthClient } from "better-auth/client";

import { isBetterAuthMode } from "@/auth/mode";

export { isBetterAuthMode };

/** Refresh the JWT this long before its `exp` so in-flight calls never 401. */
const TOKEN_REFRESH_MARGIN_MS = 30_000;

/** Response envelope of the Better Auth client (no `throw` configured). */
type AuthClientResult<T> = {
  data: T | null;
  error: Record<string, unknown> | null;
};

export type BetterAuthSessionData = {
  user: {
    id: string;
    email: string;
    /** Google profiles carry a display name; the schema allows it to be absent. */
    name?: string | null;
    image?: string | null;
  };
  session: { id: string };
};

type BetterAuthClient = ReturnType<typeof createAuthClient>;

let client: BetterAuthClient | null = null;

/** Lazily-created singleton Better Auth client (same-origin `/api/auth`). */
/**
 * Absolute base URL for the Better Auth client.
 *
 * The server runs in this app: same-origin, cookie-carrying requests to
 * /api/auth/* (see src/lib/better-auth.ts). The client validates its base
 * URL with `new URL(...)` (http/https protocol required), so a relative
 * "/api/auth" throws BetterAuthError before any request is made. In the
 * browser we therefore hand it the absolute origin URL; on the server
 * (no `window`) no consumer creates the client, but the localhost
 * fallback keeps the constructor argument valid in that path.
 */
export function betterAuthClientBaseUrl(): string {
  return typeof window === "undefined"
    ? "http://localhost/api/auth"
    : `${window.location.origin}/api/auth`;
}

export function getBetterAuthClient(): BetterAuthClient {
  if (!client) {
    client = createAuthClient({ baseURL: betterAuthClientBaseUrl() });
  }
  return client;
}

type CachedToken = {
  token: string;
  /** Epoch ms from the JWT `exp` claim; null when the claim is absent. */
  expiresAtMs: number | null;
};

let cached: CachedToken | null = null;
let inflightRefresh: Promise<string | null> | null = null;

function jwtExpiresAtMs(token: string): number | null {
  try {
    const payload = decodeJwt(token);
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function resetBetterAuthTokenCache(): void {
  cached = null;
}

/**
 * Return the current Better Auth JWT, refreshing it when it is (or is about
 * to be) expired. Single-flight: concurrent callers share one refresh.
 * Returns null when there is no session (not signed in / server 5xx).
 */
export async function getBetterAuthToken(options?: {
  force?: boolean;
}): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  const now = Date.now();
  if (
    !options?.force &&
    cached &&
    (cached.expiresAtMs === null ||
      cached.expiresAtMs - now > TOKEN_REFRESH_MARGIN_MS)
  ) {
    return cached.token;
  }
  if (inflightRefresh) {
    return inflightRefresh;
  }
  inflightRefresh = (async () => {
    try {
      // The jwt plugin publishes the session JWT at GET /token on the
      // Better Auth origin. The vanilla client's dynamic proxy would kebab-case
      // an invented `getToken()` call into /get-token (404), so call the
      // exact route through the client's typed $fetch (cookie-carrying).
      const result = await getBetterAuthClient().$fetch<{ token: string }>(
        "/token",
      );
      if (result.error) {
        return null;
      }
      const token = result.data?.token;
      if (!token) {
        return null;
      }
      cached = { token, expiresAtMs: jwtExpiresAtMs(token) };
      return token;
    } catch {
      // No session / network failure: callers surface the missing credential
      // instead of looping.
      return null;
    } finally {
      inflightRefresh = null;
    }
  })();
  return inflightRefresh;
}

/**
 * Current Better Auth session (from the cookie on this origin), or null when
 * signed out. Errors (no session, server 5xx) also read as signed out — the
 * sign-in gate is shown, which is the correct surface for all of those.
 */
export async function fetchBetterAuthSession(): Promise<BetterAuthSessionData | null> {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const result = (await getBetterAuthClient().getSession(
      undefined,
    )) as unknown as AuthClientResult<BetterAuthSessionData>;
    return result?.data ?? null;
  } catch {
    return null;
  }
}

/** Start the Google OAuth flow in the browser. Better Auth redirects to Google and back. */
export function signInWithGoogle(callbackUrl?: string): Promise<unknown> {
  const callbackURL = callbackUrl || undefined;
  return getBetterAuthClient().signIn.social({
    provider: "google",
    // Landing point after the OAuth round-trip (Better Auth issues the final
    // redirect to it once the session cookie is set).
    callbackURL,
  });
}

/** End the session server-side (cookie cleared) and drop the cached JWT. */
export async function signOutBetterAuth(): Promise<void> {
  resetBetterAuthTokenCache();
  if (typeof window === "undefined") {
    return;
  }
  try {
    await getBetterAuthClient().signOut();
  } catch {
    // Unreachable server: the local cache is already cleared and the session
    // cookie still expires on its own server-side.
  }
}
