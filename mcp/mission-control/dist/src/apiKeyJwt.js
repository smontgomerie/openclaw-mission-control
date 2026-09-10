/**
 * Exchange a Better Auth API key for a short-lived session JWT.
 *
 * The key is verified by Better Auth (Next.js origin), which mints a
 * session JWT (15-minute expiry) at GET `${betterAuthUrl}/api/auth/token`
 * when the request carries the `x-api-key` header. The FastAPI backend
 * verifies that JWT against JWKS, so no credential ever travels directly
 * to the backend.
 *
 * The exchanged JWT is cached in-process for its lifetime (minus a 30s
 * refresh margin) so long-lived MCP servers exchange at most once per
 * ~15 minutes. Revocation is therefore effective within one JWT lifetime;
 * a refused exchange (revoked/expired key) yields null and the caller's
 * next request surfaces as a 401 / exchange failure.
 *
 * Caching is per (API key, origin): one process can serve several
 * Mission Control configs with different keys, and each key's exchanged
 * JWT and in-flight exchange is stored under its own entry, so two keys
 * never overwrite each other's credentials.
 */
/** Refresh the exchanged JWT this long before its `exp` so in-flight calls never 401. */
const EXCHANGE_REFRESH_MARGIN_MS = 30_000;
const cached = new Map();
const inflight = new Map();
/**
 * Bumped on every reset. An exchange that started before a reset must not
 * write its (now stale) JWT back into the cache or touch the maps it no
 * longer owns — a slow pre-reset exchange resolving after a post-reset one
 * would otherwise clobber the newer entry.
 */
let generation = 0;
/** Two configs with the same key pointed at different origins get different exchanges. */
function storageKey(apiKey, betterAuthUrl) {
    return `${betterAuthUrl.replace(/\/+$/, "")}\u0000${apiKey}`;
}
/**
 * Read `exp` from the JWT payload without verifying the signature: the
 * value only decides when to re-exchange — the backend is what verifies
 * the signature against JWKS.
 */
function jwtExpiresAtMs(token) {
    const payload = token.split(".")[1];
    if (!payload) {
        return null;
    }
    try {
        const json = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
        return typeof json.exp === "number" ? json.exp * 1000 : null;
    }
    catch {
        return null;
    }
}
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
export function resetApiKeyJwtCache() {
    cached.clear();
    inflight.clear();
    generation += 1;
}
/**
 * Return a valid exchanged JWT for this config's API key, exchanging
 * when the per-key cache is empty or inside the refresh margin.
 * Single-flight per key: racing callers with the same key share one
 * exchange; different keys exchange independently. Returns null when
 * the key is not configured, the Better Auth origin refuses the key,
 * or it is unreachable.
 */
export async function getApiKeyJwt(config, options) {
    const apiKey = config.apiKey;
    const betterAuthUrl = config.betterAuthUrl;
    if (!apiKey || !betterAuthUrl) {
        return null;
    }
    const key = storageKey(apiKey, betterAuthUrl);
    if (!options?.force) {
        const entry = cached.get(key);
        if (entry &&
            (entry.expiresAtMs === null ||
                entry.expiresAtMs - Date.now() > EXCHANGE_REFRESH_MARGIN_MS)) {
            return entry.token;
        }
    }
    const existing = inflight.get(key);
    if (existing) {
        return existing;
    }
    const startedGeneration = generation;
    const exchange = (async () => {
        try {
            const url = `${betterAuthUrl.replace(/\/+$/, "")}/api/auth/token`;
            const res = await fetch(url, { headers: { "x-api-key": apiKey } });
            if (!res.ok) {
                return null;
            }
            const body = (await res.json());
            const token = body.token;
            if (token) {
                // Only the current generation owns the maps: a reset that happened
                // mid-flight has already started (or will start) its own exchange.
                if (generation === startedGeneration) {
                    cached.set(key, { token, expiresAtMs: jwtExpiresAtMs(token) });
                }
                return token;
            }
            return null;
        }
        catch {
            return null;
        }
        finally {
            if (generation === startedGeneration) {
                inflight.delete(key);
            }
        }
    })();
    inflight.set(key, exchange);
    return exchange;
}
