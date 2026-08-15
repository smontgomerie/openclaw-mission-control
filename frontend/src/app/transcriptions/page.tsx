"use client";

export const dynamic = "force-dynamic";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  FileText,
  ListRestart,
  Mic,
  Pause,
  Play,
  RefreshCcw,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";

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
  confirmSpeakerSample,
  countDiarizedSpeakers,
  deleteSpeakerProfile,
  exportDiarizedTranscriptionDocx,
  fetchSpeakerAnnotationImport,
  fetchSpeakerDirectory,
  fetchTranscriptionDetail,
  fetchTranscriptionSourceAudioBlob,
  fetchTranscriptions,
  getDiarizedTranscriptTurns,
  importLegacySpeakerRegistry,
  previewSpeakerAnnotationImport,
  matchesTranscriptionSearch,
  mergeSpeakerProfiles,
  rejectSpeakerSample,
  reprocessTranscriptionsMetadata,
  renameSpeakerProfile,
  renameTranscriptionSpeaker,
  sortTranscriptionsByRecordingDate,
  startSpeakerAnnotationImport,
  syncTranscriptionsNow,
  type DiarizedTranscriptTurn,
  type SpeakerBackfillPreview,
  type SpeakerBackfillRun,
  type SpeakerDirectory,
  type SpeakerProfile,
  type SpeakerVoiceSample,
  type TranscriptionDetail,
  type TranscriptionEntry,
  type TranscriptionFile,
} from "@/lib/transcriptions";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { cn } from "@/lib/utils";

const TRANSCRIPTION_PAGE_SIZE = 100;
const TRANSCRIPT_TURN_PAGE_SIZE = 250;
const REVIEW_QUEUE_PAGE_SIZE = 50;

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
    typeof progressSeconds !== "number" ||
    Number.isNaN(progressSeconds) ||
    progressSeconds < 0 ||
    typeof totalDurationSeconds !== "number" ||
    Number.isNaN(totalDurationSeconds) ||
    totalDurationSeconds <= 0
  ) {
    return null;
  }

  const percent = Math.round((progressSeconds / totalDurationSeconds) * 100);
  return Math.max(0, Math.min(percent, 99));
}

function getEntryStatus(
  entry: Pick<
    TranscriptionEntry,
    | "status"
    | "is_done"
    | "artifact_files"
    | "progress_seconds"
    | "total_duration_seconds"
  >,
): {
  label: string;
  variant: "success" | "warning" | "outline";
  progressPercent: number | null;
} {
  const artifactCount = entry.artifact_files?.length ?? 0;
  const status =
    entry.status ??
    (entry.is_done ? "done" : artifactCount > 0 ? "partial" : "pending");
  const progressPercent = getProgressPercent(
    entry.progress_seconds,
    entry.total_duration_seconds,
  );

  if (status === "done")
    return { label: "Done", variant: "success", progressPercent: null };
  if (status === "partial") {
    return {
      label:
        progressPercent !== null
          ? `In progress ${progressPercent}%`
          : "Partial",
      variant: "warning",
      progressPercent,
    };
  }
  return { label: "Pending", variant: "outline", progressPercent: null };
}

function CalendarMatchAnalysisNote({
  detail,
}: {
  detail: TranscriptionDetail | null;
}) {
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
        <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-800">
          calendar-match.json
        </code>{" "}
        found. The sidebar title may use{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[11px] text-slate-800">
          title.txt
        </code>{" "}
        or capture time instead. This note reflects workspace metadata only; it
        does not prove how{" "}
        <code className="rounded bg-white px-1 py-0.5 text-[11px]">
          analysis.md
        </code>{" "}
        was written.
      </div>
    );
  }

  if (used) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
        <p className="font-semibold">Calendar match</p>
        <p className="mt-1 text-xs text-emerald-900">
          The sidebar title uses this file (high/medium confidence with an event
          title)
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
        Not used for the sidebar title (needs high or medium confidence plus an
        event title).
        {conf ? ` Current confidence: ${conf}.` : ""}
      </p>
    </div>
  );
}

function formatTranscriptOffset(
  value: number | null | undefined,
): string | null {
  if (typeof value !== "number" || Number.isNaN(value) || value < 0)
    return null;

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
  pendingSpeakerSamples: SpeakerVoiceSample[];
  onConfirmSpeaker: (turn: DiarizedTranscriptTurn) => void;
};

function getTurnPlaybackKey(turn: DiarizedTranscriptTurn): string {
  return `${turn.rawSpeakerLabel ?? turn.speakerLabel}:${turn.start ?? "na"}:${turn.end ?? "na"}:${turn.text}`;
}
function turnMatchesSpeakerSample(
  turn: DiarizedTranscriptTurn,
  sample: SpeakerVoiceSample,
): boolean {
  if (turn.rawSpeakerLabel && sample.speaker_label === turn.rawSpeakerLabel) {
    return true;
  }

  return sample.segment_evidence.some((segment) => {
    const text = (segment.text ?? "").trim();
    const start = segment.start ?? null;
    const end = segment.end ?? null;
    return (
      text === turn.text &&
      start !== null &&
      end !== null &&
      turn.start !== null &&
      turn.end !== null &&
      Math.abs(start - turn.start) < 0.01 &&
      Math.abs(end - turn.end) < 0.01
    );
  });
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
  pendingSpeakerSamples,
  onConfirmSpeaker,
}: TranscriptTurnsProps) {
  const [visibleTurnCount, setVisibleTurnCount] = useState(
    TRANSCRIPT_TURN_PAGE_SIZE,
  );

  const visibleTurns = turns.slice(0, visibleTurnCount);
  return (
    <div className="space-y-3">
      {speakerNameSuggestions.length > 0 ? (
        <datalist id={speakerNameDatalistId}>
          {speakerNameSuggestions.map((name) => (
            <option key={name} value={name} />
          ))}
        </datalist>
      ) : null}
      {visibleTurns.map((turn, index) => {
        const startLabel = formatTranscriptOffset(turn.start);
        const endLabel = formatTranscriptOffset(turn.end);
        const turnKey = getTurnPlaybackKey(turn);
        const timeRange =
          startLabel && endLabel && endLabel !== startLabel
            ? `${startLabel} - ${endLabel}`
            : (startLabel ?? endLabel);
        const pendingSpeakerSample = pendingSpeakerSamples.find((sample) =>
          turnMatchesSpeakerSample(turn, sample),
        );

        return (
          <div
            key={`${turn.rawSpeakerLabel ?? turn.speakerLabel}-${turn.start ?? "na"}-${index}`}
            className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
          >
            <div className="flex flex-wrap items-center gap-2">
              {editingTurnKey === turnKey &&
              editingSpeakerLabel === turn.rawSpeakerLabel &&
              turn.rawSpeakerLabel ? (
                <div className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-2 py-1 shadow-sm">
                  <Input
                    aria-label={`Rename speaker ${turn.speakerLabel}`}
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
                      speakerNameSuggestions.length > 0
                        ? speakerNameDatalistId
                        : undefined
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
                <p className="text-sm font-semibold text-slate-900">
                  {turn.speakerLabel}
                </p>
              )}
              {renamePending && editingSpeakerLabel === turn.rawSpeakerLabel ? (
                <span className="text-xs font-medium text-slate-500">
                  Saving…
                </span>
              ) : null}
              {timeRange ? (
                <span className="text-xs font-medium text-slate-500">
                  {timeRange}
                </span>
              ) : null}
              {pendingSpeakerSample ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => onConfirmSpeaker(turn)}
                >
                  <Check className="h-4 w-4" />
                  {pendingSpeakerSample.candidate_name
                    ? `Review: ${pendingSpeakerSample.candidate_name}${
                        typeof pendingSpeakerSample.similarity === "number"
                          ? ` (${Math.round(pendingSpeakerSample.similarity * 100)}%)`
                          : ""
                      }`
                    : "Review speaker"}
                </Button>
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
      {visibleTurnCount < turns.length ? (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() =>
            setVisibleTurnCount((current) =>
              Math.min(current + TRANSCRIPT_TURN_PAGE_SIZE, turns.length),
            )
          }
        >
          Show{" "}
          {Math.min(TRANSCRIPT_TURN_PAGE_SIZE, turns.length - visibleTurnCount)}{" "}
          more turns ({turns.length - visibleTurnCount} remaining)
        </Button>
      ) : null}
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

function SpeakerDirectoryPanel({
  directory,
  directoryError,
  onDirectoryChange,
  onOpenTranscript,
  onTranscriptMaybeChanged,
}: {
  directory: SpeakerDirectory | null;
  directoryError?: string | null;
  onDirectoryChange: (directory: SpeakerDirectory) => void;
  onOpenTranscript: (entryId: string) => void;
  onTranscriptMaybeChanged?: () => Promise<void> | void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [backfillPreview, setBackfillPreview] =
    useState<SpeakerBackfillPreview | null>(null);
  const [backfillRun, setBackfillRun] = useState<SpeakerBackfillRun | null>(
    null,
  );
  const [reviewProfiles, setReviewProfiles] = useState<Record<string, string>>(
    {},
  );
  const [reviewNames, setReviewNames] = useState<Record<string, string>>({});
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [mergeTargets, setMergeTargets] = useState<Record<string, string>>({});
  const [reviewAudioUrl, setReviewAudioUrl] = useState<string | null>(null);
  const [reviewAudioEntryId, setReviewAudioEntryId] = useState<string | null>(
    null,
  );
  const [reviewAudioLoading, setReviewAudioLoading] = useState(false);
  const [playingReviewSampleId, setPlayingReviewSampleId] = useState<
    string | null
  >(null);
  const [reviewStopAt, setReviewStopAt] = useState<number | null>(null);
  const [reviewLimit, setReviewLimit] = useState(REVIEW_QUEUE_PAGE_SIZE);
  const reviewAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (reviewAudioUrl) URL.revokeObjectURL(reviewAudioUrl);
    };
  }, [reviewAudioUrl]);

  useEffect(() => {
    const audio = reviewAudioRef.current;
    if (!audio) return;
    const stopPlayback = () => {
      audio.pause();
      setPlayingReviewSampleId(null);
      setReviewStopAt(null);
    };
    const onTimeUpdate = () => {
      if (reviewStopAt !== null && audio.currentTime >= reviewStopAt)
        stopPlayback();
    };
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("ended", stopPlayback);
    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("ended", stopPlayback);
    };
  }, [reviewStopAt]);

  const load = async () => {
    try {
      const next = await fetchSpeakerDirectory();
      onDirectoryChange(next);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to refresh the speaker list.",
      );
    }
    if (onTranscriptMaybeChanged) {
      try {
        await Promise.resolve(onTranscriptMaybeChanged());
      } catch (cause: unknown) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Unable to refresh the transcript after the speaker update.",
        );
      }
    }
  };

  useEffect(() => {
    if (!directory) return;
    setProfileNames((current) => {
      const next: Record<string, string> = {};
      for (const profile of directory.profiles) {
        next[profile.id] = current[profile.id] ?? profile.display_name;
      }
      return next;
    });
  }, [directory]);

  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusyKey(key);
    setError(null);
    try {
      await action();
      await load();
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Speaker update failed.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const confirmSample = (sampleId: string) => {
    const newName = (reviewNames[sampleId] ?? "").trim();
    const profileId =
      reviewProfiles[sampleId] ??
      pending.find((sample) => sample.id === sampleId)?.candidate_profile_id;
    if (!newName && !profileId) {
      setError("Choose an existing profile or enter a new speaker name.");
      return;
    }
    void run(`sample:${sampleId}`, () =>
      confirmSpeakerSample(
        sampleId,
        newName ? { new_name: newName } : { profile_id: profileId },
      ),
    );
  };

  const playReviewClip = async (sample: SpeakerVoiceSample) => {
    const entryId = sample.transcription_entry_id;
    const start = sample.clip_start_seconds;
    const end = sample.clip_end_seconds;
    const audio = reviewAudioRef.current;
    if (
      !entryId ||
      typeof start !== "number" ||
      typeof end !== "number" ||
      end <= start ||
      !audio
    ) {
      setError("This observation does not include a playable diarized clip.");
      return;
    }
    if (playingReviewSampleId === sample.id) {
      audio.pause();
      setPlayingReviewSampleId(null);
      setReviewStopAt(null);
      return;
    }
    setReviewAudioLoading(true);
    setError(null);
    try {
      let objectUrl = reviewAudioUrl;
      if (!objectUrl || reviewAudioEntryId !== entryId) {
        const nextObjectUrl = URL.createObjectURL(
          await fetchTranscriptionSourceAudioBlob(entryId),
        );
        setReviewAudioUrl((current) => {
          if (current) URL.revokeObjectURL(current);
          return nextObjectUrl;
        });
        setReviewAudioEntryId(entryId);
        objectUrl = nextObjectUrl;
      }
      if (audio.src !== objectUrl) audio.src = objectUrl;
      if (audio.readyState < 1) {
        await new Promise<void>((resolve, reject) => {
          audio.addEventListener("loadedmetadata", () => resolve(), {
            once: true,
          });
          audio.addEventListener(
            "error",
            () => reject(new Error("Unable to load review audio.")),
            { once: true },
          );
          audio.load();
        });
      }
      audio.currentTime = Math.max(start, 0);
      await audio.play();
      setPlayingReviewSampleId(sample.id);
      setReviewStopAt(end);
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "Unable to play review clip.",
      );
    } finally {
      setReviewAudioLoading(false);
    }
  };

  const previewBackfill = async () => {
    setBusyKey("backfill-preview");
    setError(null);
    try {
      setBackfillPreview(await previewSpeakerAnnotationImport());
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to preview annotations.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  const startBackfill = async () => {
    if (!backfillPreview) return;
    setBusyKey("backfill-start");
    setError(null);
    try {
      setBackfillRun(
        await startSpeakerAnnotationImport(backfillPreview.snapshot_hash),
      );
    } catch (cause: unknown) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to start annotation import.",
      );
    } finally {
      setBusyKey(null);
    }
  };

  useEffect(() => {
    if (!backfillRun || !["queued", "running"].includes(backfillRun.status))
      return;
    const timer = window.setInterval(() => {
      void fetchSpeakerAnnotationImport(backfillRun.id).then((next) => {
        setBackfillRun(next);
        if (next.status === "completed") void load();
      });
    }, 2000);
    return () => window.clearInterval(timer);
    // Polling only needs the current run; load reads latest panel state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backfillRun]);

  const profiles = directory?.profiles ?? [];
  const pending = directory?.pending_samples ?? [];
  const visiblePending = pending.slice(0, reviewLimit);

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_55%,#f0fdfa_100%)] shadow-sm">
      <audio ref={reviewAudioRef} className="hidden" preload="metadata" />
      <div className="flex flex-col gap-4 border-b border-amber-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-slate-950 p-2.5 text-amber-300">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-950">
              Speaker intelligence
            </p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-600">
              Confirmed examples improve future matching. Automatic detections
              stay in review and never train a profile until an administrator
              confirms them.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{profiles.length} profiles</Badge>
          <Badge variant={pending.length ? "warning" : "success"}>
            {pending.length} pending
          </Badge>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busyKey !== null}
            onClick={() => void previewBackfill()}
          >
            Preview annotation import
          </Button>
          {profiles.length === 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busyKey !== null}
              onClick={() => void run("import", importLegacySpeakerRegistry)}
            >
              Import legacy registry
            </Button>
          ) : null}
        </div>
      </div>

      {error || directoryError ? (
        <div className="mx-5 mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || directoryError}
        </div>
      ) : null}

      {backfillPreview ? (
        <div className="mx-5 mt-4 rounded-xl border border-amber-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Historical annotation preview
              </p>
              <p className="mt-1 text-xs text-slate-600">
                {backfillPreview.annotated_recording_count} annotated
                recordings, {Object.keys(backfillPreview.speaker_names).length}{" "}
                named speakers, and{" "}
                {backfillPreview.unannotated_recording_count} recordings to
                queue for review. Existing transcripts will be backed up and
                will not be rewritten.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={busyKey !== null || backfillRun?.status === "running"}
              onClick={() => void startBackfill()}
            >
              Import trusted annotations
            </Button>
          </div>
          {backfillPreview.tentative_annotation_count > 0 ? (
            <p className="mt-2 text-xs text-amber-700">
              Includes {backfillPreview.tentative_annotation_count} existing
              tentative segment labels, per the trusted-import policy.
            </p>
          ) : null}
          {backfillRun ? (
            <p className="mt-3 text-xs font-medium text-slate-700">
              {backfillRun.status}: {backfillRun.processed_recordings}/
              {backfillRun.total_recordings} recordings ·{" "}
              {backfillRun.confirmed_samples} confirmed ·{" "}
              {backfillRun.pending_samples} pending ·{" "}
              {backfillRun.skipped_recordings} skipped
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,0.9fr)]">
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Known speakers
            </p>
          </div>
          {directory === null && !directoryError ? (
            <p className="text-sm text-slate-500">Loading speaker profiles…</p>
          ) : directory === null ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-500">
              Speaker profiles could not be loaded.
            </p>
          ) : profiles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-4 text-sm text-slate-500">
              No database-backed profiles yet. Import the existing registry or
              confirm a pending observation to create one.
            </p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {profiles.map((profile: SpeakerProfile) => {
                const mergeTarget = mergeTargets[profile.id] ?? "";
                return (
                  <article
                    key={profile.id}
                    className="rounded-xl border border-slate-200 bg-white/90 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-950">
                          {profile.display_name}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {profile.represented_sample_count} represented example
                          {profile.represented_sample_count === 1
                            ? ""
                            : "s"} · {profile.encoder}
                        </p>
                      </div>
                      {profile.pending_sample_count ? (
                        <Badge variant="warning">
                          {profile.pending_sample_count} review
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-4 flex gap-2">
                      <Input
                        aria-label={`Rename ${profile.display_name}`}
                        value={profileNames[profile.id] ?? profile.display_name}
                        onChange={(event) =>
                          setProfileNames((current) => ({
                            ...current,
                            [profile.id]: event.target.value,
                          }))
                        }
                        className="h-8"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={busyKey !== null}
                        onClick={() =>
                          void run(`rename:${profile.id}`, () =>
                            renameSpeakerProfile(
                              profile.id,
                              profileNames[profile.id] ?? profile.display_name,
                            ),
                          )
                        }
                      >
                        Save
                      </Button>
                    </div>
                    {profiles.length > 1 ? (
                      <div className="mt-2 flex gap-2">
                        <select
                          aria-label={`Merge ${profile.display_name} into`}
                          value={mergeTarget}
                          onChange={(event) =>
                            setMergeTargets((current) => ({
                              ...current,
                              [profile.id]: event.target.value,
                            }))
                          }
                          className="h-8 min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs"
                        >
                          <option value="">Merge into…</option>
                          {profiles
                            .filter((candidate) => candidate.id !== profile.id)
                            .map((candidate) => (
                              <option key={candidate.id} value={candidate.id}>
                                {candidate.display_name}
                              </option>
                            ))}
                        </select>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={!mergeTarget || busyKey !== null}
                          onClick={() =>
                            void run(`merge:${profile.id}`, () =>
                              mergeSpeakerProfiles(profile.id, mergeTarget),
                            )
                          }
                        >
                          Merge
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          aria-label={`Delete ${profile.display_name}`}
                          disabled={busyKey !== null}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Delete ${profile.display_name} and all voice embeddings?`,
                              )
                            ) {
                              void run(`delete:${profile.id}`, () =>
                                deleteSpeakerProfile(profile.id),
                              );
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-2"
                        disabled={busyKey !== null}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Delete ${profile.display_name} and all voice embeddings?`,
                            )
                          ) {
                            void run(`delete:${profile.id}`, () =>
                              deleteSpeakerProfile(profile.id),
                            );
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-red-600" /> Delete
                        profile
                      </Button>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Review queue
          </p>
          {pending.length === 0 ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm text-emerald-800">
              No speaker observations need review.
            </div>
          ) : (
            <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
              {visiblePending.map((sample) => (
                <article
                  key={sample.id}
                  className="rounded-xl border border-amber-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">
                        {sample.candidate_name ?? "Unknown speaker"}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {sample.transcription_entry_id ?? "Unknown transcript"}{" "}
                        · {sample.speaker_label}
                      </p>
                    </div>
                    {typeof sample.similarity === "number" ? (
                      <Badge variant="outline">
                        {Math.round(sample.similarity * 100)}%
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    {typeof sample.speech_duration_seconds === "number"
                      ? `${sample.speech_duration_seconds.toFixed(1)}s clean speech`
                      : "Speech duration unavailable"}
                    {typeof sample.segment_count === "number"
                      ? ` across ${sample.segment_count} segments`
                      : ""}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <select
                      aria-label="Existing speaker profile"
                      value={
                        reviewProfiles[sample.id] ??
                        sample.candidate_profile_id ??
                        ""
                      }
                      onChange={(event) =>
                        setReviewProfiles((current) => ({
                          ...current,
                          [sample.id]: event.target.value,
                        }))
                      }
                      className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs"
                    >
                      <option value="">Choose profile…</option>
                      {profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.display_name}
                        </option>
                      ))}
                    </select>
                    <Input
                      aria-label="New speaker name"
                      value={reviewNames[sample.id] ?? ""}
                      onChange={(event) =>
                        setReviewNames((current) => ({
                          ...current,
                          [sample.id]: event.target.value,
                        }))
                      }
                      placeholder="Or create a new speaker"
                      className="h-9"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={
                        reviewAudioLoading &&
                        playingReviewSampleId !== sample.id
                      }
                      onClick={() => void playReviewClip(sample)}
                    >
                      {playingReviewSampleId === sample.id ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {playingReviewSampleId === sample.id
                        ? "Stop clip"
                        : reviewAudioLoading
                          ? "Loading clip…"
                          : "Play review clip"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={busyKey !== null}
                      onClick={() => confirmSample(sample.id)}
                    >
                      <Check className="h-4 w-4" /> Confirm
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={busyKey !== null}
                      onClick={() =>
                        void run(`reject:${sample.id}`, () =>
                          rejectSpeakerSample(sample.id),
                        )
                      }
                    >
                      <X className="h-4 w-4" /> Reject
                    </Button>
                    {sample.transcription_entry_id ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          onOpenTranscript(sample.transcription_entry_id!)
                        }
                      >
                        Open transcript
                      </Button>
                    ) : null}
                  </div>
                </article>
              ))}
              {visiblePending.length < pending.length ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    setReviewLimit((current) =>
                      Math.min(
                        current + REVIEW_QUEUE_PAGE_SIZE,
                        pending.length,
                      ),
                    )
                  }
                >
                  Show next{" "}
                  {Math.min(
                    REVIEW_QUEUE_PAGE_SIZE,
                    pending.length - visiblePending.length,
                  )}{" "}
                  reviews ({pending.length - visiblePending.length} remaining)
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function TranscriptionsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const [entries, setEntries] = useState<TranscriptionEntry[]>([]);
  const [entriesError, setEntriesError] = useState<string | null>(null);
  const [isEntriesLoading, setIsEntriesLoading] = useState(false);
  const [isLoadingMoreEntries, setIsLoadingMoreEntries] = useState(false);
  const [hasMoreEntries, setHasMoreEntries] = useState(false);
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
  const [editingSpeakerLabel, setEditingSpeakerLabel] = useState<string | null>(
    null,
  );
  const [editingTurnKey, setEditingTurnKey] = useState<string | null>(null);
  const [editingSpeakerValue, setEditingSpeakerValue] = useState("");
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [speakerDirectory, setSpeakerDirectory] =
    useState<SpeakerDirectory | null>(null);
  const [speakerDirectoryError, setSpeakerDirectoryError] = useState<
    string | null
  >(null);
  const [confirmingSpeakerSample, setConfirmingSpeakerSample] =
    useState<SpeakerVoiceSample | null>(null);
  const [confirmProfileId, setConfirmProfileId] = useState("");
  const [confirmNewName, setConfirmNewName] = useState("");
  const [excludedSegmentIds, setExcludedSegmentIds] = useState<string[]>([]);
  const [confirmPending, setConfirmPending] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [audioObjectUrl, setAudioObjectUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioPendingTurnKey, setAudioPendingTurnKey] = useState<string | null>(
    null,
  );
  const [playingTurnKey, setPlayingTurnKey] = useState<string | null>(null);
  const [audioStopAt, setAudioStopAt] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activePane, setActivePane] = useState<
    "analysis" | "transcript" | "json" | "artifacts" | "logs"
  >("analysis");
  const [reloadToken, setReloadToken] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const detailEpochRef = useRef(0);
  const speakerNameDatalistId = useId();

  selectedIdRef.current = selectedId;

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

    void fetchTranscriptions({ limit: TRANSCRIPTION_PAGE_SIZE })
      .then((data) => {
        if (cancelled) return;
        setEntries(data);
        setHasMoreEntries(data.length === TRANSCRIPTION_PAGE_SIZE);
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

  const loadMoreEntries = () => {
    if (isLoadingMoreEntries || !hasMoreEntries) return;
    setIsLoadingMoreEntries(true);
    setEntriesError(null);
    void fetchTranscriptions({
      offset: entries.length,
      limit: TRANSCRIPTION_PAGE_SIZE,
    })
      .then((data) => {
        setEntries((current) => [...current, ...data]);
        setHasMoreEntries(data.length === TRANSCRIPTION_PAGE_SIZE);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to load more transcriptions.";
        setEntriesError(message);
      })
      .finally(() => setIsLoadingMoreEntries(false));
  };

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
    const epoch = ++detailEpochRef.current;
    setDetail(null);
    setIsDetailLoading(true);
    setDetailError(null);
    setRenamePending(false);
    setRenameError(null);

    void fetchTranscriptionDetail(selectedId)
      .then((data) => {
        if (cancelled || epoch !== detailEpochRef.current) return;
        setDetail(data);
        setEditingSpeakerLabel(null);
        setEditingTurnKey(null);
        setEditingSpeakerValue("");
        setRenameError(null);
        setAudioError(null);
        setExportError(null);
        setActivePane((current) => {
          if (data.has_analysis)
            return current === "artifacts" ? "analysis" : current;
          if (data.has_transcript_text) return "transcript";
          if (data.has_transcript_json) return "json";
          if (data.process_log_content || data.whisperx_log_content)
            return "logs";
          return "artifacts";
        });
      })
      .catch((error: unknown) => {
        if (cancelled || epoch !== detailEpochRef.current) return;
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to load transcription details.";
        setDetailError(message);
      })
      .finally(() => {
        if (!cancelled && epoch === detailEpochRef.current) {
          setIsDetailLoading(false);
        }
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

  useEffect(() => {
    if (!isAdmin) {
      setSpeakerDirectory(null);
      setSpeakerDirectoryError(null);
      return;
    }
    let cancelled = false;
    void fetchSpeakerDirectory()
      .then((next) => {
        if (cancelled) return;
        setSpeakerDirectory(next);
        setSpeakerDirectoryError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setSpeakerDirectoryError(
          cause instanceof Error ? cause.message : "Unable to load speakers.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const filteredEntries = useMemo(
    () =>
      sortTranscriptionsByRecordingDate(
        entries.filter((entry) =>
          matchesTranscriptionSearch(entry, searchTerm),
        ),
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
    () =>
      collectKnownSpeakerNames(
        entries,
        diarizedTurns,
        speakerDirectory?.profiles ?? [],
      ),
    [entries, diarizedTurns, speakerDirectory],
  );

  const pendingSamplesForSelectedTranscript = useMemo(
    () =>
      (speakerDirectory?.pending_samples ?? []).filter(
        (sample) => sample.transcription_entry_id === selectedId,
      ),
    [selectedId, speakerDirectory],
  );

  const processedCount = entries.filter((entry) => entry.is_done).length;
  const pendingCount = entries.filter(
    (entry) => getEntryStatus(entry).label === "Pending",
  ).length;
  const selectedEntry =
    (detail?.id === selectedId ? detail : null) ??
    entries.find((entry) => entry.id === selectedId) ??
    null;

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
          const onError = () =>
            reject(new Error("Unable to load audio for playback."));
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
      setAudioError(
        error instanceof Error ? error.message : "Unable to play audio clip.",
      );
    } finally {
      setAudioLoading(false);
      setAudioPendingTurnKey(turnKey);
    }
  };

  const refreshOpenTranscript = async (entryId: string | null) => {
    if (!entryId) return;
    if (selectedIdRef.current !== entryId) return;
    const epoch = ++detailEpochRef.current;
    try {
      const updated = await fetchTranscriptionDetail(entryId);
      if (epoch !== detailEpochRef.current) return;
      if (selectedIdRef.current !== entryId) return;
      setDetail(updated);
      setDetailError(null);
      setIsDetailLoading(false);
      setEntries((current) =>
        current.map((entry) =>
          entry.id === updated.id ? { ...entry, ...updated } : entry,
        ),
      );
    } catch (error: unknown) {
      if (epoch !== detailEpochRef.current) return;
      setIsDetailLoading(false);
      throw error;
    }
  };

  const handleConfirmSpeaker = (turn: DiarizedTranscriptTurn) => {
    const sample = pendingSamplesForSelectedTranscript.find((candidate) =>
      turnMatchesSpeakerSample(turn, candidate),
    );
    if (!sample) return;
    setConfirmingSpeakerSample(sample);
    setConfirmProfileId(sample.candidate_profile_id ?? "");
    setConfirmNewName("");
    setExcludedSegmentIds([]);
    setConfirmError(null);
  };

  const handleConfirmSpeakerSubmit = () => {
    if (!confirmingSpeakerSample || confirmPending) return;
    const newName = confirmNewName.trim();
    if (!newName && !confirmProfileId) {
      setConfirmError(
        "Choose an existing profile or enter a new speaker name.",
      );
      return;
    }
    setConfirmPending(true);
    setConfirmError(null);
    const confirmedEntryId = selectedId;
    void confirmSpeakerSample(
      confirmingSpeakerSample.id,
      newName
        ? { new_name: newName, excluded_segment_ids: excludedSegmentIds }
        : {
            profile_id: confirmProfileId,
            excluded_segment_ids: excludedSegmentIds,
          },
    )
      .then(async () => {
        setConfirmingSpeakerSample(null);
        try {
          const nextDirectory = await fetchSpeakerDirectory();
          setSpeakerDirectory(nextDirectory);
          setSpeakerDirectoryError(null);
        } catch (cause: unknown) {
          setSpeakerDirectoryError(
            cause instanceof Error
              ? cause.message
              : "Unable to refresh the speaker list after confirm.",
          );
        }
        try {
          await refreshOpenTranscript(confirmedEntryId);
        } catch (cause: unknown) {
          setDetailError(
            cause instanceof Error
              ? cause.message
              : "Unable to refresh the transcript after confirm.",
          );
        }
      })
      .catch((cause: unknown) => {
        setConfirmError(
          cause instanceof Error ? cause.message : "Unable to confirm speaker.",
        );
      })
      .finally(() => setConfirmPending(false));
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

    const renamedEntryId = selectedId;
    void renameTranscriptionSpeaker(selectedId, {
      speaker_label: editingSpeakerLabel,
      new_name: newName,
    })
      .then((updated) => {
        if (selectedIdRef.current !== renamedEntryId) return;
        detailEpochRef.current += 1;
        setDetail(updated);
        setEntries((current) =>
          current.map((entry) =>
            entry.id === updated.id ? { ...entry, ...updated } : entry,
          ),
        );
        void fetchSpeakerDirectory()
          .then((next) => {
            setSpeakerDirectory(next);
            setSpeakerDirectoryError(null);
          })
          .catch((cause: unknown) => {
            setSpeakerDirectoryError(
              cause instanceof Error
                ? cause.message
                : "Unable to refresh the speaker list after rename.",
            );
          });
        setEditingSpeakerLabel(null);
        setEditingTurnKey(null);
        setEditingSpeakerValue("");
      })
      .catch((error: unknown) => {
        if (selectedIdRef.current !== renamedEntryId) return;
        const message =
          error instanceof ApiError || error instanceof Error
            ? error.message
            : "Unable to rename speaker.";
        setRenameError(message);
      })
      .finally(() => {
        if (selectedIdRef.current === renamedEntryId) {
          setRenamePending(false);
        }
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
        setSyncMessage(
          "Transcription run queued. Pending files may take a few seconds to update.",
        );
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
                Inspect transcript artifacts and refine diarized speaker names
                in `transcriptions/processed` generated by the shared workspace
                transcript pipeline.
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
              Loaded entries: {entries.length}
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

        <Dialog
          open={confirmingSpeakerSample !== null}
          onOpenChange={(open) => {
            if (!open && !confirmPending) setConfirmingSpeakerSample(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm speaker example</DialogTitle>
              <DialogDescription>
                Confirming this diarized speaker adds its clean speech to the
                selected profile. Automatic matches never train a profile on
                their own.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-3">
              <select
                aria-label="Confirm speaker profile"
                value={confirmProfileId}
                onChange={(event) => setConfirmProfileId(event.target.value)}
                disabled={confirmPending}
                className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Choose profile…</option>
                {(speakerDirectory?.profiles ?? []).map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.display_name}
                  </option>
                ))}
              </select>
              <Input
                aria-label="Confirm new speaker name"
                value={confirmNewName}
                onChange={(event) => setConfirmNewName(event.target.value)}
                placeholder="Or create a new speaker"
                disabled={confirmPending}
              />
              {confirmingSpeakerSample?.segment_evidence.length ? (
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Included turns
                  </p>
                  {confirmingSpeakerSample.segment_evidence.map((segment) => {
                    const excluded = excludedSegmentIds.includes(segment.id);
                    return (
                      <label
                        key={segment.id}
                        className="flex items-start gap-2 rounded-md bg-slate-50 p-2 text-xs text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={!excluded}
                          disabled={confirmPending}
                          onChange={() =>
                            setExcludedSegmentIds((current) =>
                              excluded
                                ? current.filter((id) => id !== segment.id)
                                : [...current, segment.id],
                            )
                          }
                        />
                        <span className="min-w-0 flex-1">
                          {segment.text || "Untitled speech segment"}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handlePlayTurn({
                              speakerLabel:
                                confirmingSpeakerSample.speaker_label ||
                                "Speaker",
                              rawSpeakerLabel:
                                confirmingSpeakerSample.speaker_label || null,
                              text: segment.text || "",
                              start: segment.start ?? null,
                              end: segment.end ?? null,
                            })
                          }
                        >
                          <Play className="h-3 w-3" /> Play
                        </Button>
                      </label>
                    );
                  })}
                </div>
              ) : null}
              {confirmError ? (
                <p className="text-sm text-red-600">{confirmError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setConfirmingSpeakerSample(null)}
                disabled={confirmPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleConfirmSpeakerSubmit}
                disabled={confirmPending}
              >
                <Check className="h-4 w-4" />
                {confirmPending ? "Confirming…" : "Confirm example"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={reprocessDialogOpen}
          onOpenChange={setReprocessDialogOpen}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Re-run metadata for all processed entries?
              </DialogTitle>
              <DialogDescription>
                This queues a gateway job that re-runs calendar matching, title
                generation, and speaker re-annotation across everything under{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">
                  processed/
                </code>
                . It can take a while and will overwrite derived files where the
                scripts write output.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setReprocessDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" onClick={handleReprocessMetadataConfirm}>
                Queue backfill
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isAdmin ? (
          <SpeakerDirectoryPanel
            directory={speakerDirectory}
            directoryError={speakerDirectoryError}
            onDirectoryChange={(next) => {
              setSpeakerDirectory(next);
              setSpeakerDirectoryError(null);
            }}
            onOpenTranscript={setSelectedId}
            onTranscriptMaybeChanged={() =>
              refreshOpenTranscript(selectedIdRef.current)
            }
          />
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-slate-900">
                    Transcripts
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    By recording date (newest first)
                  </p>
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
                                {typeof entry.diarized_speaker_count ===
                                  "number" &&
                                entry.diarized_speaker_count > 0 ? (
                                  <p
                                    className={cn(
                                      "mt-1 line-clamp-2 text-[11px] leading-snug",
                                      selectedId === entry.id
                                        ? "text-slate-200"
                                        : "text-slate-600",
                                    )}
                                  >
                                    <span className="font-semibold">
                                      Speakers
                                    </span>
                                    {": "}
                                    {(
                                      entry.diarized_speaker_preview ?? []
                                    ).join(", ")}
                                    {entry.diarized_speaker_count >
                                    (entry.diarized_speaker_preview?.length ??
                                      0)
                                      ? ` (+${
                                          entry.diarized_speaker_count -
                                          (entry.diarized_speaker_preview
                                            ?.length ?? 0)
                                        } more)`
                                      : null}
                                  </p>
                                ) : null}
                              </div>
                              <Badge variant={status.variant}>
                                {status.label}
                              </Badge>
                            </div>
                            {status.progressPercent !== null ? (
                              <div
                                className={cn(
                                  "mt-3 h-2 overflow-hidden rounded-full",
                                  selectedId === entry.id
                                    ? "bg-slate-700"
                                    : "bg-slate-200",
                                )}
                              >
                                <div
                                  className={cn(
                                    "h-full rounded-full",
                                    selectedId === entry.id
                                      ? "bg-white"
                                      : "bg-amber-500",
                                  )}
                                  style={{
                                    width: `${status.progressPercent}%`,
                                  }}
                                />
                              </div>
                            ) : null}
                            <div
                              className={cn(
                                "mt-3 flex flex-wrap gap-1 text-[11px]",
                                selectedId === entry.id
                                  ? "text-slate-200"
                                  : "text-slate-500",
                              )}
                            >
                              {entry.has_analysis ? (
                                <span>analysis</span>
                              ) : null}
                              {entry.has_transcript_text ? (
                                <span>transcript</span>
                              ) : null}
                              {entry.has_transcript_json ? (
                                <span>json</span>
                              ) : null}
                              <span>
                                {entry.source_files.length} source file(s)
                              </span>
                            </div>
                          </>
                        );
                      })()}
                    </button>
                  ))}
                  {hasMoreEntries ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={loadMoreEntries}
                      disabled={isLoadingMoreEntries}
                    >
                      {isLoadingMoreEntries ? "Loading more…" : "Load 100 more"}
                    </Button>
                  ) : null}
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
                      return (
                        <Badge variant={status.variant}>{status.label}</Badge>
                      );
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
                        {diarizedSpeakerCount} speaker
                        {diarizedSpeakerCount === 1 ? "" : "s"}
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
                <p className="text-sm text-slate-500">
                  Loading transcript detail…
                </p>
              ) : detailError && !detail ? (
                <p className="mt-3 text-sm text-slate-500">
                  Transcript detail could not be loaded for this recording.
                </p>
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
                      variant={
                        activePane === "transcript" ? "primary" : "ghost"
                      }
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
                      disabled={
                        !detail?.process_log_content &&
                        !detail?.whisperx_log_content
                      }
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
                            <Markdown
                              content={detail.analysis_content}
                              variant="basic"
                            />
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
                              Use “Play clip” on a turn to jump to that speaker
                              segment.
                            </p>
                            {exportError ? (
                              <p className="mt-2 text-xs text-red-600">
                                {exportError}
                              </p>
                            ) : null}
                          </div>
                          <TranscriptTurns
                            key={selectedId}
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
                            pendingSpeakerSamples={
                              pendingSamplesForSelectedTranscript
                            }
                            onConfirmSpeaker={handleConfirmSpeaker}
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
                        {!detail?.process_log_content &&
                        !detail?.whisperx_log_content ? (
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
