import { z } from "zod";
import type { MissionControlConfig } from "../config.js";
import type { PortfolioPosition, PortfolioPositionDetail, PortfolioReview, PortfolioSyncResult } from "../types.js";
export declare const listPositionsInputSchema: {
    ticker: z.ZodOptional<z.ZodString>;
    needs_rationale: z.ZodOptional<z.ZodBoolean>;
    flagged_only: z.ZodOptional<z.ZodBoolean>;
};
export declare const getPositionInputSchema: {
    position_key: z.ZodString;
};
export declare const saveRationaleInputSchema: {
    position_key: z.ZodString;
    strategy: z.ZodOptional<z.ZodString>;
    why: z.ZodOptional<z.ZodString>;
    entry_plan: z.ZodOptional<z.ZodString>;
    profit_take_plan: z.ZodOptional<z.ZodString>;
    risk_plan: z.ZodOptional<z.ZodString>;
    roll_or_reopen_plan: z.ZodOptional<z.ZodString>;
    tags: z.ZodDefault<z.ZodArray<z.ZodString>>;
};
export declare const listReviewsInputSchema: {
    position_key: z.ZodOptional<z.ZodString>;
    limit: z.ZodOptional<z.ZodNumber>;
};
export declare function portfolioListPositions(config: MissionControlConfig, input: {
    ticker?: string;
    needs_rationale?: boolean;
    flagged_only?: boolean;
}): Promise<PortfolioPosition[]>;
export declare function portfolioGetPosition(config: MissionControlConfig, input: {
    position_key: string;
}): Promise<PortfolioPositionDetail>;
export declare function portfolioSaveRationale(config: MissionControlConfig, input: {
    position_key: string;
    strategy?: string;
    why?: string;
    entry_plan?: string;
    profit_take_plan?: string;
    risk_plan?: string;
    roll_or_reopen_plan?: string;
    tags?: string[];
}): Promise<PortfolioPositionDetail>;
export declare function portfolioListReviews(config: MissionControlConfig, input: {
    position_key?: string;
    limit?: number;
}): Promise<PortfolioReview[]>;
export declare function portfolioSyncNow(config: MissionControlConfig): Promise<PortfolioSyncResult>;
