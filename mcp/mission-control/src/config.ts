const DEFAULT_TIMEOUT_MS = 10_000;

export type MissionControlConfig = {
  baseUrl: string;
  /**
   * Bearer credential for token mode: the shared local-auth token, or any
   * operator-issued bearer token. Optional when key mode is configured.
   */
  token?: string;
  /** Better Auth API key (mc_...) for key mode; takes precedence over `token`. */
  apiKey?: string;
  /**
   * Better Auth app origin (e.g. http://localhost:3000) for key mode. The
   * client exchanges the key for a short-lived session JWT at
   * `${betterAuthUrl}/api/auth/token` and calls the backend with that JWT.
   */
  betterAuthUrl?: string;
  timeoutMs: number;
};

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
): MissionControlConfig {
  const baseUrl = env.MISSION_CONTROL_BASE_URL?.trim();
  const token = env.MISSION_CONTROL_TOKEN?.trim();
  const timeoutRaw = env.MISSION_CONTROL_TIMEOUT_MS?.trim();

  if (!baseUrl) {
    throw new Error("MISSION_CONTROL_BASE_URL is required.");
  }
  const apiKey = env.MISSION_CONTROL_API_KEY?.trim();
  const betterAuthUrl = env.MISSION_CONTROL_BETTER_AUTH_URL?.trim();
  if (apiKey && !betterAuthUrl) {
    throw new Error(
      "MISSION_CONTROL_BETTER_AUTH_URL is required when MISSION_CONTROL_API_KEY is set.",
    );
  }
  if (!apiKey && !token) {
    throw new Error(
      "MISSION_CONTROL_TOKEN is required (or set MISSION_CONTROL_API_KEY + MISSION_CONTROL_BETTER_AUTH_URL for API-key auth).",
    );
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
    token: token || undefined,
    apiKey: apiKey || undefined,
    betterAuthUrl: betterAuthUrl
      ? betterAuthUrl.replace(/\/+$/, "")
      : undefined,
    timeoutMs,
  };
}

/**
 * Load from `process.env`, throwing with the same messages as
 * `loadConfig(process.env)`.
 */
export const defaultConfig = (): MissionControlConfig => loadConfig();
