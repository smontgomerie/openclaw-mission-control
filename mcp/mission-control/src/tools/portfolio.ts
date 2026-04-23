import { z } from "zod";

import type { MissionControlConfig } from "../config.js";
import { createAuthenticatedFetch, readApiResponse } from "../http.js";
import type {
  PortfolioPosition,
  PortfolioPositionDetail,
  PortfolioRationaleUpdate,
  PortfolioReview,
  PortfolioSyncResult,
} from "../types.js";

export const listPositionsInputSchema = {
  ticker: z.string().trim().min(1).optional(),
  needs_rationale: z.boolean().optional(),
  flagged_only: z.boolean().optional(),
};

export const getPositionInputSchema = {
  position_key: z.string().trim().min(1),
};

export const saveRationaleInputSchema = {
  position_key: z.string().trim().min(1),
  strategy: z.string().trim().min(1).optional(),
  why: z.string().trim().min(1).optional(),
  entry_plan: z.string().trim().min(1).optional(),
  profit_take_plan: z.string().trim().min(1).optional(),
  risk_plan: z.string().trim().min(1).optional(),
  roll_or_reopen_plan: z.string().trim().min(1).optional(),
  tags: z.array(z.string().trim().min(1)).default([]),
};

export const listReviewsInputSchema = {
  position_key: z.string().trim().min(1).optional(),
  limit: z.number().int().positive().max(100).optional(),
};

export const undoRollInputSchema = {
  event_id: z.string().uuid(),
};

export async function portfolioListPositions(
  config: MissionControlConfig,
  input: {
    ticker?: string;
    needs_rationale?: boolean;
    flagged_only?: boolean;
  },
): Promise<PortfolioPosition[]> {
  const authFetch = createAuthenticatedFetch(config);
  const response = await authFetch(`${config.baseUrl}/api/v1/portfolio/positions`, {
    method: "GET",
  });
  const positions = await readApiResponse<PortfolioPosition[]>(response);

  return positions.filter((position) => {
    if (input.ticker && position.ticker.toLowerCase() !== input.ticker.toLowerCase()) {
      return false;
    }
    if (input.needs_rationale !== undefined && Boolean(position.needs_rationale) !== input.needs_rationale) {
      return false;
    }
    if (input.flagged_only && !(position.latest_flags?.length ?? 0)) {
      return false;
    }
    return true;
  });
}

export async function portfolioGetPosition(
  config: MissionControlConfig,
  input: { position_key: string },
): Promise<PortfolioPositionDetail> {
  const authFetch = createAuthenticatedFetch(config);
  const response = await authFetch(
    `${config.baseUrl}/api/v1/portfolio/positions/${encodeURIComponent(input.position_key)}`,
    {
      method: "GET",
    },
  );
  return readApiResponse<PortfolioPositionDetail>(response);
}

export async function portfolioSaveRationale(
  config: MissionControlConfig,
  input: {
    position_key: string;
    strategy?: string;
    why?: string;
    entry_plan?: string;
    profit_take_plan?: string;
    risk_plan?: string;
    roll_or_reopen_plan?: string;
    tags?: string[];
  },
): Promise<PortfolioPositionDetail> {
  const authFetch = createAuthenticatedFetch(config);
  const payload: PortfolioRationaleUpdate = {
    strategy: input.strategy,
    why: input.why,
    entry_plan: input.entry_plan,
    profit_take_plan: input.profit_take_plan,
    risk_plan: input.risk_plan,
    roll_or_reopen_plan: input.roll_or_reopen_plan,
    tags: input.tags ?? [],
  };
  const response = await authFetch(
    `${config.baseUrl}/api/v1/portfolio/positions/${encodeURIComponent(input.position_key)}/rationale`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
  return readApiResponse<PortfolioPositionDetail>(response);
}

export async function portfolioListReviews(
  config: MissionControlConfig,
  input: {
    position_key?: string;
    limit?: number;
  },
): Promise<PortfolioReview[]> {
  const authFetch = createAuthenticatedFetch(config);
  const response = await authFetch(`${config.baseUrl}/api/v1/portfolio/reviews`, {
    method: "GET",
  });
  const reviews = await readApiResponse<PortfolioReview[]>(response);
  const filtered = input.position_key
    ? reviews.filter((review) => (review.position_keys ?? []).includes(input.position_key!))
    : reviews;
  return input.limit ? filtered.slice(0, input.limit) : filtered;
}

export async function portfolioSyncNow(config: MissionControlConfig): Promise<PortfolioSyncResult> {
  const authFetch = createAuthenticatedFetch(config);
  const response = await authFetch(`${config.baseUrl}/api/v1/portfolio/sync`, {
    method: "POST",
  });
  return readApiResponse<PortfolioSyncResult>(response);
}

export async function portfolioUndoRoll(
  config: MissionControlConfig,
  input: { event_id: string },
): Promise<void> {
  const authFetch = createAuthenticatedFetch(config);
  const response = await authFetch(
    `${config.baseUrl}/api/v1/portfolio/roll-events/${encodeURIComponent(input.event_id)}/undo`,
    { method: "POST" },
  );
  await readApiResponse<void>(response);
}
