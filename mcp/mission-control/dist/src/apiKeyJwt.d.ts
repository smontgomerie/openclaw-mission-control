import type { MissionControlConfig } from "./config.js";
/**
 * Drop the cached JWT (and any in-flight exchange). A 401 on a
 * key-authenticated call forces one re-exchange. A reset racing an
 * in-flight exchange is safe: the exchange is idempotent (same key,
 * server mints a fresh JWT) and no shared state is mutated.
 */
export declare function resetApiKeyJwtCache(): void;
/**
 * Return a valid exchanged JWT for this config, exchanging when the cache
 * is empty or inside the refresh margin. Single-flight: racing callers
 * share one exchange. Returns null when the key is not configured, the
 * Better Auth origin refuses the key, or it is unreachable.
 */
export declare function getApiKeyJwt(config: MissionControlConfig, options?: {
    force?: boolean;
}): Promise<string | null>;
