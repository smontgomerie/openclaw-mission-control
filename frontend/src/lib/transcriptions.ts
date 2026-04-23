import { authenticatedFetch, customFetch } from "@/api/mutator";

export type TranscriptionFile = {
  name: string;
  relative_path: string;
  size_bytes?: number | null;
  modified_at?: string | null;
};

export type TranscriptionEntry = {
  id: string;
  title: string;
  status?: "pending" | "partial" | "done";
  is_done?: boolean;
  captured_at?: string | null;
  processed_at?: string | null;
  source_files: TranscriptionFile[];
  artifact_files: TranscriptionFile[];
  has_analysis?: boolean;
  has_transcript_text?: boolean;
  has_transcript_json?: boolean;
  progress_seconds?: number | null;
  total_duration_seconds?: number | null;
  diarized_speaker_count?: number | null;
  diarized_speaker_preview?: string[];
};

export type TranscriptionDetail = TranscriptionEntry & {
  analysis_content?: string | null;
  transcript_text_content?: string | null;
  transcript_json_content?: string | null;
  process_log_content?: string | null;
  whisperx_log_content?: string | null;
  calendar_match_present?: boolean;
  calendar_match_confidence?: string | null;
  calendar_match_event_title?: string | null;
  calendar_match_used_for_title?: boolean;
};

export type RenameTranscriptionSpeakerRequest = {
  speaker_label: string;
  new_name: string;
};

export type TranscriptionSyncResult = {
  ok: boolean;
  enqueued: boolean;
  job_id: string;
  run_id?: string | null;
};

export type DiarizedTranscriptTurn = {
  speakerLabel: string;
  rawSpeakerLabel: string | null;
  text: string;
  start: number | null;
  end: number | null;
};

export async function fetchTranscriptions(): Promise<TranscriptionEntry[]> {
  const response = await customFetch<{ data: TranscriptionEntry[] }>(
    "/api/v1/transcriptions",
    { method: "GET" },
  );
  return sortTranscriptionsByRecordingDate(response.data);
}

export async function fetchTranscriptionDetail(
  entryId: string,
): Promise<TranscriptionDetail> {
  const response = await customFetch<{ data: TranscriptionDetail }>(
    `/api/v1/transcriptions/${encodeURIComponent(entryId)}`,
    { method: "GET" },
  );
  return response.data;
}

export async function syncTranscriptionsNow(): Promise<TranscriptionSyncResult> {
  const response = await customFetch<{ data: TranscriptionSyncResult }>(
    "/api/v1/transcriptions/sync",
    { method: "POST" },
  );
  return response.data;
}

export async function reprocessTranscriptionsMetadata(): Promise<TranscriptionSyncResult> {
  const response = await customFetch<{ data: TranscriptionSyncResult }>(
    "/api/v1/transcriptions/reprocess-metadata",
    { method: "POST" },
  );
  return response.data;
}

export async function renameTranscriptionSpeaker(
  entryId: string,
  payload: RenameTranscriptionSpeakerRequest,
): Promise<TranscriptionDetail> {
  const response = await customFetch<{ data: TranscriptionDetail }>(
    `/api/v1/transcriptions/${encodeURIComponent(entryId)}/speakers/rename`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return response.data;
}

export async function fetchTranscriptionSourceAudioBlob(
  entryId: string,
): Promise<Blob> {
  const response = await authenticatedFetch(
    `/api/v1/transcriptions/${encodeURIComponent(entryId)}/audio`,
    { method: "GET" },
  );
  if (!response.ok) {
    let message = "Unable to load transcription audio.";
    try {
      const data = (await response.json()) as { detail?: unknown };
      if (typeof data.detail === "string" && data.detail) {
        message = data.detail;
      }
    } catch {
      // Ignore JSON parse failures for binary/text error bodies.
    }
    throw new Error(message);
  }
  return response.blob();
}

export async function exportDiarizedTranscriptionDocx(entryId: string): Promise<void> {
  const response = await authenticatedFetch(
    `/api/v1/transcriptions/${encodeURIComponent(entryId)}/export.docx`,
    { method: "GET" },
  );
  if (!response.ok) {
    let message = "Unable to export diarized transcript.";
    try {
      const data = (await response.json()) as { detail?: unknown };
      if (typeof data.detail === "string" && data.detail) {
        message = data.detail;
      }
    } catch {
      // Ignore JSON parse failures for binary/text error bodies.
    }
    throw new Error(message);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const contentDisposition = response.headers.get("content-disposition");
    const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/i);
    const filename = filenameMatch?.[1] ?? `${entryId}-diarized-transcript.docx`;
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    link.click();
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function matchesTranscriptionSearch(
  entry: TranscriptionEntry,
  searchTerm: string,
): boolean {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return true;
  return [
    entry.id,
    entry.title,
    ...entry.source_files.map((file) => file.name),
    ...entry.artifact_files.map((file) => file.name),
    ...(entry.diarized_speaker_preview ?? []),
  ].some((value) => value.toLowerCase().includes(normalized));
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseNumericField(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getDiarizedTranscriptTurns(
  transcriptJsonContent: string | null | undefined,
): DiarizedTranscriptTurn[] {
  if (!transcriptJsonContent) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(transcriptJsonContent);
  } catch {
    return [];
  }

  if (!isObjectRecord(parsed) || !Array.isArray(parsed.segments)) {
    return [];
  }

  const hasSpeakerData = parsed.segments.some(
    (segment) =>
      isObjectRecord(segment) &&
      (typeof segment.speaker === "string" || typeof segment.speaker_name === "string"),
  );
  if (!hasSpeakerData) return [];

  return parsed.segments.flatMap((segment): DiarizedTranscriptTurn[] => {
    if (!isObjectRecord(segment)) return [];

    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    if (!text) return [];

    const speakerName =
      typeof segment.speaker_name === "string" ? segment.speaker_name.trim() : "";
    const speaker = typeof segment.speaker === "string" ? segment.speaker.trim() : "";

    return [
      {
        speakerLabel: speakerName || speaker || "Unknown speaker",
        rawSpeakerLabel: speaker || null,
        text,
        start: parseNumericField(segment.start),
        end: parseNumericField(segment.end),
      },
    ];
  });
}

export function countDiarizedSpeakers(turns: DiarizedTranscriptTurn[]): number {
  return new Set(turns.map((turn) => turn.speakerLabel)).size;
}

const RAW_SPEAKER_LABEL_PATTERN = /^SPEAKER_\d+$/i;

/**
 * Collect unique human-assigned speaker names across known transcriptions plus the
 * currently-inspected transcript. Raw diarization labels like `SPEAKER_00` and the
 * fallback "Unknown speaker" placeholder are filtered out so the result is suitable
 * for autocomplete suggestions when renaming a speaker.
 */
export function collectKnownSpeakerNames(
  entries: ReadonlyArray<Pick<TranscriptionEntry, "diarized_speaker_preview">>,
  turns: ReadonlyArray<DiarizedTranscriptTurn> = [],
): string[] {
  const seen = new Map<string, string>();

  const consider = (candidate: unknown) => {
    if (typeof candidate !== "string") return;
    const trimmed = candidate.trim();
    if (!trimmed) return;
    if (RAW_SPEAKER_LABEL_PATTERN.test(trimmed)) return;
    if (trimmed.toLowerCase() === "unknown speaker") return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, trimmed);
    }
  };

  for (const entry of entries) {
    for (const name of entry.diarized_speaker_preview ?? []) {
      consider(name);
    }
  }
  for (const turn of turns) {
    consider(turn.speakerLabel);
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
  );
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

/** Unix ms from numeric entry id (seconds or millis), else -Infinity. */
function epochMsFromNumericEntryId(id: string): number {
  if (!/^\d+$/.test(id)) return Number.NEGATIVE_INFINITY;
  const n = Number(id);
  if (!Number.isFinite(n)) return Number.NEGATIVE_INFINITY;
  const sec = id.length >= 13 ? Math.floor(n / 1000) : n;
  if (!Number.isFinite(sec) || sec < 0) return Number.NEGATIVE_INFINITY;
  return sec * 1000;
}

function recordingSortTimestampMs(entry: TranscriptionEntry): number {
  const captured = parseTimestamp(entry.captured_at);
  if (captured !== Number.NEGATIVE_INFINITY) return captured;
  const fromId = epochMsFromNumericEntryId(entry.id);
  if (fromId !== Number.NEGATIVE_INFINITY) return fromId;
  return parseTimestamp(entry.processed_at);
}

/** Newest recording first (capture time / id epoch); artifact `processed_at` is only a fallback. */
export function sortTranscriptionsByRecordingDate(
  entries: TranscriptionEntry[],
): TranscriptionEntry[] {
  return [...entries].sort((left, right) => {
    const rightTs = recordingSortTimestampMs(right);
    const leftTs = recordingSortTimestampMs(left);
    if (rightTs !== leftTs) return rightTs - leftTs;
    return right.id.localeCompare(left.id);
  });
}

/** @deprecated Use {@link sortTranscriptionsByRecordingDate} */
export const sortTranscriptionsByNewest = sortTranscriptionsByRecordingDate;
