import { describe, expect, it } from "vitest";

import {
  collectKnownSpeakerNames,
  countDiarizedSpeakers,
  getDiarizedTranscriptTurns,
  matchesTranscriptionSearch,
  sortTranscriptionsByRecordingDate,
  type DiarizedTranscriptTurn,
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

  it("sorts by recording time (captured / id), not artifact processed_at", () => {
    const entries: TranscriptionEntry[] = [
      {
        id: "1700000000",
        title: "old recording",
        captured_at: "2001-09-09T01:46:40.000Z",
        processed_at: "2026-04-20T12:00:00.000Z",
        source_files: [],
        artifact_files: [],
      },
      {
        id: "1800000000",
        title: "new recording",
        captured_at: "2007-01-14T22:40:00.000Z",
        processed_at: "2008-01-01T00:00:00.000Z",
        source_files: [],
        artifact_files: [],
      },
    ];

    expect(sortTranscriptionsByRecordingDate(entries).map((entry) => entry.id)).toEqual([
      "1800000000",
      "1700000000",
    ]);
  });

  it("falls back to processed_at only when there is no capture time or numeric id", () => {
    const entries: TranscriptionEntry[] = [
      {
        id: "older-processed",
        title: "older-processed",
        processed_at: "2026-03-17T10:00:00Z",
        source_files: [],
        artifact_files: [],
      },
      {
        id: "newer-processed",
        title: "newer-processed",
        processed_at: "2026-03-18T11:00:00Z",
        source_files: [],
        artifact_files: [],
      },
    ];

    expect(sortTranscriptionsByRecordingDate(entries).map((entry) => entry.id)).toEqual([
      "newer-processed",
      "older-processed",
    ]);
  });

  it("extracts diarized speaker turns from transcript json", () => {
    const turns = getDiarizedTranscriptTurns(`{
      "segments": [
        { "speaker_name": "Scott", "speaker": "SPEAKER_00", "start": 1.2, "end": 3.8, "text": " Hello there " },
        { "speaker": "SPEAKER_01", "start": "4.0", "end": "5.5", "text": "General Kenobi" }
      ]
    }`);

    expect(turns).toEqual([
      {
        speakerLabel: "Scott",
        rawSpeakerLabel: "SPEAKER_00",
        text: "Hello there",
        start: 1.2,
        end: 3.8,
      },
      {
        speakerLabel: "SPEAKER_01",
        rawSpeakerLabel: "SPEAKER_01",
        text: "General Kenobi",
        start: 4,
        end: 5.5,
      },
    ]);
    expect(countDiarizedSpeakers(turns)).toBe(2);
  });

  it("collects unique human speaker names from entries and current turns, excluding raw labels", () => {
    const entries: Array<Pick<TranscriptionEntry, "diarized_speaker_preview">> = [
      { diarized_speaker_preview: ["Scott", "Ava", "SPEAKER_00"] },
      { diarized_speaker_preview: ["ava", "Unknown speaker", "  "] },
      { diarized_speaker_preview: undefined },
    ];
    const turns: DiarizedTranscriptTurn[] = [
      { speakerLabel: "Jamie", rawSpeakerLabel: "SPEAKER_02", text: "hi", start: 0, end: 1 },
      { speakerLabel: "SPEAKER_03", rawSpeakerLabel: "SPEAKER_03", text: "yo", start: 1, end: 2 },
      { speakerLabel: "scott", rawSpeakerLabel: "SPEAKER_00", text: "again", start: 2, end: 3 },
    ];

    expect(collectKnownSpeakerNames(entries, turns)).toEqual(["Ava", "Jamie", "Scott"]);
  });

  it("returns an empty list when no human speaker names are present", () => {
    expect(
      collectKnownSpeakerNames([{ diarized_speaker_preview: ["SPEAKER_00", "Unknown speaker"] }]),
    ).toEqual([]);
  });

  it("ignores non-diarized and malformed transcript json", () => {
    expect(
      getDiarizedTranscriptTurns(`{"segments":[{"start":0,"end":1,"text":"No speaker"}]}`),
    ).toEqual([]);
    expect(getDiarizedTranscriptTurns("{not-json")).toEqual([]);
    expect(getDiarizedTranscriptTurns(null)).toEqual([]);
  });
});
