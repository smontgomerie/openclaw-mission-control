"use client";

export const dynamic = "force-dynamic";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { FileText, ListRestart, Mic, Pause, Play, RefreshCcw, Search } from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { Markdown } from "@/components/atoms/Markdown";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  collectKnownSpeakerNames,
  countDiarizedSpeakers,
  exportDiarizedTranscriptionDocx,
  fetchTranscriptionDetail,
  fetchTranscriptionSourceAudioBlob,
  fetchTranscriptions,
  getDiarizedTranscriptTurns,
  matchesTranscriptionSearch,
  reprocessTranscriptionsMetadata,
  renameTranscriptionSpeaker,
  sortTranscriptionsByRecordingDate,
  syncTranscriptionsNow,
  type DiarizedTranscriptTurn,
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

function getProgressPercent(
  progressSeconds: number | null | undefined,
  totalDurationSeconds: number | null | undefined,
): number | null {
  if (
    typeof progressSeconds !== "number"
    || Number.isNaN(progressSeconds)
    || progressSeconds < 0
    || typeof totalDurationSeconds !== "number"
    || Number.isNaN(totalDurationSeconds)
    || totalDurationSeconds <= 0
  ) {
    return null;
  }

  const percent = Math.round((progressSeconds / totalDurationSeconds) * 100);
  return Math.max(0, Math.min(percent, 99));
}

function getEntryStatus(
  entry: Pick<
    TranscriptionEntry,
    "status" | "is_done" | "artifact_files" | "progress_seconds" | "total_duration_seconds"
  >,
): {
  label: string;
  variant: "success" | "warning" | "outline";
  progressPercent: number | null;
} {
  const artifactCount = entry.artifact_files?.length ?? 0;
  const status =
    entry.status ?? (entry.is_done ? "done" : artifactCount > 0 ? "partial" : "pending");
  const progressPercent = getProgressPercent(entry.progress_seconds, entry.total_duration_seconds);

  if (status === "done") return { label: "Done", variant: "success", progressPercent: null };
  if (status === "partial") {
    return {
      label: progressPercent !== null ? `In progress ${progressPercent}%` : "Partial",
      variant: "warning",
      progressPercent,
    };
  }
  return { label: "Pending", variant: "outline", progressPercent: null };
}

function CalendarMatchAnalysisNote({ detail }: { detail: TranscriptionDetail | null }) {
  if (!detail) return null;
  const present = detail.calendar_match_present === true;
  const used = detail.calendar_match_used_for_title === true;
  const conf = detail.calendar_match_confidence;
  const eventTitle = detail.calendar_match_event_title;

  if (!present) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="font-semibold text-slate-700">Calendar match: </span>
        No{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-800">calendar-match.json</code> found.
        The sidebar title may use{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-800">title.txt</code> or capture time
        instead. This note reflects workspace metadata only; it does not prove how{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[11px]">analysis.md</code> was written.
      </div>
    );
  }

  if (used) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">Calendar match</p>
        <p className="mt-1 text-xs text-emerald-900">
          The sidebar title uses this file (high/medium confidence with an event title)
          {conf ? ` — confidence: ${conf}` : ""}
          {eventTitle ? ` — matched event: ${eventTitle}` : "."}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
      <p className="font-semibold">calendar-match.json present</p>
      <p className="mt-1 text-xs text-amber-900">
        Not used for the sidebar title (needs high or medium confidence plus an event title).
        {conf ? ` Current confidence: ${conf}.` : ""}
      </p>
    </div>
  );
}

function formatTranscriptOffset(value: number | null | undefined): string | null {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0) return null;

  const totalSeconds = Math.floor(value);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type TranscriptTurnsProps = {
  turns: DiarizedTranscriptTurn[];
  editingTurnKey: string | null;
  editingSpeakerLabel: string | null;
  editingValue: string;
  renamePending: boolean;
  renameError: string | null;
  audioLoading: boolean;
  audioPendingTurnKey: string | null;
  playingTurnKey: string | null;
  audioError: string | null;
  speakerNameSuggestions: string[];
  speakerNameDatalistId: string;
  onEditStart: (turn: DiarizedTranscriptTurn) => void;
  onEditChange: (value: string) => void;
  onEditCancel: () => void;
  onEditSubmit: () => void;
  onPlayTurn: (turn: DiarizedTranscriptTurn) => void;
};

function getTurnPlaybackKey(turn: DiarizedTranscriptTurn): string {
  return `${turn.rawSpeakerLabel ?? turn.speakerLabel}:${turn.start ?? "na"}:${turn.end ?? "na"}:${turn.text}`;
}

function TranscriptTurns({
  turns,
  editingTurnKey,
  editingSpeakerLabel,
  editingValue,
  renamePending,
  renameError,
  audioLoading,
  audioPendingTurnKey,
  playingTurnKey,
  audioError,
  speakerNameSuggestions,
  speakerNameDatalistId,
  onEditStart,
  onEditChange,
  onEditCancel,
  onEditSubmit,
  onPlayTurn,
}: TranscriptTurnsProps) {
  return (
    <div className="space-y-3">
      {speakerNameSuggestions.length > 0 ? (
        <datalist id={speakerNameDatalistId}>
          {speakerNameSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
      {turns.map((turn, index) => {
        const startLabel = formatTranscriptOffset(turn.start);
        const endLabel = formatTranscriptOffset(turn.end);
        const turnKey = getTurnPlaybackKey(turn);
        const timeRange =
          startLabel && endLabel && endLabel !== startLabel
            ? `${startLabel} - ${endLabel}`
            : startLabel ?? endLabel;

        return (
          <div
            key={`${turn.rawSpeakerLabel ?? turn.speakerLabel}-${turn.start ?? "na"}-${index}`}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              {editingTurnKey === turnKey && editingSpeakerLabel === turn.rawSpeakerLabel && turn.rawSpeakerLabel ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1 shadow-sm">
                  <Input
                    value={editingValue}
                    onChange={(event) => onEditChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onEditSubmit();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        onEditCancel();
                      }
                    }}
                    autoFocus
                    disabled={renamePending}
                    list={
                      speakerNameSuggestions.length > 0 ? speakerNameDatalistId : undefined
                    }
                    autoComplete="off"
                    className="h-8 w-48 border-0 bg-transparent px-2 shadow-none"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={onEditSubmit}
                    disabled={renamePending}
                  >
                    Save
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={onEditCancel}
                    disabled={renamePending}
                  >
                    Cancel
                  </Button>
                </div>
              ) : turn.rawSpeakerLabel ? (
                <button
                  type="button"
                  className="cursor-text rounded-md bg-white/70 px-2 py-1 text-left text-sm font-semibold text-slate-900 underline decoration-dotted underline-offset-4 transition hover:bg-white"
                  onClick={() => onEditStart(turn)}
                  disabled={renamePending}
                >
                  {turn.speakerLabel}
                </button>
              ) : (
                <p className="text-sm font-semibold text-slate-900">{turn.speakerLabel}</p>
              )}
              {renamePending && editingSpeakerLabel === turn.rawSpeakerLabel ? (
                <span className="text-xs font-medium text-slate-500">Saving…</span>
              ) : null}
              {timeRange ? (
                <span className="text-xs font-medium text-slate-500">{timeRange}</span>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => onPlayTurn(turn)}
                disabled={audioLoading && audioPendingTurnKey !== turnKey}
              >
                {playingTurnKey === turnKey ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {audioLoading && audioPendingTurnKey === turnKey
                  ? "Loading audio…"
                  : playingTurnKey === turnKey
                    ? "Pause clip"
                    : "Play clip"}
              </Button>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {turn.text}
            </p>
            {renameError && editingSpeakerLabel === turn.rawSpeakerLabel ? (
              <p className="mt-2 text-xs text-red-600">{renameError}</p>
            ) : null}
            {audioError && audioPendingTurnKey === turnKey ? (
              <p className="mt-2 text-xs text-red-600">{audioError}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
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
  const [isSyncPending, setIsSyncPending] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [reprocessDialogOpen, setReprocessDialogOpen] = useState(false);
  const [isReprocessPending, setIsReprocessPending] = useState(false);
  const [reprocessError, setReprocessError] = useState<string | null>(null);
  const [reprocessMessage, setReprocessMessage] = useState<string | null>(null);
  const [editingSpeakerLabel, setEditingSpeakerLabel] = useState<string | null>(null);
  const [editingTurnKey, setEditingTurnKey] = useState<string | null>(null);
  const [editingSpeakerValue, setEditingSpeakerValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPendingTurnKey, setAudioPendingTurnKey] = useState<string | null>(null);
  const [playingTurnKey, setPlayingTurnKey] = useState<string | null>(null);
  const [audioStopAt, setAudioStopAt] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<"analysis" | "transcript" | "json" | "artifacts" | "logs">(
    "analysis",
  );
  const [reloadToken, setReloadToken] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speakerNameDatalistId = useId();

  useEffect(() => {
    return () => {
      if (audioObjectUrl) {
        URL.revokeObjectURL(audioObjectUrl);
      }
    };
  }, [audioObjectUrl]);

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
  }, [reloadToken]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setEditingSpeakerLabel(null);
      setEditingTurnKey(null);
      setEditingSpeakerValue("");
      setRenameError(null);
      setPlayingTurnKey(null);
      setAudioPendingTurnKey(null);
      setAudioError(null);
      setAudioStopAt(null);
      setExportError(null);
      return;
    }

    let cancelled = false;
    setIsDetailLoading(true);
    setDetailError(null);

    void fetchTranscriptionDetail(selectedId)
      .then((data) => {
        if (cancelled) return;
        setDetail(data);
        setEditingSpeakerLabel(null);
        setEditingTurnKey(null);
        setEditingSpeakerValue("");
        setRenameError(null);
        setAudioError(null);
        setExportError(null);
        setActivePane((current) => {
          if (data.has_analysis) return current === "artifacts" ? "analysis" : current;
          if (data.has_transcript_text) return "transcript";
          if (data.has_transcript_json) return "json";
          if (data.process_log_content || data.whisperx_log_content) return "logs";
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
  }, [reloadToken, selectedId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
    }
    setAudioObjectUrl((current) => {
      if (current) {
        URL.revokeObjectURL(current);
      }
      return null;
    });
    setPlayingTurnKey(null);
    setAudioPendingTurnKey(null);
    setAudioStopAt(null);
    setAudioError(null);
  }, [selectedId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      if (audioStopAt !== null && audio.currentTime >= audioStopAt) {
        audio.pause();
        setPlayingTurnKey(null);
        setAudioStopAt(null);
      }
    };

    const handleEnded = () => {
      setPlayingTurnKey(null);
      setAudioStopAt(null);
    };

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [audioStopAt]);

  const filteredEntries = useMemo(
    () =>
      sortTranscriptionsByRecordingDate(
        entries.filter((entry) => matchesTranscriptionSearch(entry, searchTerm)),
      ),
    [entries, searchTerm],
  );

  useEffect(() => {
    if (!selectedId) return;
    if (filteredEntries.some((entry) => entry.id === selectedId)) return;
    setSelectedId(filteredEntries[0]?.id ?? null);
  }, [filteredEntries, selectedId]);
  const diarizedTurns = useMemo(
    () => getDiarizedTranscriptTurns(detail?.transcript_json_content),
    [detail?.transcript_json_content],
  );
  const diarizedSpeakerCount = useMemo(
    () => countDiarizedSpeakers(diarizedTurns),
    [diarizedTurns],
  );
  const knownSpeakerNames = useMemo(
    () => collectKnownSpeakerNames(entries, diarizedTurns),
    [entries, diarizedTurns],
  );

  const processedCount = entries.filter((entry) => entry.is_done).length;
  const pendingCount = entries.filter((entry) => getEntryStatus(entry).label === "Pending").length;
  const selectedEntry = detail ?? entries.find((entry) => entry.id === selectedId) ?? null;

  const handleRenameStart = (turn: DiarizedTranscriptTurn) => {
    if (!turn.rawSpeakerLabel || renamePending) return;
    setEditingTurnKey(getTurnPlaybackKey(turn));
    setEditingSpeakerLabel(turn.rawSpeakerLabel);
    setEditingSpeakerValue(turn.speakerLabel);
    setRenameError(null);
  };

  const handleRenameCancel = () => {
    if (renamePending) return;
    setEditingSpeakerLabel(null);
    setEditingTurnKey(null);
    setEditingSpeakerValue("");
    setRenameError(null);
  };

  const handlePlayTurn = async (turn: DiarizedTranscriptTurn) => {
    if (!selectedId) return;

    const audio = audioRef.current;
    if (!audio) return;

    const turnKey = getTurnPlaybackKey(turn);
    if (playingTurnKey === turnKey) {
      audio.pause();
      setPlayingTurnKey(null);
      setAudioStopAt(null);
      return;
    }

    setAudioLoading(true);
    setAudioPendingTurnKey(turnKey);
    setAudioError(null);

    try {
      let objectUrl = audioObjectUrl;
      if (!objectUrl) {
        const blob = await fetchTranscriptionSourceAudioBlob(selectedId);
        objectUrl = URL.createObjectURL(blob);
        setAudioObjectUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return objectUrl!;
        });
      }

      if (audio.src !== objectUrl) {
        audio.src = objectUrl;
      }

      if (audio.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          const onLoaded = () => resolve();
          const onError = () => reject(new Error("Unable to load audio for playback."));
          audio.addEventListener("loadedmetadata", onLoaded, { once: true });
          audio.addEventListener("error", onError, { once: true });
          audio.load();
        });
      }

      const startTime = Math.max(turn.start ?? 0, 0);
      const stopAt = turn.end && turn.end > startTime ? turn.end : null;
      audio.currentTime = startTime;
      await audio.play();
      setPlayingTurnKey(turnKey);
      setAudioStopAt(stopAt);
    } catch (error: unknown) {
      setPlayingTurnKey(null);
      setAudioStopAt(null);
      setAudioError(error instanceof Error ? error.message : "Unable to play audio clip.");
    } finally {
      setAudioLoading(false);
      setAudioPendingTurnKey(turnKey);
    }
  };

  const handleRenameSubmit = () => {
    if (!selectedId || !editingSpeakerLabel || renamePending) return;
    const newName = editingSpeakerValue.trim();
    if (!newName) {
      setRenameError("Speaker name cannot be empty.");
      return;
    }

    setRenamePending(true);
    setRenameError(null);

    void renameTranscriptionSpeaker(selectedId, {
      speaker_label: editingSpeakerLabel,
      new_name: newName,
    })
      .then((updated) => {
        setDetail(updated);
        setEntries((current) =>
          current.map((entry) => (entry.id === updated.id ? { ...entry, ...updated } : entry)),
        );
        setEditingSpeakerLabel(null);
        setEditingTurnKey(null);
        setEditingSpeakerValue("");
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to rename speaker.";
        setRenameError(message);
      })
      .finally(() => {
        setRenamePending(false);
      });
  };

  const handleExportDocx = () => {
    if (!selectedId || exportPending) return;
    setExportPending(true);
    setExportError(null);

    void exportDiarizedTranscriptionDocx(selectedId)
      .catch((error: unknown) => {
        setExportError(
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to export diarized transcript.",
        );
      })
      .finally(() => {
        setExportPending(false);
      });
  };

  const handleSyncNow = () => {
    setIsSyncPending(true);
    setSyncError(null);
    setSyncMessage(null);

    void syncTranscriptionsNow()
      .then(() => {
        setSyncMessage("Transcription run queued. Pending files may take a few seconds to update.");
        setReloadToken((current) => current + 1);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to start pending transcriptions.";
        setSyncError(message);
      })
      .finally(() => {
        setIsSyncPending(false);
      });
  };

  const handleReprocessMetadataConfirm = () => {
    setReprocessDialogOpen(false);
    setIsReprocessPending(true);
    setReprocessError(null);
    setReprocessMessage(null);

    void reprocessTranscriptionsMetadata()
      .then(() => {
        setReprocessMessage(
          "Metadata backfill queued. Calendar match, titles, and speaker labels may take several minutes to refresh.",
        );
        setReloadToken((current) => current + 1);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to queue metadata backfill.";
        setReprocessError(message);
      })
      .finally(() => {
        setIsReprocessPending(false);
      });
  };

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
                Inspect transcript artifacts and refine diarized speaker names in
                `transcriptions/processed` generated by
                the shared workspace transcript pipeline.
              </p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end lg:max-w-md">
              <Button
                onClick={handleSyncNow}
                disabled={isSyncPending || isReprocessPending}
                className="gap-2 whitespace-nowrap"
              >
                <RefreshCcw className="h-4 w-4" />
                {isSyncPending ? "Starting…" : "Start pending"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setReprocessError(null);
                  setReprocessMessage(null);
                  setReprocessDialogOpen(true);
                }}
                disabled={isSyncPending || isReprocessPending}
                className="gap-2 whitespace-nowrap"
              >
                <ListRestart className="h-4 w-4" />
                Re-run metadata
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Total entries: {entries.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Done markers: {processedCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Pending files: {pendingCount}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1">
              Source path: `transcriptions`
            </span>
          </div>
          {entriesError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {entriesError}
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
          {reprocessError ? (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {reprocessError}
            </div>
          ) : null}
          {reprocessMessage ? (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {reprocessMessage}
            </div>
          ) : null}
        </section>

        <Dialog open={reprocessDialogOpen} onOpenChange={setReprocessDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Re-run metadata for all processed entries?</DialogTitle>
              <DialogDescription>
                This queues a gateway job that re-runs calendar matching, title generation, and
                speaker re-annotation across everything under{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">processed/</code>. It
                can take a while and will overwrite derived files where the scripts write output.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setReprocessDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleReprocessMetadataConfirm}>
                Queue backfill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Transcripts</p>
                  <p className="mt-0.5 text-xs text-slate-500">By recording date (newest first)</p>
                </div>
                <p className="text-xs text-slate-500">
                  {filteredEntries.length} of {entries.length} shown
                </p>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="transcription-list-filter"
                  aria-label="Filter transcripts"
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Filter by id, title, files, speakers…"
                  className="h-9 pl-9"
                />
              </div>
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
                      {(() => {
                        const status = getEntryStatus(entry);
                        return (
                          <>
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
                                {typeof entry.diarized_speaker_count === "number"
                                && entry.diarized_speaker_count > 0 ? (
                                  <p
                                    className={cn(
                                      "mt-1 line-clamp-2 text-[11px] leading-snug",
                                      selectedId === entry.id
                                        ? "text-slate-200"
                                        : "text-slate-600",
                                    )}
                                  >
                                    <span className="font-semibold">Speakers</span>
                                    {": "}
                                    {(entry.diarized_speaker_preview ?? []).join(", ")}
                                    {entry.diarized_speaker_count
                                    > (entry.diarized_speaker_preview?.length ?? 0)
                                      ? ` (+${
                                          entry.diarized_speaker_count
                                          - (entry.diarized_speaker_preview?.length ?? 0)
                                        } more)`
                                      : null}
                                  </p>
                                ) : null}
                              </div>
                              <Badge variant={status.variant}>{status.label}</Badge>
                            </div>
                            {status.progressPercent !== null ? (
                              <div
                                className={cn(
                                  "mt-3 h-2 overflow-hidden rounded-full",
                                  selectedId === entry.id ? "bg-slate-700" : "bg-slate-200",
                                )}
                              >
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    selectedId === entry.id ? "bg-white" : "bg-amber-500",
                                  )}
                                  style={{ width: `${status.progressPercent}%` }}
                                />
                              </div>
                            ) : null}
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
                          </>
                        );
                      })()}
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
                    {(() => {
                      const status = getEntryStatus(selectedEntry);
                      return <Badge variant={status.variant}>{status.label}</Badge>;
                    })()}
                    <Badge variant="outline">
                      {selectedEntry.source_files.length} source
                    </Badge>
                    <Badge variant="outline">
                      {selectedEntry.artifact_files.length} artifacts
                    </Badge>
                    {diarizedTurns.length > 0 ? (
                      <Badge variant="outline">Diarized</Badge>
                    ) : null}
                    {diarizedSpeakerCount > 0 ? (
                      <Badge variant="outline">
                        {diarizedSpeakerCount} speaker{diarizedSpeakerCount === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
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
                  {(() => {
                    const status = getEntryStatus(selectedEntry);
                    return status.progressPercent !== null ? (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-medium text-amber-900">
                            Chunked transcription progress
                          </p>
                          <span className="text-sm font-semibold text-amber-900">
                            {status.progressPercent}%
                          </span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-amber-100">
                          <div
                            className="h-full rounded-full bg-amber-500"
                            style={{ width: `${status.progressPercent}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-amber-800">
                          Processed {selectedEntry.progress_seconds ?? 0}s of{" "}
                          {selectedEntry.total_duration_seconds ?? 0}s.
                        </p>
                      </div>
                    ) : null;
                  })()}

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
                    <Button
                      type="button"
                      size="sm"
                      variant={activePane === "logs" ? "primary" : "ghost"}
                      onClick={() => setActivePane("logs")}
                      disabled={!detail?.process_log_content && !detail?.whisperx_log_content}
                    >
                      Logs
                    </Button>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    {activePane === "analysis" ? (
                      <div className="space-y-4">
                        <CalendarMatchAnalysisNote detail={detail} />
                        {detail?.analysis_content ? (
                          <div className="prose prose-slate max-w-none">
                            <Markdown content={detail.analysis_content} variant="basic" />
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500">
                            No `analysis.md` found for this transcript.
                          </p>
                        )}
                      </div>
                    ) : null}

                    {activePane === "transcript" ? (
                      diarizedTurns.length > 0 ? (
                        <div className="space-y-4">
                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                                Source audio
                              </p>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={handleExportDocx}
                                disabled={exportPending}
                              >
                                <FileText className="h-4 w-4" />
                                {exportPending ? "Exporting…" : "Export DOCX"}
                              </Button>
                            </div>
                            <audio
                              ref={audioRef}
                              src={audioObjectUrl ?? undefined}
                              controls
                              preload="metadata"
                              className="mt-3 w-full"
                            />
                            <p className="mt-2 text-xs text-slate-500">
                              Use “Play clip” on a turn to jump to that speaker segment.
                            </p>
                            {exportError ? (
                              <p className="mt-2 text-xs text-red-600">{exportError}</p>
                            ) : null}
                          </div>
                          <TranscriptTurns
                            turns={diarizedTurns}
                            editingTurnKey={editingTurnKey}
                            editingSpeakerLabel={editingSpeakerLabel}
                            editingValue={editingSpeakerValue}
                            renamePending={renamePending}
                            renameError={renameError}
                            audioLoading={audioLoading}
                            audioPendingTurnKey={audioPendingTurnKey}
                            playingTurnKey={playingTurnKey}
                            audioError={audioError}
                            speakerNameSuggestions={knownSpeakerNames}
                            speakerNameDatalistId={speakerNameDatalistId}
                            onEditStart={handleRenameStart}
                            onEditChange={setEditingSpeakerValue}
                            onEditCancel={handleRenameCancel}
                            onEditSubmit={handleRenameSubmit}
                            onPlayTurn={handlePlayTurn}
                          />
                        </div>
                      ) : detail?.transcript_text_content ? (
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

                    {activePane === "logs" ? (
                      <div className="space-y-4">
                        {detail?.process_log_content ? (
                          <div>
                            <p className="mb-2 text-sm font-semibold text-slate-900">
                              Process log
                            </p>
                            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900">
                              {detail.process_log_content}
                            </pre>
                          </div>
                        ) : null}
                        {detail?.whisperx_log_content ? (
                          <div>
                            <p className="mb-2 text-sm font-semibold text-slate-900">
                              WhisperX log
                            </p>
                            <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-relaxed text-slate-900">
                              {detail.whisperx_log_content}
                            </pre>
                          </div>
                        ) : null}
                        {!detail?.process_log_content && !detail?.whisperx_log_content ? (
                          <p className="text-sm text-slate-500">
                            No processing logs found for this entry.
                          </p>
                        ) : null}
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
