import { customFetch } from "@/api/mutator";

export type PortfolioReviewAction = {
  code: string;
  severity?: string;
  headline: string;
  summary?: string | null;
  recommendation?: string | null;
};

export type PortfolioRationale = {
  position_key?: string | null;
  strategy?: string | null;
  why?: string | null;
  entry_plan?: string | null;
  profit_take_plan?: string | null;
  risk_plan?: string | null;
  roll_or_reopen_plan?: string | null;
  tags: string[];
  updated_at?: string | null;
};

export type PortfolioPosition = {
  position_key: string;
  as_of?: string | null;
  source_row_ref?: string | null;
  ticker: string;
  instrument_type?: string | null;
  strategy?: string | null;
  option_side?: string | null;
  quantity?: number | null;
  expiration?: string | null;
  strike?: number | null;
  cost_basis?: number | null;
  mark?: number | null;
  unrealized_pnl?: number | null;
  unrealized_pnl_pct?: number | null;
  dte?: number | null;
  status?: string | null;
  latest_flags: PortfolioReviewAction[];
  needs_rationale?: boolean;
  rationale_updated_at?: string | null;
};

export type PortfolioPositionDetail = PortfolioPosition & {
  rationale?: PortfolioRationale | null;
  rationale_history: PortfolioRationale[];
  latest_review_id?: string | null;
  latest_review_summary_markdown?: string | null;
};

export type PortfolioReview = {
  id: string;
  date?: string | null;
  generated_at?: string | null;
  summary_markdown?: string | null;
  actions: PortfolioReviewAction[];
  position_keys: string[];
};

export type PortfolioSyncResult = {
  ok: boolean;
  enqueued: boolean;
  job_id: string;
  run_id?: string | null;
};

export type PortfolioRationaleUpdate = {
  strategy?: string | null;
  why?: string | null;
  entry_plan?: string | null;
  profit_take_plan?: string | null;
  risk_plan?: string | null;
  roll_or_reopen_plan?: string | null;
  tags: string[];
};

export async function fetchPortfolioPositions(): Promise<PortfolioPosition[]> {
  const response = await customFetch<{ data: PortfolioPosition[] }>(
    "/api/v1/portfolio/positions",
    { method: "GET" },
  );
  return sortPortfolioPositions(response.data);
}

export async function fetchPortfolioPositionDetail(
  positionKey: string,
): Promise<PortfolioPositionDetail> {
  const response = await customFetch<{ data: PortfolioPositionDetail }>(
    `/api/v1/portfolio/positions/${encodeURIComponent(positionKey)}`,
    { method: "GET" },
  );
  return response.data;
}

export async function fetchPortfolioReviews(): Promise<PortfolioReview[]> {
  const response = await customFetch<{ data: PortfolioReview[] }>(
    "/api/v1/portfolio/reviews",
    { method: "GET" },
  );
  return response.data;
}

export async function updatePortfolioRationale(
  positionKey: string,
  payload: PortfolioRationaleUpdate,
): Promise<PortfolioPositionDetail> {
  const response = await customFetch<{ data: PortfolioPositionDetail }>(
    `/api/v1/portfolio/positions/${encodeURIComponent(positionKey)}/rationale`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function syncPortfolioNow(): Promise<PortfolioSyncResult> {
  const response = await customFetch<{ data: PortfolioSyncResult }>("/api/v1/portfolio/sync", {
    method: "POST",
  });
  return response.data;
}

export function matchesPortfolioPositionSearch(
  position: PortfolioPosition,
  searchTerm: string,
): boolean {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return true;
  return [
    position.ticker,
    position.position_key,
    position.strategy ?? "",
    position.option_side ?? "",
    position.status ?? "",
    ...(position.latest_flags ?? []).map((flag) => `${flag.code} ${flag.headline}`),
  ].some((value) => value.toLowerCase().includes(normalized));
}

export function sortPortfolioPositions(
  positions: PortfolioPosition[],
): PortfolioPosition[] {
  return [...positions].sort((left, right) => {
    const leftScore = Number(Boolean(left.needs_rationale)) * 10 + Number(Boolean(left.latest_flags?.length));
    const rightScore =
      Number(Boolean(right.needs_rationale)) * 10 + Number(Boolean(right.latest_flags?.length));
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
    const tickerCompare = left.ticker.localeCompare(right.ticker);
    if (tickerCompare !== 0) return tickerCompare;
    return left.position_key.localeCompare(right.position_key);
  });
}

export function parsePortfolioTags(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function formatPortfolioTags(tags: string[] | null | undefined): string {
  return (tags ?? []).join(", ");
}
