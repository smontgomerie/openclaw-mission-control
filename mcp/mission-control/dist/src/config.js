const DEFAULT_TIMEOUT_MS = 10_000;
function requireEnv(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required.`);
    }
    return value;
}
function readTimeoutMs() {
    const raw = process.env.MISSION_CONTROL_TIMEOUT_MS?.trim();
    if (!raw) {
        return DEFAULT_TIMEOUT_MS;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        throw new Error("MISSION_CONTROL_TIMEOUT_MS must be a positive integer.");
    }
    return parsed;
}
export function loadConfig(env = process.env) {
    const baseUrl = env.MISSION_CONTROL_BASE_URL?.trim();
    const token = env.MISSION_CONTROL_TOKEN?.trim();
    const timeoutRaw = env.MISSION_CONTROL_TIMEOUT_MS?.trim();
    if (!baseUrl) {
        throw new Error("MISSION_CONTROL_BASE_URL is required.");
    }
    if (!token) {
        throw new Error("MISSION_CONTROL_TOKEN is required.");
    }
    let timeoutMs = DEFAULT_TIMEOUT_MS;
    if (timeoutRaw) {
        const parsed = Number.parseInt(timeoutRaw, 10);
        if (!Number.isFinite(parsed) || parsed <= 0) {
            throw new Error("MISSION_CONTROL_TIMEOUT_MS must be a positive integer.");
        }
        timeoutMs = parsed;
    }
    return {
        baseUrl: baseUrl.replace(/\/+$/, ""),
        token,
        timeoutMs,
    };
}
export const defaultConfig = () => ({
    baseUrl: requireEnv("MISSION_CONTROL_BASE_URL").replace(/\/+$/, ""),
    token: requireEnv("MISSION_CONTROL_TOKEN"),
    timeoutMs: readTimeoutMs(),
});
