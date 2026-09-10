import type { MissionControlConfig } from "./config.js";
/**
 * Drop every cached JWT and in-flight exchange. A 401 on a
 * key-authenticated call forces one re-exchange for the key that was
 * used; other keys' caches are evicted too, which costs them at most
 * one re-exchange on their next call — never a wrong credential. A
 * reset racing an in-flight exchange is safe: the in-flight exchange is
 * idempotent (same key, server mints a fresh JWT) and, once the reset
 * has happened, its late result can no longer write the cache or touch
 * the in-flight map (generation guard).
 */
export declare function resetApiKeyJwtCache(): void;
/**
 * Return a valid exchanged JWT for this config's API key, exchanging
 * when the per-key cache is empty or inside the refresh margin.
 * Single-flight per key: racing callers with the same key share one
 * exchange; different keys exchange independently. Returns null when
 * the key is not configured, the Better Auth origin refuses the key,
 * or it is unreachable.
 */
export declare function getApiKeyJwt(
  config: MissionControlConfig,
  options?: {
    force?: boolean;
  },
): Promise<string | null>;
