const DEFAULT_SIGN_IN_REDIRECT = "/onboarding";

function isSafeRelativePath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//");
}

/** True for the dedicated sign-in route (with or without query/hash). */
export function isSignInPath(value: string): boolean {
  const path = value.split(/[?#]/, 1)[0] ?? value;
  return path === "/sign-in" || path.startsWith("/sign-in/");
}

export function resolveSignInRedirectUrl(rawRedirect: string | null): string {
  const fallback =
    process.env.NEXT_PUBLIC_SIGN_IN_FALLBACK_REDIRECT_URL ??
    DEFAULT_SIGN_IN_REDIRECT;

  if (!rawRedirect) return fallback;

  // Landing back on /sign-in after OAuth looks like a failed login even when
  // the session cookie was set. Treat it as "no destination".
  if (isSafeRelativePath(rawRedirect) && isSignInPath(rawRedirect)) {
    return fallback;
  }

  if (isSafeRelativePath(rawRedirect)) {
    return rawRedirect;
  }

  if (typeof window === "undefined") {
    return fallback;
  }

  try {
    const parsed = new URL(rawRedirect, window.location.origin);
    if (parsed.origin !== window.location.origin) {
      return fallback;
    }
    const normalized = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (isSignInPath(normalized)) {
      return fallback;
    }
    return normalized;
  } catch {
    return fallback;
  }
}

/**
 * "Where the user is" for client-side sign-in surfaces (the Better Auth
 * sign-in gate): an explicit `?redirect_url=` param wins, otherwise the
 * current page URL. Pure over the location fields so it tests without
 * `window`; the result is validated by `resolveSignInRedirectUrl`.
 */
export function currentSignInRedirectUrl(
  pathname: string,
  search: string,
): string {
  const paramRedirect = new URLSearchParams(search).get("redirect_url");
  if (paramRedirect) {
    return paramRedirect;
  }
  return pathname + search;
}

/**
 * Public origin Better Auth was configured with (JWT iss/aud + Google
 * redirect_uri). OAuth state cookies are host-bound and `__Secure-*`, so
 * starting sign-in from a different origin (e.g. http://localhost:3100 while
 * BETTER_AUTH_BASE_URL is the HTTPS Tailscale URL) drops the state cookie and
 * the callback bounces back to the login screen with `?error=UNKNOWN`.
 */
export function betterAuthCanonicalOrigin(): string | null {
  const raw = process.env.NEXT_PUBLIC_BETTER_AUTH_BASE_URL?.trim();
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * If the browser is not on the configured Better Auth origin, return the
 * absolute URL to continue on that origin (preserving path/query). Null when
 * already canonical or when the public base URL is unset.
 */
export function betterAuthCanonicalContinueUrl(
  href: string,
  canonicalOrigin: string | null = betterAuthCanonicalOrigin(),
): string | null {
  if (!canonicalOrigin || typeof window === "undefined") {
    return null;
  }
  try {
    const current = new URL(href, window.location.origin);
    if (current.origin === canonicalOrigin) {
      return null;
    }
    return `${canonicalOrigin}${current.pathname}${current.search}${current.hash}`;
  } catch {
    return null;
  }
}

/** Map Better Auth / Google `?error=` codes to a short operator-facing message. */
export function describeAuthQueryError(errorCode: string | null): string | null {
  if (!errorCode) {
    return null;
  }
  switch (errorCode) {
    case "state_not_found":
    case "state_mismatch":
    case "INVALID_STATE":
      return "Sign-in expired or started on a different URL. Use the configured HTTPS app origin and try again.";
    case "access_denied":
      return "Google sign-in was cancelled or denied.";
    case "unable_to_get_user_info":
    case "UNKNOWN":
      return "Google sign-in did not complete. Use an allowed Google Workspace account on the configured HTTPS app origin.";
    default:
      return `Google sign-in failed (${errorCode}). Try again from the configured HTTPS app origin.`;
  }
}
