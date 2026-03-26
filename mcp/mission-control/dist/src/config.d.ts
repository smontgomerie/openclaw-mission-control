export type MissionControlConfig = {
    baseUrl: string;
    token: string;
    timeoutMs: number;
};
export declare function loadConfig(env?: NodeJS.ProcessEnv): MissionControlConfig;
export declare const defaultConfig: () => MissionControlConfig;
