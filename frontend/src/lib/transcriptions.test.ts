import { describe, expect, it } from "vitest";

import {
  matchesTranscriptionSearch,
  sortTranscriptionsByNewest,
  type TranscriptionEntry,
} from "./transcriptions";

describe("transcriptions helpers", () => {
  it("matches entry ids and artifact names", () => {
    const entry: TranscriptionEntry = {
      id: "1773166957",
      title: "1773166957",
      is_done: true,
      source_files: [{ name: "1773166957.m4a", relative_path: "1773166957.m4a" }],
      artifact_files: [
        {
          name: "analysis.md",
          relative_path: "processed/1773166957/analysis.md",
        },
      ],
      has_analysis: true,
      has_transcript_text: true,
      has_transcript_json: false,
    };

    expect(matchesTranscriptionSearch(entry, "1773166957")).toBe(true);
    expect(matchesTranscriptionSearch(entry, "analysis")).toBe(true);
    expect(matchesTranscriptionSearch(entry, "roadmap")).toBe(false);
  });

  it("sorts entries newest first by processed date with captured date fallback", () => {
    const entries: TranscriptionEntry[] = [
      {
        id: "older-processed",
        title: "older-processed",
        processed_at: "2026-03-17T10:00:00Z",
        source_files: [],
        artifact_files: [],
      },
      {
        id: "newer-captured",
        title: "newer-captured",
        captured_at: "2026-03-18T09:00:00Z",
        source_files: [],
        artifact_files: [],
      },
      {
        id: "newest-processed",
        title: "newest-processed",
        processed_at: "2026-03-18T11:00:00Z",
        source_files: [],
        artifact_files: [],
      },
    ];

    expect(sortTranscriptionsByNewest(entries).map((entry) => entry.id)).toEqual([
      "newest-processed",
      "newer-captured",
      "older-processed",
    ]);
  });
});
