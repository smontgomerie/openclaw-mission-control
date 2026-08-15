"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bookmark, RefreshCcw, Search, Sigma } from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { Markdown } from "@/components/atoms/Markdown";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  fetchPortfolioPositionDetail,
  fetchPortfolioPositions,
  fetchPortfolioReviews,
  fetchPortfolioRollEvents,
  formatPortfolioTags,
  matchesPortfolioPositionSearch,
  parsePortfolioTags,
  syncPortfolioNow,
  type PortfolioPosition,
  type PortfolioPositionDetail,
  type PortfolioRationaleUpdate,
  type PortfolioReview,
  type PortfolioRollEvent,
  undoPortfolioRollEvent,
  updatePortfolioRationale,
} from "@/lib/portfolio";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { cn } from "@/lib/utils";

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "—";
  return `${formatNumber(value)}%`;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

type RationaleFormState = PortfolioRationaleUpdate & {
  tagsInput: string;
};

function buildFormState(detail: PortfolioPositionDetail | null): RationaleFormState {
  const rationale = detail?.rationale;
  return {
    strategy: rationale?.strategy ?? detail?.strategy ?? "",
    why: rationale?.why ?? "",
    entry_plan: rationale?.entry_plan ?? "",
    profit_take_plan: rationale?.profit_take_plan ?? "",
    risk_plan: rationale?.risk_plan ?? "",
    roll_or_reopen_plan: rationale?.roll_or_reopen_plan ?? "",
    tags: rationale?.tags ?? [],
    tagsInput: formatPortfolioTags(rationale?.tags),
  };
}

function PositionStats({ position }: { position: PortfolioPosition }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Mark</p>
        <p className="mt-2 text-lg font-semibold text-slate-900">{formatNumber(position.mark)}</p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Unrealized P&L
        </p>
        <p className="mt-2 text-lg font-semibold text-slate-900">
          {formatNumber(position.unrealized_pnl)}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">P&L %</p>
        <p className="mt-2 text-lg font-semibold text-slate-900">
          {formatPercent(position.unrealized_pnl_pct)}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">DTE</p>
        <p className="mt-2 text-lg font-semibold text-slate-900">
          {typeof position.dte === "number" ? position.dte : "—"}
        </p>
      </div>
    </div>
  );
}

export default function PortfolioPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [positions, setPositions] = useState<PortfolioPosition[]>([]);
  const [reviews, setReviews] = useState<PortfolioReview[]>([]);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isPositionsLoading, setIsPositionsLoading] = useState(true);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSyncPending, setIsSyncPending] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<PortfolioPositionDetail | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [formState, setFormState] = useState<RationaleFormState>(buildFormState(null));
  const [reloadToken, setReloadToken] = useState(0);
  const [rollEvents, setRollEvents] = useState<PortfolioRollEvent[]>([]);
  const [rollEventsError, setRollEventsError] = useState<string | null>(null);
  const [rollUndoPendingId, setRollUndoPendingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsPositionsLoading(true);
      setPositionsError(null);

      void Promise.all([
        fetchPortfolioPositions(),
        fetchPortfolioReviews(),
        fetchPortfolioRollEvents(7).catch(() => [] as PortfolioRollEvent[]),
      ])
        .then(([nextPositions, nextReviews, nextRolls]) => {
          if (cancelled) return;
          setPositions(nextPositions);
          setReviews(nextReviews);
          setRollEvents(Array.isArray(nextRolls) ? nextRolls : []);
          setRollEventsError(null);
          setSelectedKey((current) => {
            if (current && nextPositions.some((position) => position.position_key === current)) {
              return current;
            }
            return nextPositions[0]?.position_key ?? null;
          });
          if (nextPositions.length === 0) {
            setDetail(null);
            setFormState(buildFormState(null));
          }
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message =
            error instanceof ApiError || error instanceof Error
              ? error.message
              : "Unable to load portfolio positions.";
          setPositionsError(message);
        })
        .finally(() => {
          if (!cancelled) setIsPositionsLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  useEffect(() => {
    if (!selectedKey) {
      return;
    }

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setIsDetailLoading(true);
      setDetailError(null);
      setSaveError(null);
      setSaveMessage(null);

      void fetchPortfolioPositionDetail(selectedKey)
        .then((nextDetail) => {
          if (cancelled) return;
          setDetail(nextDetail);
          setFormState(buildFormState(nextDetail));
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          const message =
            error instanceof ApiError || error instanceof Error
              ? error.message
              : "Unable to load portfolio detail.";
          setDetailError(message);
        })
        .finally(() => {
          if (!cancelled) setIsDetailLoading(false);
        });
    });

    return () => {
      cancelled = true;
    };
  }, [reloadToken, selectedKey]);

  const filteredPositions = useMemo(
    () => positions.filter((position) => matchesPortfolioPositionSearch(position, searchTerm)),
    [positions, searchTerm],
  );

  const flaggedCount = positions.filter((position) => position.latest_flags.length > 0).length;
  const missingRationaleCount = positions.filter((position) => position.needs_rationale).length;

  const handleSave = () => {
    if (!selectedKey) return;
    setSavePending(true);
    setSaveError(null);
    setSaveMessage(null);

    void updatePortfolioRationale(selectedKey, {
      strategy: formState.strategy?.trim() || null,
      why: formState.why?.trim() || null,
      entry_plan: formState.entry_plan?.trim() || null,
      profit_take_plan: formState.profit_take_plan?.trim() || null,
      risk_plan: formState.risk_plan?.trim() || null,
      roll_or_reopen_plan: formState.roll_or_reopen_plan?.trim() || null,
      tags: parsePortfolioTags(formState.tagsInput),
    })
      .then((updated) => {
        setDetail(updated);
        setFormState(buildFormState(updated));
        setPositions((current) =>
          current.map((position) =>
            position.position_key === updated.position_key
              ? {
                  ...position,
                  strategy: updated.strategy,
                  needs_rationale: false,
                  rationale_updated_at: updated.rationale?.updated_at ?? null,
                }
              : position,
          ),
        );
        setSaveMessage("Rationale saved.");
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to save rationale.";
        setSaveError(message);
      })
      .finally(() => {
        setSavePending(false);
      });
  };

  const handleUndoRoll = (eventId: string) => {
    setRollUndoPendingId(eventId);
    setRollEventsError(null);
    void undoPortfolioRollEvent(eventId)
      .then(() => {
        setReloadToken((current) => current + 1);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to undo roll.";
        setRollEventsError(message);
      })
      .finally(() => {
        setRollUndoPendingId(null);
      });
  };

  const handleSyncNow = () => {
    setIsSyncPending(true);
    setSyncError(null);
    setSyncMessage(null);

    void syncPortfolioNow()
      .then(() => {
        setSyncMessage("Sync queued. Latest data may take a few seconds to appear.");
        setReloadToken((current) => current + 1);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to queue portfolio sync.";
        setSyncError(message);
      })
      .finally(() => {
        setIsSyncPending(false);
      });
  };

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to inspect portfolio reviews.",
        forceRedirectUrl: "/portfolio",
        signUpForceRedirectUrl: "/portfolio",
      }}
      title="Portfolio"
      description="Review current positions, morning recommendations, and durable trade rationale from the shared OpenClaw workspace."
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can access the portfolio module."
      stickyHeader
    >
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Shared workspace
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
                Portfolio review
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Browse normalized positions from `portfolio/latest.json`, inspect the latest
                morning review, and keep your trade thesis attached to each open position.
              </p>
            </div>
            <div className="flex w-full flex-col gap-3 lg:max-w-md">
              <div className="flex items-end gap-3">
                <div className="min-w-0 flex-1">
                  <label
                    htmlFor="portfolio-search"
                    className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                  >
                    Search positions
                  </label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      id="portfolio-search"
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Search by ticker, key, or flag"
                      className="pl-9"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSyncNow}
                  disabled={isSyncPending}
                  className="gap-2 whitespace-nowrap"
                >
                  <RefreshCcw className="h-4 w-4" />
                  {isSyncPending ? "Syncing…" : "Sync now"}
                </Button>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Positions: {positions.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Flagged: {flaggedCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Missing rationale: {missingRationaleCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Reviews: {reviews.length}
            </span>
          </div>
          {positionsError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {positionsError}
            </div>
          ) : null}
          {syncError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {syncError}
            </div>
          ) : null}
          {syncMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {syncMessage}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Option rolls
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900">Rolls detected (last 7 days)</h3>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            Auto-detected rolls from your Trades sheet with rationale carry-over. Undo removes the
            copied rationale on the new leg and dismisses the match.
          </p>
          {rollEventsError ? (
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              {rollEventsError}
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {rollEvents.length === 0 ? (
              <p className="text-sm text-slate-500">No roll events in the last week.</p>
            ) : (
              rollEvents.map((ev) => (
                <div
                  key={ev.id}
                  className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 text-sm text-slate-700">
                    <p className="font-medium text-slate-900">
                      {ev.rolled_from_position_key} → {ev.rolled_to_position_key}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {formatTimestamp(ev.rolled_at)} · net credit {(ev.net_credit_cents / 100).toFixed(2)}{" "}
                      · {ev.status}
                    </p>
                  </div>
                  {ev.status !== "dismissed" ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={rollUndoPendingId === ev.id}
                      onClick={() => handleUndoRoll(ev.id)}
                    >
                      {rollUndoPendingId === ev.id ? "Undoing…" : "Undo"}
                    </Button>
                  ) : (
                    <Badge variant="outline">Dismissed</Badge>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">Open positions</p>
              <p className="mt-1 text-xs text-slate-500">
                {filteredPositions.length} of {positions.length} positions visible
              </p>
            </div>
            <div className="max-h-[760px] overflow-y-auto p-3">
              {isPositionsLoading ? (
                <p className="px-2 py-3 text-sm text-slate-500">Loading portfolio…</p>
              ) : filteredPositions.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">
                  {positions.length === 0
                    ? "No portfolio positions found."
                    : "No positions match the current search."}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredPositions.map((position) => (
                    <button
                      key={position.position_key}
                      type="button"
                      onClick={() => setSelectedKey(position.position_key)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        selectedKey === position.position_key
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {position.ticker}
                            {position.option_side ? ` ${position.option_side.toUpperCase()}` : ""}
                            {typeof position.strike === "number" ? ` ${position.strike}` : ""}
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-[11px]",
                              selectedKey === position.position_key
                                ? "text-slate-200"
                                : "text-slate-500",
                            )}
                          >
                            {position.strategy ?? "unclassified"} · {position.expiration ?? "no expiry"}
                          </p>
                        </div>
                        {position.needs_rationale ? (
                          <Badge variant="warning">Needs why</Badge>
                        ) : position.latest_flags.length > 0 ? (
                          <Badge variant="outline">{position.latest_flags.length} flag(s)</Badge>
                        ) : (
                          <Badge variant="success">Tracked</Badge>
                        )}
                      </div>
                      <div
                        className={cn(
                          "mt-3 flex flex-wrap gap-1 text-[11px]",
                          selectedKey === position.position_key ? "text-slate-200" : "text-slate-500",
                        )}
                      >
                        <span>P&L {formatPercent(position.unrealized_pnl_pct)}</span>
                        <span>DTE {typeof position.dte === "number" ? position.dte : "—"}</span>
                      </div>
                      {position.latest_flags[0]?.headline ? (
                        <p
                          className={cn(
                            "mt-2 text-xs",
                            selectedKey === position.position_key
                              ? "text-slate-100"
                              : "text-slate-600",
                          )}
                        >
                          {position.latest_flags[0].headline}
                        </p>
                      ) : null}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    {detail?.ticker ?? "Position detail"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {detail ? detail.position_key : "Select a position to inspect its review context."}
                  </p>
                </div>
                {detail ? (
                  <div className="flex flex-wrap gap-2">
                    {detail.needs_rationale ? (
                      <Badge variant="warning">Missing rationale</Badge>
                    ) : null}
                    <Badge variant="outline">{detail.strategy ?? "unclassified"}</Badge>
                    <Badge variant="outline">{detail.status ?? "unknown"}</Badge>
                    <Badge variant="outline">Updated {formatTimestamp(detail.as_of)}</Badge>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="space-y-5 px-5 py-4">
              {detailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {detailError}
                </div>
              ) : null}

              {!selectedKey ? (
                <p className="text-sm text-slate-500">
                  Select a position to inspect the latest review and save rationale.
                </p>
              ) : isDetailLoading && !detail ? (
                <p className="text-sm text-slate-500">Loading portfolio detail…</p>
              ) : !detail ? (
                <p className="text-sm text-slate-500">This portfolio position is unavailable.</p>
              ) : (
                <>
                  <PositionStats position={detail} />

                  <div className="grid gap-4 lg:grid-cols-[1.2fr_minmax(0,1fr)]">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Latest flags
                        </p>
                      </div>
                      <div className="mt-3 space-y-3">
                        {detail.latest_flags.length === 0 ? (
                          <p className="text-sm text-slate-500">No active review flags.</p>
                        ) : (
                          detail.latest_flags.map((flag) => (
                            <div
                              key={`${flag.code}-${flag.headline}`}
                              className="rounded-xl border border-slate-200 bg-white px-3 py-3"
                            >
                              <div className="flex items-center gap-2">
                                <Badge variant="outline">{flag.code}</Badge>
                                <span className="text-sm font-semibold text-slate-900">
                                  {flag.headline}
                                </span>
                              </div>
                              {flag.summary ? (
                                <p className="mt-2 text-sm text-slate-600">{flag.summary}</p>
                              ) : null}
                              {flag.recommendation ? (
                                <p className="mt-2 text-sm text-slate-800">
                                  Recommendation: {flag.recommendation}
                                </p>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex items-center gap-2">
                        <Bookmark className="h-4 w-4 text-slate-600" />
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                          Morning review
                        </p>
                      </div>
                        <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        {detail.latest_review_summary_markdown ? (
                          <Markdown
                            content={detail.latest_review_summary_markdown}
                            variant="basic"
                          />
                        ) : (
                          <p className="text-sm text-slate-500">
                            No linked daily review summary yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <section className="rounded-xl border border-slate-200 bg-white p-5">
                    <div className="flex items-center gap-2">
                      <Sigma className="h-4 w-4 text-slate-600" />
                      <div>
                        <p className="text-sm font-semibold text-slate-900">Trade rationale</p>
                        <p className="mt-1 text-xs text-slate-500">
                          Save why this trade exists so future morning reviews can reason from
                          your actual thesis.
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4">
                      {detail.rationale?.rolled_from_position_key ? (
                        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
                          <span className="font-medium">Rationale inherited from </span>
                          <button
                            type="button"
                            className="font-mono text-sky-800 underline"
                            onClick={() => setSelectedKey(detail.rationale!.rolled_from_position_key!)}
                          >
                            {detail.rationale.rolled_from_position_key}
                          </button>
                          <span className="text-sky-800"> (open prior leg)</span>
                        </div>
                      ) : null}
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="portfolio-rationale-strategy"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Strategy
                          </label>
                          <Input
                            id="portfolio-rationale-strategy"
                            value={formState.strategy ?? ""}
                            onChange={(event) =>
                              setFormState((current) => ({
                                ...current,
                                strategy: event.target.value,
                              }))
                            }
                            placeholder="wheel / csp / covered_call"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="portfolio-rationale-tags"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Tags
                          </label>
                          <Input
                            id="portfolio-rationale-tags"
                            value={formState.tagsInput}
                            onChange={(event) =>
                              setFormState((current) => ({
                                ...current,
                                tagsInput: event.target.value,
                              }))
                            }
                            placeholder="income, wheel, high-conviction"
                          />
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="portfolio-rationale-why"
                          className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                        >
                          Why this trade
                        </label>
                        <Textarea
                          id="portfolio-rationale-why"
                          value={formState.why ?? ""}
                          onChange={(event) =>
                            setFormState((current) => ({
                              ...current,
                              why: event.target.value,
                            }))
                          }
                        />
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <label
                            htmlFor="portfolio-rationale-entry-plan"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Entry plan
                          </label>
                          <Textarea
                            id="portfolio-rationale-entry-plan"
                            value={formState.entry_plan ?? ""}
                            onChange={(event) =>
                              setFormState((current) => ({
                                ...current,
                                entry_plan: event.target.value,
                              }))
                            }
                            className="min-h-[110px]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="portfolio-rationale-profit-plan"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Profit take plan
                          </label>
                          <Textarea
                            id="portfolio-rationale-profit-plan"
                            value={formState.profit_take_plan ?? ""}
                            onChange={(event) =>
                              setFormState((current) => ({
                                ...current,
                                profit_take_plan: event.target.value,
                              }))
                            }
                            className="min-h-[110px]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="portfolio-rationale-risk-plan"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Risk plan
                          </label>
                          <Textarea
                            id="portfolio-rationale-risk-plan"
                            value={formState.risk_plan ?? ""}
                            onChange={(event) =>
                              setFormState((current) => ({
                                ...current,
                                risk_plan: event.target.value,
                              }))
                            }
                            className="min-h-[110px]"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="portfolio-rationale-roll-plan"
                            className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
                          >
                            Roll / reopen plan
                          </label>
                          <Textarea
                            id="portfolio-rationale-roll-plan"
                            value={formState.roll_or_reopen_plan ?? ""}
                            onChange={(event) =>
                              setFormState((current) => ({
                                ...current,
                                roll_or_reopen_plan: event.target.value,
                              }))
                            }
                            className="min-h-[110px]"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button onClick={handleSave} disabled={savePending}>
                        {savePending ? "Saving…" : "Save rationale"}
                      </Button>
                      {saveMessage ? <p className="text-sm text-emerald-700">{saveMessage}</p> : null}
                      {saveError ? <p className="text-sm text-red-700">{saveError}</p> : null}
                      {detail.rationale?.updated_at ? (
                        <p className="text-xs text-slate-500">
                          Last saved {formatTimestamp(detail.rationale.updated_at)}
                        </p>
                      ) : null}
                    </div>
                  </section>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
