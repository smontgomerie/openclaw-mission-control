import { customFetch } from "@/api/mutator";

export type TranscriptionFile = {
  name: string;
  relative_path: string;
  size_bytes?: number | null;
  modified_at?: string | null;
};

export type TranscriptionEntry = {
  id: string;
  title: string;
  is_done?: boolean;
  captured_at?: string | null;
  processed_at?: string | null;
  source_files: TranscriptionFile[];
  artifact_files: TranscriptionFile[];
  has_analysis?: boolean;
  has_transcript_text?: boolean;
  has_transcript_json?: boolean;
};

export type TranscriptionDetail = TranscriptionEntry & {
  analysis_content?: string | null;
  transcript_text_content?: string | null;
  transcript_json_content?: string | null;
};

export async function fetchTranscriptions(): Promise<TranscriptionEntry[]> {
  const response = await customFetch<{ data: TranscriptionEntry[] }>(
    "/api/v1/transcriptions",
    { method: "GET" },
  );
  return sortTranscriptionsByNewest(response.data);
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
  ].some((value) => value.toLowerCase().includes(normalized));
}

function parseTimestamp(value: string | null | undefined): number {
  if (!value) return Number.NEGATIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function sortTranscriptionsByNewest(
  entries: TranscriptionEntry[],
): TranscriptionEntry[] {
  return [...entries].sort((left, right) => {
    const rightTimestamp = Math.max(
      parseTimestamp(right.processed_at),
      parseTimestamp(right.captured_at),
    );
    const leftTimestamp = Math.max(
      parseTimestamp(left.processed_at),
      parseTimestamp(left.captured_at),
    );

    if (rightTimestamp !== leftTimestamp) {
      return rightTimestamp - leftTimestamp;
    }

    return right.id.localeCompare(left.id);
  });
}
