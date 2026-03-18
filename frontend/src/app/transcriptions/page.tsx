"use client";
/* eslint-disable react-hooks/set-state-in-effect */

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { FileText, Mic, Search } from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { Markdown } from "@/components/atoms/Markdown";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchTranscriptionDetail,
  fetchTranscriptions,
  matchesTranscriptionSearch,
  type TranscriptionDetail,
  type TranscriptionEntry,
  type TranscriptionFile,
} from "@/lib/transcriptions";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { cn } from "@/lib/utils";

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return "—";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function ArtifactList({ files }: { files: TranscriptionFile[] }) {
  if (!files.length) {
    return <p className="text-sm text-slate-500">No artifacts found.</p>;
  }

  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div
          key={file.relative_path}
          className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="truncate text-sm font-medium text-slate-900">
              {file.name}
            </p>
            <span className="shrink-0 text-xs text-slate-500">
              {formatBytes(file.size_bytes)}
            </span>
          </div>
          <p className="mt-1 break-all text-xs text-slate-500">
            {file.relative_path}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function TranscriptionsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [entries, setEntries] = useState<TranscriptionEntry[]>([]);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TranscriptionDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activePane, setActivePane] = useState<"analysis" | "transcript" | "json" | "artifacts">(
    "analysis",
  );

  useEffect(() => {
    let cancelled = false;
    setIsEntriesLoading(true);
    setEntriesError(null);

    void fetchTranscriptions()
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setSelectedId((current) => current ?? data[0]?.id ?? null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to load transcriptions.";
        setEntriesError(message);
      })
      .finally(() => {
        if (!cancelled) setIsEntriesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);
    setDetailError(null);

    void fetchTranscriptionDetail(selectedId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setActivePane((current) => {
          if (data.has_analysis) return current === "artifacts" ? "analysis" : current;
          if (data.has_transcript_text) return "transcript";
          if (data.has_transcript_json) return "json";
          return "artifacts";
        });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to load transcription details.";
        setDetailError(message);
      })
      .finally(() => {
        if (!cancelled) setIsDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesTranscriptionSearch(entry, searchTerm)),
    [entries, searchTerm],
  );

  const processedCount = entries.filter((entry) => entry.is_done).length;
  const selectedEntry = detail ?? entries.find((entry) => entry.id === selectedId) ?? null;

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to inspect transcriptions.",
        forceRedirectUrl: "/transcriptions",
        signUpForceRedirectUrl: "/transcriptions",
      }}
      title="Transcriptions"
      description="Browse processed transcript artifacts from the shared OpenClaw workspace."
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can access transcriptions."
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
                Transcript explorer
              </h2>
              <p className="mt-2 max-w-3xl text-sm text-slate-600">
                Read-only view into `transcriptions/processed` artifacts generated by
                the shared workspace transcript pipeline.
              </p>
            </div>
            <div className="w-full max-w-sm">
              <label
                htmlFor="transcription-search"
                className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500"
              >
                Search transcriptions
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="transcription-search"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search by id or artifact name"
                  className="pl-9"
                />
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Processed entries: {entries.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Done markers: {processedCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Source path: `transcriptions/processed`
            </span>
          </div>
          {entriesError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {entriesError}
            </div>
          ) : null}
        </section>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <p className="text-sm font-semibold text-slate-900">
                Processed transcripts
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {filteredEntries.length} of {entries.length} entries visible
              </p>
            </div>
            <div className="max-h-[760px] overflow-y-auto p-3">
              {isEntriesLoading ? (
                <p className="px-2 py-3 text-sm text-slate-500">
                  Loading transcriptions…
                </p>
              ) : filteredEntries.length === 0 ? (
                <p className="px-2 py-3 text-sm text-slate-500">
                  {entries.length === 0
                    ? "No processed transcript entries found."
                    : "No transcript entries match the current search."}
                </p>
              ) : (
                <div className="space-y-2">
                  {filteredEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => setSelectedId(entry.id)}
                      className={cn(
                        "w-full rounded-2xl border px-4 py-3 text-left transition",
                        selectedId === entry.id
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {entry.title}
                          </p>
                          <p
                            className={cn(
                              "mt-1 text-[11px]",
                              selectedId === entry.id
                                ? "text-slate-200"
                                : "text-slate-500",
                            )}
                          >
                            Captured {formatTimestamp(entry.captured_at)}
                          </p>
                        </div>
                        <Badge variant={entry.is_done ? "success" : "warning"}>
                          {entry.is_done ? "Done" : "Partial"}
                        </Badge>
                      </div>
                      <div
                        className={cn(
                          "mt-3 flex flex-wrap gap-1 text-[11px]",
                          selectedId === entry.id ? "text-slate-200" : "text-slate-500",
                        )}
                      >
                        {entry.has_analysis ? <span>analysis</span> : null}
                        {entry.has_transcript_text ? <span>transcript</span> : null}
                        {entry.has_transcript_json ? <span>json</span> : null}
                        <span>{entry.source_files.length} source file(s)</span>
                      </div>
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
                    {selectedEntry?.title ?? "Transcript detail"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {selectedEntry
                      ? `Processed ${formatTimestamp(selectedEntry.processed_at)}`
                      : "Select a processed transcript entry to inspect its artifacts."}
                  </p>
                </div>
                {selectedEntry ? (
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={selectedEntry.is_done ? "success" : "warning"}>
                      {selectedEntry.is_done ? "Done" : "Partial"}
                    </Badge>
                    <Badge variant="outline">
                      {selectedEntry.source_files.length} source
                    </Badge>
                    <Badge variant="outline">
                      {selectedEntry.artifact_files.length} artifacts
                    </Badge>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="px-5 py-4">
              {detailError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {detailError}
                </div>
              ) : null}

              {!selectedId ? (
                <p className="text-sm text-slate-500">
                  Select a processed transcript entry to inspect it.
                </p>
              ) : isDetailLoading && !detail ? (
                <p className="text-sm text-slate-500">Loading transcript detail…</p>
              ) : !selectedEntry ? (
                <p className="text-sm text-slate-500">
                  This transcript entry is unavailable.
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Source files
                      </p>
                      <div className="mt-3">
                        <ArtifactList files={selectedEntry.source_files} />
                      </div>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Artifact inventory
                      </p>
                      <div className="mt-3">
                        <ArtifactList files={selectedEntry.artifact_files} />
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={activePane === "analysis" ? "primary" : "ghost"}
                      onClick={() => setActivePane("analysis")}
                      disabled={!detail?.has_analysis}
                    >
                      Analysis
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activePane === "transcript" ? "primary" : "ghost"}
                      onClick={() => setActivePane("transcript")}
                      disabled={!detail?.has_transcript_text}
                    >
                      Transcript
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activePane === "json" ? "primary" : "ghost"}
                      onClick={() => setActivePane("json")}
                      disabled={!detail?.has_transcript_json}
                    >
                      JSON
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={activePane === "artifacts" ? "primary" : "ghost"}
                      onClick={() => setActivePane("artifacts")}
                    >
                      Artifacts
                    </Button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    {activePane === "analysis" ? (
                      detail?.analysis_content ? (
                        <div className="prose prose-slate max-w-none">
                          <Markdown content={detail.analysis_content} variant="basic" />
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500">
                          No `analysis.md` found for this transcript.
                        </p>
                      )
                    ) : null}

                    {activePane === "transcript" ? (
                      detail?.transcript_text_content ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                          {detail.transcript_text_content}
                        </pre>
                      ) : (
                        <p className="text-sm text-slate-500">
                          No transcript text artifact found for this entry.
                        </p>
                      )
                    ) : null}

                    {activePane === "json" ? (
                      detail?.transcript_json_content ? (
                        <pre className="overflow-x-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-900">
                          {detail.transcript_json_content}
                        </pre>
                      ) : (
                        <p className="text-sm text-slate-500">
                          No transcript JSON artifact found for this entry.
                        </p>
                      )
                    ) : null}

                    {activePane === "artifacts" ? (
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <div className="mb-3 flex items-center gap-2">
                            <Mic className="h-4 w-4 text-slate-500" />
                            <p className="text-sm font-semibold text-slate-900">
                              Source files
                            </p>
                          </div>
                          <ArtifactList files={selectedEntry.source_files} />
                        </div>
                        <div>
                          <div className="mb-3 flex items-center gap-2">
                            <FileText className="h-4 w-4 text-slate-500" />
                            <p className="text-sm font-semibold text-slate-900">
                              Output artifacts
                            </p>
                          </div>
                          <ArtifactList files={selectedEntry.artifact_files} />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </DashboardPageLayout>
  );
}
