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
 */
/** Refresh the exchanged JWT this long before its `exp` so in-flight calls never 401. */
const EXCHANGE_REFRESH_MARGIN_MS = 30_000;
let cached = null;
let inflight = null;
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
 * Drop the cached JWT (and any in-flight exchange). A 401 on a
 * key-authenticated call forces one re-exchange. A reset racing an
 * in-flight exchange is safe: the exchange is idempotent (same key,
 * server mints a fresh JWT) and no shared state is mutated.
 */
export function resetApiKeyJwtCache() {
    cached = null;
    inflight = null;
}
/**
 * Return a valid exchanged JWT for this config, exchanging when the cache
 * is empty or inside the refresh margin. Single-flight: racing callers
 * share one exchange. Returns null when the key is not configured, the
 * Better Auth origin refuses the key, or it is unreachable.
 */
export async function getApiKeyJwt(config, options) {
    const apiKey = config.apiKey;
    const betterAuthUrl = config.betterAuthUrl;
    if (!apiKey || !betterAuthUrl) {
        return null;
    }
    if (!options?.force &&
        cached &&
        (cached.expiresAtMs === null ||
            cached.expiresAtMs - Date.now() > EXCHANGE_REFRESH_MARGIN_MS)) {
        return cached.token;
    }
    if (inflight) {
        return inflight;
    }
    inflight = (async () => {
        try {
            const url = `${betterAuthUrl.replace(/\/+$/, "")}/api/auth/token`;
            const res = await fetch(url, { headers: { "x-api-key": apiKey } });
            if (!res.ok) {
                return null;
            }
            const body = (await res.json());
            const token = body.token;
            if (!token) {
                return null;
            }
            cached = { token, expiresAtMs: jwtExpiresAtMs(token) };
            return token;
        }
        catch {
            return null;
        }
        finally {
            inflight = null;
        }
    })();
    return inflight;
}
