import { describe, expect, it } from "vitest";

import {
  formatPortfolioTags,
  matchesPortfolioPositionSearch,
  parsePortfolioTags,
  sortPortfolioPositions,
  type PortfolioPosition,
} from "./portfolio";

describe("portfolio helpers", () => {
  it("matches positions by ticker, strategy, and flags", () => {
    const position: PortfolioPosition = {
      position_key: "AAPL-put-180-2026-04-17",
      ticker: "AAPL",
      strategy: "csp",
      latest_flags: [
        {
          code: "profit_target_hit",
          headline: "50% premium captured",
        },
      ],
    };

    expect(matchesPortfolioPositionSearch(position, "aapl")).toBe(true);
    expect(matchesPortfolioPositionSearch(position, "csp")).toBe(true);
    expect(matchesPortfolioPositionSearch(position, "premium")).toBe(true);
    expect(matchesPortfolioPositionSearch(position, "msft")).toBe(false);
  });

  it("sorts missing-rationale and flagged positions first", () => {
    const positions: PortfolioPosition[] = [
      {
        position_key: "later",
        ticker: "MSFT",
        latest_flags: [],
      },
      {
        position_key: "flagged",
        ticker: "AAPL",
        latest_flags: [{ code: "watch", headline: "Watch" }],
      },
      {
        position_key: "needs-why",
        ticker: "GOOG",
        needs_rationale: true,
        latest_flags: [],
      },
    ];

    expect(sortPortfolioPositions(positions).map((item) => item.position_key)).toEqual([
      "needs-why",
      "flagged",
      "later",
    ]);
  });

  it("parses and formats comma-separated tags", () => {
    expect(parsePortfolioTags("wheel, income,  apple ")).toEqual([
      "wheel",
      "income",
      "apple",
    ]);
    expect(formatPortfolioTags(["wheel", "income"])).toBe("wheel, income");
  });
});
