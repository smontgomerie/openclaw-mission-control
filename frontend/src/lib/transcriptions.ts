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

export type SpeakerProfile = {
  id: string;
  display_name: string;
  aliases: string[];
  encoder: string;
  confirmed_sample_count: number;
  represented_sample_count: number;
  pending_sample_count: number;
  created_at: string;
  updated_at: string;
};

export type SpeakerVoiceSample = {
  id: string;
  profile_id?: string | null;
  candidate_profile_id?: string | null;
  candidate_name?: string | null;
  transcription_entry_id?: string | null;
  speaker_label?: string | null;
  source_audio_path?: string | null;
  encoder: string;
  speech_duration_seconds?: number | null;
  segment_count?: number | null;
  segment_evidence: Array<{
    id: string;
    start?: number | null;
    end?: number | null;
    text?: string;
  }>;
  similarity?: number | null;
  clip_start_seconds?: number | null;
  clip_end_seconds?: number | null;
  second_similarity?: number | null;
  status: string;
  source_type: string;
  represented_sample_count: number;
  created_at: string;
  updated_at: string;
};

export type SpeakerBackfillPreview = {
  snapshot_hash: string;
  recording_count: number;
  transcript_count: number;
  annotated_recording_count: number;
  unannotated_recording_count: number;
  speaker_names: Record<string, number>;
  tentative_annotation_count: number;
  skipped: Array<{ entry_id: string; reason: string }>;
};

export type SpeakerBackfillRun = {
  id: string;
  snapshot_hash: string;
  status: string;
  total_recordings: number;
  processed_recordings: number;
  confirmed_samples: number;
  pending_samples: number;
  skipped_recordings: number;
  errors: Array<Record<string, unknown>>;
};

export type SpeakerDirectory = {
  profiles: SpeakerProfile[];
  pending_samples: SpeakerVoiceSample[];
};

export type DiarizedTranscriptTurn = {
  speakerLabel: string;
  rawSpeakerLabel: string | null;
  text: string;
  start: number | null;
  end: number | null;
};

export async function fetchTranscriptions(options?: {
  offset?: number;
  limit?: number;
}): Promise<TranscriptionEntry[]> {
  const query = new URLSearchParams();
  if (options?.offset) query.set("offset", String(options.offset));
  if (options?.limit) query.set("limit", String(options.limit));
  const suffix = query.size ? `?${query.toString()}` : "";
  const response = await customFetch<{ data: TranscriptionEntry[] }>(
    `/api/v1/transcriptions${suffix}`,
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

export async function fetchSpeakerDirectory(): Promise<SpeakerDirectory> {
  const response = await customFetch<{ data: SpeakerDirectory }>(
    "/api/v1/transcriptions/speakers",
    { method: "GET" },
  );
  return response.data;
}

export async function previewSpeakerAnnotationImport(): Promise<SpeakerBackfillPreview> {
  const response = await customFetch<{ data: SpeakerBackfillPreview }>(
    "/api/v1/transcriptions/speakers/annotation-import/preview",
    { method: "GET" },
  );
  return response.data;
}

export async function startSpeakerAnnotationImport(
  snapshotHash: string,
): Promise<SpeakerBackfillRun> {
  const response = await customFetch<{ data: SpeakerBackfillRun }>(
    "/api/v1/transcriptions/speakers/annotation-imports",
    { method: "POST", body: JSON.stringify({ snapshot_hash: snapshotHash }) },
  );
  return response.data;
}

export async function fetchSpeakerAnnotationImport(
  runId: string,
): Promise<SpeakerBackfillRun> {
  const response = await customFetch<{ data: SpeakerBackfillRun }>(
    `/api/v1/transcriptions/speakers/annotation-imports/${encodeURIComponent(runId)}`,
    { method: "GET" },
  );
  return response.data;
}

export async function importLegacySpeakerRegistry(): Promise<SpeakerDirectory> {
  const response = await customFetch<{ data: SpeakerDirectory }>(
    "/api/v1/transcriptions/speakers/import-legacy",
    { method: "POST" },
  );
  return response.data;
}

export async function confirmSpeakerSample(
  sampleId: string,
  payload: {
    profile_id?: string;
    new_name?: string;
    excluded_segment_ids?: string[];
  },
): Promise<SpeakerProfile> {
  const response = await customFetch<{ data: SpeakerProfile }>(
    `/api/v1/transcriptions/speakers/samples/${encodeURIComponent(sampleId)}/confirm`,
    { method: "POST", body: JSON.stringify(payload) },
  );
  return response.data;
}

export async function rejectSpeakerSample(sampleId: string): Promise<void> {
  await customFetch<{ data: { ok: boolean } }>(
    `/api/v1/transcriptions/speakers/samples/${encodeURIComponent(sampleId)}/reject`,
    { method: "POST" },
  );
}

export async function renameSpeakerProfile(
  profileId: string,
  displayName: string,
): Promise<SpeakerProfile> {
  const response = await customFetch<{ data: SpeakerProfile }>(
    `/api/v1/transcriptions/speakers/${encodeURIComponent(profileId)}`,
    { method: "PATCH", body: JSON.stringify({ display_name: displayName }) },
  );
  return response.data;
}

export async function mergeSpeakerProfiles(
  sourceProfileId: string,
  targetProfileId: string,
): Promise<SpeakerProfile> {
  const response = await customFetch<{ data: SpeakerProfile }>(
    `/api/v1/transcriptions/speakers/${encodeURIComponent(sourceProfileId)}/merge`,
    {
      method: "POST",
      body: JSON.stringify({ target_profile_id: targetProfileId }),
    },
  );
  return response.data;
}

export async function deleteSpeakerProfile(profileId: string): Promise<void> {
  await customFetch<{ data: { ok: boolean } }>(
    `/api/v1/transcriptions/speakers/${encodeURIComponent(profileId)}`,
    { method: "DELETE" },
  );
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

export async function exportDiarizedTranscriptionDocx(
  entryId: string,
): Promise<void> {
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
    const filename =
      filenameMatch?.[1] ?? `${entryId}-diarized-transcript.docx`;
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
      (typeof segment.speaker === "string" ||
        typeof segment.speaker_name === "string"),
  );
  if (!hasSpeakerData) return [];

  return parsed.segments.flatMap((segment): DiarizedTranscriptTurn[] => {
    if (!isObjectRecord(segment)) return [];

    const text = typeof segment.text === "string" ? segment.text.trim() : "";
    if (!text) return [];

    const speakerName =
      typeof segment.speaker_name === "string"
        ? segment.speaker_name.trim()
        : "";
    const speaker =
      typeof segment.speaker === "string" ? segment.speaker.trim() : "";

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
