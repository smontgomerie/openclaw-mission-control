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
export declare function loadConfig(env?: NodeJS.ProcessEnv): MissionControlConfig;
/**
 * Load from `process.env`, throwing with the same messages as
 * `loadConfig(process.env)`.
 */
export declare const defaultConfig: () => MissionControlConfig;
