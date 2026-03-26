import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import PortfolioPage from "./page";

const fetchPortfolioPositionsMock = vi.hoisted(() => vi.fn());
const fetchPortfolioPositionDetailMock = vi.hoisted(() => vi.fn());
const fetchPortfolioReviewsMock = vi.hoisted(() => vi.fn());
const syncPortfolioNowMock = vi.hoisted(() => vi.fn());
const updatePortfolioRationaleMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/clerk", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

vi.mock("@/lib/use-organization-membership", () => ({
  useOrganizationMembership: () => ({ isAdmin: true }),
}));

vi.mock("@/components/templates/DashboardPageLayout", () => ({
  DashboardPageLayout: ({
    title,
    description,
    children,
  }: React.PropsWithChildren<{ title: string; description: string }>) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock("@/components/atoms/Markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: React.PropsWithChildren<{ onClick?: () => void; disabled?: boolean }>) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({
    id,
    value,
    onChange,
    placeholder,
  }: {
    id?: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
  }) => <input id={id} value={value} onChange={onChange} placeholder={placeholder} />,
}));

vi.mock("@/components/ui/textarea", () => ({
  Textarea: ({
    id,
    value,
    onChange,
  }: {
    id?: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  }) => <textarea id={id} value={value} onChange={onChange} />,
}));

vi.mock("@/lib/portfolio", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/portfolio")>("@/lib/portfolio");
  return {
    ...actual,
    fetchPortfolioPositions: fetchPortfolioPositionsMock,
    fetchPortfolioPositionDetail: fetchPortfolioPositionDetailMock,
    fetchPortfolioReviews: fetchPortfolioReviewsMock,
    syncPortfolioNow: syncPortfolioNowMock,
    updatePortfolioRationale: updatePortfolioRationaleMock,
  };
});

describe("PortfolioPage", () => {
  beforeEach(() => {
    fetchPortfolioPositionsMock.mockReset();
    fetchPortfolioPositionDetailMock.mockReset();
    fetchPortfolioReviewsMock.mockReset();
    syncPortfolioNowMock.mockReset();
    updatePortfolioRationaleMock.mockReset();
  });

  it("renders positions and latest review details", async () => {
    fetchPortfolioPositionsMock.mockResolvedValue([
      {
        position_key: "AAPL-put-180-2026-04-17",
        ticker: "AAPL",
        strategy: "csp",
        expiration: "2026-04-17",
        unrealized_pnl_pct: 52.3,
        dte: 28,
        needs_rationale: true,
        latest_flags: [{ code: "profit_target_hit", headline: "50% premium captured" }],
      },
    ]);
    fetchPortfolioReviewsMock.mockResolvedValue([
      {
        id: "2026-03-20",
        position_keys: ["AAPL-put-180-2026-04-17"],
        actions: [],
        summary_markdown: "# Action now\n\n- Close early.",
      },
    ]);
    fetchPortfolioPositionDetailMock.mockResolvedValue({
      position_key: "AAPL-put-180-2026-04-17",
      ticker: "AAPL",
      strategy: "csp",
      expiration: "2026-04-17",
      unrealized_pnl_pct: 52.3,
      dte: 28,
      needs_rationale: true,
      latest_flags: [{ code: "profit_target_hit", headline: "50% premium captured" }],
      rationale_history: [],
      latest_review_id: "2026-03-20",
      latest_review_summary_markdown: "# Action now\n\n- Close early.",
      rationale: null,
    });

    render(<PortfolioPage />);

    await waitFor(() => {
      expect(fetchPortfolioPositionDetailMock).toHaveBeenCalledWith(
        "AAPL-put-180-2026-04-17",
      );
    });

    expect(screen.getAllByText("50% premium captured")).toHaveLength(2);
    expect(screen.getByText("Needs why")).toBeTruthy();
    expect(screen.getByText("# Action now", { exact: false })).toBeTruthy();
  });

  it("saves rationale updates", async () => {
    fetchPortfolioPositionsMock.mockResolvedValue([
      {
        position_key: "AAPL-put-180-2026-04-17",
        ticker: "AAPL",
        strategy: "csp",
        expiration: "2026-04-17",
        needs_rationale: true,
        latest_flags: [],
      },
    ]);
    fetchPortfolioReviewsMock.mockResolvedValue([]);
    fetchPortfolioPositionDetailMock.mockResolvedValue({
      position_key: "AAPL-put-180-2026-04-17",
      ticker: "AAPL",
      strategy: "csp",
      expiration: "2026-04-17",
      needs_rationale: true,
      latest_flags: [],
      rationale_history: [],
      latest_review_summary_markdown: null,
      rationale: null,
    });
    updatePortfolioRationaleMock.mockResolvedValue({
      position_key: "AAPL-put-180-2026-04-17",
      ticker: "AAPL",
      strategy: "wheel",
      expiration: "2026-04-17",
      needs_rationale: false,
      latest_flags: [],
      rationale_history: [],
      latest_review_summary_markdown: null,
      rationale: {
        strategy: "wheel",
        why: "Support held",
        tags: ["wheel"],
        updated_at: "2026-03-20T15:00:00Z",
      },
    });

    render(<PortfolioPage />);

    await waitFor(() => {
      expect(screen.getByText("Save rationale")).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText("wheel / csp / covered_call"), {
      target: { value: "wheel" },
    });
    fireEvent.change(screen.getByPlaceholderText("income, wheel, high-conviction"), {
      target: { value: "wheel" },
    });
    fireEvent.change(screen.getByLabelText("Why this trade"), {
      target: { value: "Support held" },
    });
    fireEvent.click(screen.getByText("Save rationale"));

    await waitFor(() => {
      expect(updatePortfolioRationaleMock).toHaveBeenCalledWith(
        "AAPL-put-180-2026-04-17",
        expect.objectContaining({
          strategy: "wheel",
          why: "Support held",
          tags: ["wheel"],
        }),
      );
    });

    expect(screen.getByText("Rationale saved.")).toBeTruthy();
  });

  it("queues a sync and reloads portfolio data", async () => {
    fetchPortfolioPositionsMock
      .mockResolvedValueOnce([
        {
          position_key: "AAPL-put-180-2026-04-17",
          ticker: "AAPL",
          strategy: "csp",
          expiration: "2026-04-17",
          needs_rationale: false,
          latest_flags: [],
        },
      ])
      .mockResolvedValueOnce([
        {
          position_key: "MSFT-put-380-2026-04-17",
          ticker: "MSFT",
          strategy: "csp",
          expiration: "2026-04-17",
          needs_rationale: false,
          latest_flags: [],
        },
      ]);
    fetchPortfolioReviewsMock.mockResolvedValue([]);
    fetchPortfolioPositionDetailMock
      .mockResolvedValueOnce({
        position_key: "AAPL-put-180-2026-04-17",
        ticker: "AAPL",
        strategy: "csp",
        expiration: "2026-04-17",
        needs_rationale: false,
        latest_flags: [],
        rationale_history: [],
        latest_review_summary_markdown: null,
        rationale: null,
      })
      .mockResolvedValue({
        position_key: "MSFT-put-380-2026-04-17",
        ticker: "MSFT",
        strategy: "csp",
        expiration: "2026-04-17",
        needs_rationale: false,
        latest_flags: [],
        rationale_history: [],
        latest_review_summary_markdown: null,
        rationale: null,
      });
    syncPortfolioNowMock.mockResolvedValue({
      ok: true,
      enqueued: true,
      job_id: "morning-portfolio-review",
      run_id: "run-123",
    });

    render(<PortfolioPage />);

    await waitFor(() => {
      expect(screen.getByText("Sync now")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("Sync now"));

    await waitFor(() => {
      expect(syncPortfolioNowMock).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(fetchPortfolioPositionsMock).toHaveBeenCalledTimes(2);
    });

    expect(screen.getByText("Sync queued. Latest data may take a few seconds to appear.")).toBeTruthy();
  });
});
