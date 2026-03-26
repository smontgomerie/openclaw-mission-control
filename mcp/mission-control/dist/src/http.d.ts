import type { MissionControlConfig } from "./config.js";
export declare class MissionControlApiError extends Error {
    status: number;
    detail: unknown;
    constructor(status: number, message: string, detail: unknown);
}
type FetchLike = typeof fetch;
export declare function createAuthenticatedFetch(config: MissionControlConfig, fetchImpl?: FetchLike): FetchLike;
export declare function readApiResponse<T>(response: Response): Promise<T>;
export {};
