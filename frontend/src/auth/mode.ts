export enum AuthMode {
  Local = "local",
  BetterAuth = "betterauth",
}

/**
 * Server-safe mode check: reads NEXT_PUBLIC_AUTH_MODE (inlined at build time
 * by Next.js for NEXT_PUBLIC_ vars). Kept in a dependency-free module so
 * both server (middleware/proxy) and client code can call it.
 */
export function isBetterAuthMode(): boolean {
  return process.env.NEXT_PUBLIC_AUTH_MODE === AuthMode.BetterAuth;
}
