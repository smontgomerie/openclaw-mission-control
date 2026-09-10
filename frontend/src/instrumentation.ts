import {
  BetterAuthConfigError,
  requireCoreBetterAuthEnv,
} from "@/lib/better-auth";

/**
 * Runs once when the Next.js server starts (nodejs runtime only; not during
 * `next build`). Better Auth config is validated here and logged loudly so a
 * missing/placeholder BETTER_AUTH_* var is visible at boot. We log rather
 * than throw: the local dev flow must keep working without these vars, and
 * the `/api/auth/*` routes fail fast on their own (see `getAuth()` in
 * `src/lib/better-auth.ts`).
 */
export function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  try {
    requireCoreBetterAuthEnv(process.env);
  } catch (err) {
    if (err instanceof BetterAuthConfigError) {
      console.error(
        `[better-auth] ${err.message} /api/auth/* routes will 500 until the config is valid; see docs/reference/authentication.md.`,
      );
      return;
    }
    throw err;
  }
  console.log("[better-auth] config valid; /api/auth/* ready.");
}
