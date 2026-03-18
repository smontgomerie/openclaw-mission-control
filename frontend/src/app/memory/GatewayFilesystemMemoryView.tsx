"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState } from "react";

import { ApiError } from "@/api/mutator";
import { Markdown } from "@/components/atoms/Markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchGatewayFilesystemMemoryFile,
  fetchGatewayFilesystemMemoryOverview,
  matchesGatewayFilesystemMemorySearch,
  selectInitialGatewayFilesystemMemoryPath,
  type GatewayFilesystemMemoryContent,
  type GatewayFilesystemMemoryFile,
  type GatewayFilesystemMemoryOverview,
} from "@/lib/gateway-filesystem-memory";
import { cn } from "@/lib/utils";

const buildDailyPath = (date: Date) => {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `memory/${year}-${month}-${day}.md`;
};

const emptyDailyMessage =
  "No daily memory files yet. The gateway main agent has not written any dated memory logs.";

type GatewayFilesystemMemoryViewProps = {
  active: boolean;
  gatewayId: string;
};

export function GatewayFilesystemMemoryView({
  active,
  gatewayId,
}: GatewayFilesystemMemoryViewProps) {
  const [reloadToken, setReloadToken] = useState(0);
  const [overview, setOverview] = useState<GatewayFilesystemMemoryOverview | null>(
    null,
  );
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState(false);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedError, setSelectedError] = useState<string | null>(null);
  const [isSelectedLoading, setIsSelectedLoading] = useState(false);
  const [fileCache, setFileCache] = useState<
    Record<string, GatewayFilesystemMemoryContent>
  >({});

  const [searchTerm, setSearchTerm] = useState("");
  const dailyFiles = useMemo(() => overview?.daily_files ?? [], [overview]);
  const longTermMemory = overview?.long_term_memory ?? null;

  useEffect(() => {
    setOverview(null);
    setOverviewError(null);
    setIsOverviewLoading(false);
    setSelectedPath(null);
    setSelectedError(null);
    setIsSelectedLoading(false);
    setFileCache({});
    setSearchTerm("");
    setReloadToken(0);
  }, [gatewayId]);

  useEffect(() => {
    if (!active || !gatewayId || overview) return;

    let cancelled = false;
    setIsOverviewLoading(true);
    setOverviewError(null);

    void fetchGatewayFilesystemMemoryOverview(gatewayId)
      .then((data) => {
        if (cancelled) return;
        setOverview(data);
        setSelectedPath(
          (current) => current ?? selectInitialGatewayFilesystemMemoryPath(data),
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to load filesystem memory.";
        setOverviewError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsOverviewLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, gatewayId, overview, reloadToken]);

  useEffect(() => {
    if (!active || !gatewayId || !selectedPath || fileCache[selectedPath]) return;

    let cancelled = false;
    setIsSelectedLoading(true);
    setSelectedError(null);

    void fetchGatewayFilesystemMemoryFile(gatewayId, selectedPath)
      .then((file) => {
        if (cancelled) return;
        setFileCache((prev) => ({ ...prev, [file.path]: file }));
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to load memory file.";
        setSelectedError(message);
      })
      .finally(() => {
        if (!cancelled) {
          setIsSelectedLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [active, fileCache, gatewayId, selectedPath]);

  const selectedFile = selectedPath ? fileCache[selectedPath] ?? null : null;

  const filteredDailyFiles = useMemo(() => {
    return dailyFiles.filter((file) =>
      matchesGatewayFilesystemMemorySearch(
        file,
        searchTerm,
        fileCache[file.path]?.content,
      ),
    );
  }, [dailyFiles, fileCache, searchTerm]);

  const quickPaths = useMemo(() => {
    const fileSet = new Set(dailyFiles.map((file) => file.path));
    const now = new Date();
    const today = buildDailyPath(now);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(now.getDate() - 1);
    const yesterday = buildDailyPath(yesterdayDate);
    return {
      today: fileSet.has(today) ? today : null,
      yesterday: fileSet.has(yesterday) ? yesterday : null,
      latest: overview?.latest_daily_path ?? null,
    };
  }, [dailyFiles, overview?.latest_daily_path]);

  const longTermMatches = useMemo(() => {
    if (!longTermMemory) return false;
    return matchesGatewayFilesystemMemorySearch(
      longTermMemory,
      searchTerm,
      longTermMemory.content,
    );
  }, [longTermMemory, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Gateway filesystem memory
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-900">
              Gateway main workspace memory explorer
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Reading `MEMORY.md` and `memory/YYYY-MM-DD.md` from the gateway
              main workspace.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <label
              htmlFor="gateway-filesystem-memory-search"
              className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
            >
              Search loaded memory
            </label>
            <Input
              id="gateway-filesystem-memory-search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search dates, paths, or loaded content"
            />
          </div>
        </div>
        {overview ? (
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Gateway: {overview.gateway_name}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Main agent: {overview.main_agent_name}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Daily files: {dailyFiles.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Long-term memory: {longTermMemory ? "Available" : "Missing"}
            </span>
          </div>
        ) : null}
      </div>

      {overviewError ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>{overviewError}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOverview(null);
                setSelectedPath(null);
                setSelectedError(null);
                setFileCache({});
                setReloadToken((current) => current + 1);
              }}
            >
              Retry
            </Button>
          </div>
        </div>
      ) : null}

      {isOverviewLoading && !overview ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
          Loading filesystem memory…
        </div>
      ) : null}

      {overview ? (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_340px]">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">
                  Long-term memory
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Durable context from `MEMORY.md`
                </p>
              </div>
              <div className="px-5 py-4">
                {!longTermMemory ? (
                  <p className="text-sm text-slate-500">
                    `MEMORY.md` is not available in the gateway main workspace yet.
                  </p>
                ) : !longTermMatches ? (
                  <p className="text-sm text-slate-500">
                    No long-term memory match for the current search.
                  </p>
                ) : (
                  <div className="select-text cursor-text break-words text-sm leading-relaxed text-slate-900">
                    <Markdown content={longTermMemory.content} variant="basic" />
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">Quick jump</p>
              <p className="mt-1 text-xs text-slate-500">
                Jump to the freshest daily memory files.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickPaths.today && setSelectedPath(quickPaths.today)}
                  disabled={!quickPaths.today}
                >
                  Today
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    quickPaths.yesterday && setSelectedPath(quickPaths.yesterday)
                  }
                  disabled={!quickPaths.yesterday}
                >
                  Yesterday
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => quickPaths.latest && setSelectedPath(quickPaths.latest)}
                  disabled={!quickPaths.latest}
                >
                  Latest
                </Button>
              </div>
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <p className="font-semibold text-slate-800">Current file</p>
                <p className="mt-1 break-all">
                  {selectedPath ?? "Select a daily memory file"}
                </p>
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">Daily memory</p>
                <p className="mt-1 text-xs text-slate-500">
                  {filteredDailyFiles.length} of {dailyFiles.length} files visible
                </p>
              </div>
              <div className="max-h-[720px] overflow-y-auto p-3">
                {filteredDailyFiles.length === 0 ? (
                  <p className="px-2 py-3 text-sm text-slate-500">
                    {dailyFiles.length === 0
                      ? emptyDailyMessage
                      : "No daily files match the current search."}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {filteredDailyFiles.map((file: GatewayFilesystemMemoryFile) => (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => setSelectedPath(file.path)}
                        className={cn(
                          "w-full rounded-xl border px-3 py-2.5 text-left transition",
                          selectedPath === file.path
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        <p className="text-sm font-semibold">{file.label}</p>
                        <p
                          className={cn(
                            "mt-1 text-[11px]",
                            selectedPath === file.path
                              ? "text-slate-200"
                              : "text-slate-500",
                          )}
                        >
                          {file.path}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">
                  Daily memory reader
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Read the selected `memory/YYYY-MM-DD.md` file.
                </p>
              </div>
              <div className="px-5 py-4">
                {selectedError ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {selectedError}
                  </div>
                ) : null}
                {!selectedPath ? (
                  <p className="text-sm text-slate-500">
                    Select a daily memory file to read it.
                  </p>
                ) : isSelectedLoading && !selectedFile ? (
                  <p className="text-sm text-slate-500">Loading memory file…</p>
                ) : !selectedFile ? (
                  <p className="text-sm text-slate-500">
                    This daily memory file has not been loaded yet.
                  </p>
                ) : (
                  <div className="select-text cursor-text break-words text-sm leading-relaxed text-slate-900">
                    <Markdown content={selectedFile.content} variant="basic" />
                  </div>
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
