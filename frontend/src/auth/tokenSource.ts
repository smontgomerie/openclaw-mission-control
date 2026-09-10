"use client";

// Mode-aware credential attachment — the single chokepoint every Orval call
// (and SSE stream) flows through via `authenticatedFetch` in
// `src/api/mutator.ts`.
//
// - betterauth: Better Auth JWT, cached + auto-refreshed (see `betterAuth.ts`);
//   a 401 that arrives with a stale attached token forces one refresh + one
//   retry, so streams and long-running calls outliving the 15-minute JWT
//   lifetime reconnect with a fresh credential instead of surfacing a 401.
// - local: the pasted token from sessionStorage (unchanged).
import { getBetterAuthToken, isBetterAuthMode } from "@/auth/betterAuth";
import { getLocalAuthToken, isLocalAuthMode } from "@/auth/localAuth";

/** Pick the bearer token for the active auth mode (null when none available). */
export async function resolveBearerToken(): Promise<string | null> {
  if (isBetterAuthMode()) {
    return getBetterAuthToken();
  }
  if (isLocalAuthMode()) {
    return getLocalAuthToken();
  }
  // No known mode: nothing to attach.
  return null;
}

/**
 * Fetch with the active-mode bearer token attached (unless the caller set
 * `Authorization` explicitly). In betterauth mode only: when the response is
 * a 401 for a stale attached token, force one token refresh and retry once.
 * A 401 with no session to refresh from is returned as-is.
 */
export async function fetchWithAuth(
  url: string,
  options: RequestInit,
  fetchImpl?: typeof fetch,
): Promise<Response> {
  const impl = fetchImpl ?? fetch;
  const headers = new Headers(options.headers);
  let attachedToken: string | null = null;
  if (!headers.has("Authorization")) {
    attachedToken = await resolveBearerToken();
    if (attachedToken) {
      headers.set("Authorization", `Bearer ${attachedToken}`);
    }
  }

  let response = await impl(url, { ...options, headers });

  if (isBetterAuthMode() && response.status === 401 && attachedToken) {
    const refreshed = await getBetterAuthToken({ force: true });
    if (refreshed && refreshed !== attachedToken) {
      const retriedHeaders = new Headers(headers);
      retriedHeaders.set("Authorization", `Bearer ${refreshed}`);
      response = await impl(url, { ...options, headers: retriedHeaders });
    }
  }

  return response;
}
