import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TranscriptionsPage from "./page";

const fetchTranscriptionsMock = vi.hoisted(() => vi.fn());
const fetchTranscriptionDetailMock = vi.hoisted(() => vi.fn());
const renameTranscriptionSpeakerMock = vi.hoisted(() => vi.fn());
const fetchTranscriptionSourceAudioBlobMock = vi.hoisted(() => vi.fn());
const exportDiarizedTranscriptionDocxMock = vi.hoisted(() => vi.fn());
const syncTranscriptionsNowMock = vi.hoisted(() => vi.fn());
const reprocessTranscriptionsMetadataMock = vi.hoisted(() => vi.fn());
const fetchSpeakerDirectoryMock = vi.hoisted(() => vi.fn());
const confirmSpeakerSampleMock = vi.hoisted(() => vi.fn());

vi.mock("@/auth/clerk", () => ({
  useAuth: () => ({ isSignedIn: true }),
}));

vi.mock("@/lib/use-organization-membership", () => ({
  useOrganizationMembership: () => ({ isAdmin: true }),
}));

vi.mock("@/components/templates/DashboardPageLayout", () => ({
  DashboardPageLayout: ({
    title,
    description,
    children,
  }: React.PropsWithChildren<{ title: string; description: string }>) => (
    <div>
      <h1>{title}</h1>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock("@/components/atoms/Markdown", () => ({
  Markdown: ({ content }: { content: string }) => <div>{content}</div>,
}));

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: React.PropsWithChildren) => <span>{children}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    type = "button",
  }: React.PropsWithChildren<{
    onClick?: () => void;
    disabled?: boolean;
    type?: "button" | "submit" | "reset";
  }>) => (
    <button type={type} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: ({
    value,
    onChange,
    onKeyDown,
    onBlur,
    placeholder,
    id,
    className,
    autoFocus,
    disabled,
    ...rest
  }: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      id={id}
      className={className}
      value={value}
      onChange={onChange}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      placeholder={placeholder}
      autoFocus={autoFocus}
      disabled={disabled}
      {...rest}
    />
  ),
}));

vi.mock("@/lib/transcriptions", async () => {
  const actual = await vi.importActual<typeof import("@/lib/transcriptions")>(
    "@/lib/transcriptions",
  );
  return {
    ...actual,
    fetchTranscriptions: fetchTranscriptionsMock,
    fetchTranscriptionDetail: fetchTranscriptionDetailMock,
    renameTranscriptionSpeaker: renameTranscriptionSpeakerMock,
    fetchTranscriptionSourceAudioBlob: fetchTranscriptionSourceAudioBlobMock,
    exportDiarizedTranscriptionDocx: exportDiarizedTranscriptionDocxMock,
    syncTranscriptionsNow: syncTranscriptionsNowMock,
    reprocessTranscriptionsMetadata: reprocessTranscriptionsMetadataMock,
    fetchSpeakerDirectory: fetchSpeakerDirectoryMock,
    confirmSpeakerSample: confirmSpeakerSampleMock,
  };
});

describe("TranscriptionsPage", () => {
  beforeEach(() => {
    fetchTranscriptionsMock.mockReset();
    fetchTranscriptionDetailMock.mockReset();
    renameTranscriptionSpeakerMock.mockReset();
    fetchTranscriptionSourceAudioBlobMock.mockReset();
    exportDiarizedTranscriptionDocxMock.mockReset();
    syncTranscriptionsNowMock.mockReset();
    reprocessTranscriptionsMetadataMock.mockReset();
    fetchSpeakerDirectoryMock.mockReset();
    confirmSpeakerSampleMock.mockReset();
    fetchSpeakerDirectoryMock.mockResolvedValue({
      profiles: [],
      pending_samples: [],
    });
    fetchTranscriptionSourceAudioBlobMock.mockResolvedValue(
      new Blob(["audio"]),
    );
    exportDiarizedTranscriptionDocxMock.mockResolvedValue(undefined);
    vi.stubGlobal(
      "URL",
      Object.assign(globalThis.URL, {
        createObjectURL: vi.fn(() => "blob:test-audio"),
        revokeObjectURL: vi.fn(),
      }),
    );
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "load", {
      configurable: true,
      value: vi.fn(),
    });
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", {
      configurable: true,
      get: () => 1,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("renders speaker turns in the transcript pane when diarization is present", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-1",
        title: "entry-1",
        is_done: true,
        source_files: [{ name: "entry-1.m4a", relative_path: "entry-1.m4a" }],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-1",
      title: "entry-1",
      is_done: true,
      source_files: [{ name: "entry-1.m4a", relative_path: "entry-1.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "plain fallback transcript",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker_name: "Scott",
            speaker: "SPEAKER_00",
            start: 1.2,
            end: 4.9,
            text: "First line",
          },
          {
            speaker: "SPEAKER_01",
            start: 5.1,
            end: 6.5,
            text: "Second line",
          },
        ],
      }),
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Scott")).toBeTruthy();
    });

    expect(screen.getByText("First line")).toBeTruthy();
    expect(screen.getByText("SPEAKER_01")).toBeTruthy();
    expect(screen.queryByText("1 speaker")).toBeNull();
    expect(screen.getByText("2 speakers")).toBeTruthy();
    expect(screen.queryByText("plain fallback transcript")).toBeNull();
    expect(screen.getByRole("button", { name: /export docx/i })).toBeTruthy();
  });

  it("falls back to plain transcript text when diarization is unavailable", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-2",
        title: "entry-2",
        is_done: true,
        source_files: [{ name: "entry-2.m4a", relative_path: "entry-2.m4a" }],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-2",
      title: "entry-2",
      is_done: true,
      source_files: [{ name: "entry-2.m4a", relative_path: "entry-2.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "plain fallback transcript",
      transcript_json_content: JSON.stringify({
        segments: [{ start: 0, end: 2, text: "No speaker labels here" }],
      }),
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByText("plain fallback transcript")).toBeTruthy();
    });

    expect(screen.queryByText("Diarized")).toBeNull();
    expect(screen.queryByRole("button", { name: /export docx/i })).toBeNull();
    expect(screen.queryByText("No speaker labels here")).toBeNull();
  });

  it("exports a diarized transcript as docx", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-docx",
        title: "entry-docx",
        is_done: true,
        source_files: [
          { name: "entry-docx.m4a", relative_path: "entry-docx.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-docx",
      title: "entry-docx",
      is_done: true,
      source_files: [
        { name: "entry-docx.m4a", relative_path: "entry-docx.m4a" },
      ],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "[SPEAKER_00] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            start: 1.2,
            end: 4.9,
            text: "First line",
          },
        ],
      }),
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /export docx/i })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /export docx/i }));

    await waitFor(() => {
      expect(exportDiarizedTranscriptionDocxMock).toHaveBeenCalledWith(
        "entry-docx",
      );
    });
  });

  it("shows pending entries from source files without processed artifacts", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "pending-1",
        title: "pending-1",
        status: "pending",
        is_done: false,
        source_files: [
          { name: "pending-1.m4a", relative_path: "pending-1.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: false,
        has_transcript_json: false,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "pending-1",
      title: "pending-1",
      status: "pending",
      is_done: false,
      source_files: [{ name: "pending-1.m4a", relative_path: "pending-1.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: false,
      has_transcript_json: false,
      transcript_text_content: null,
      transcript_json_content: null,
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("Pending").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Pending files: 1")).toBeTruthy();
    expect(screen.getByText("0 artifacts")).toBeTruthy();
    expect(screen.getAllByText("pending-1.m4a").length).toBeGreaterThan(0);
  });

  it("renames a diarized speaker inline and refreshes the transcript", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-3",
        title: "entry-3",
        is_done: true,
        source_files: [{ name: "entry-3.m4a", relative_path: "entry-3.m4a" }],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-3",
      title: "entry-3",
      is_done: true,
      source_files: [{ name: "entry-3.m4a", relative_path: "entry-3.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "[SPEAKER_00] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            start: 1.2,
            end: 4.9,
            text: "First line",
          },
        ],
      }),
    });
    renameTranscriptionSpeakerMock.mockResolvedValue({
      id: "entry-3",
      title: "entry-3",
      is_done: true,
      source_files: [{ name: "entry-3.m4a", relative_path: "entry-3.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "[Scott] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            speaker_name: "Scott",
            start: 1.2,
            end: 4.9,
            text: "First line",
          },
        ],
      }),
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "SPEAKER_00" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "SPEAKER_00" }));
    const input = screen.getByDisplayValue("SPEAKER_00");
    fireEvent.change(input, { target: { value: "Scott" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(renameTranscriptionSpeakerMock).toHaveBeenCalledWith("entry-3", {
        speaker_label: "SPEAKER_00",
        new_name: "Scott",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Scott" })).toBeTruthy();
    });
    await waitFor(() => {
      expect(fetchSpeakerDirectoryMock.mock.calls.length).toBeGreaterThan(1);
    });
    expect(screen.queryByRole("button", { name: "SPEAKER_00" })).toBeNull();
  });

  it("starts pending transcriptions and reloads entries", async () => {
    fetchTranscriptionsMock
      .mockResolvedValueOnce([
        {
          id: "pending-2",
          title: "pending-2",
          status: "pending",
          is_done: false,
          source_files: [
            { name: "pending-2.m4a", relative_path: "pending-2.m4a" },
          ],
          artifact_files: [],
          has_analysis: false,
          has_transcript_text: false,
          has_transcript_json: false,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "pending-2",
          title: "pending-2",
          status: "partial",
          is_done: false,
          source_files: [
            { name: "pending-2.m4a", relative_path: "pending-2.m4a" },
          ],
          artifact_files: [
            {
              name: "transcript.txt",
              relative_path: "processed/pending-2/transcript.txt",
            },
          ],
          has_analysis: false,
          has_transcript_text: true,
          has_transcript_json: false,
        },
      ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "pending-2",
      title: "pending-2",
      status: "pending",
      is_done: false,
      source_files: [{ name: "pending-2.m4a", relative_path: "pending-2.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: false,
      has_transcript_json: false,
      transcript_text_content: null,
      transcript_json_content: null,
    });
    syncTranscriptionsNowMock.mockResolvedValue({
      ok: true,
      enqueued: true,
      job_id: "shared-transcriptions",
      run_id: "run-999",
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Pending files: 1")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /start pending/i }));

    await waitFor(() => {
      expect(syncTranscriptionsNowMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(fetchTranscriptionsMock).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getByText(
        "Transcription run queued. Pending files may take a few seconds to update.",
      ),
    ).toBeTruthy();
  });

  it("queues metadata backfill after confirmation", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-1",
        title: "entry-1",
        status: "done",
        is_done: true,
        source_files: [{ name: "entry-1.m4a", relative_path: "entry-1.m4a" }],
        artifact_files: [
          {
            name: "transcript.txt",
            relative_path: "processed/entry-1/transcript.txt",
          },
        ],
        has_analysis: true,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-1",
      title: "entry-1",
      status: "done",
      is_done: true,
      source_files: [{ name: "entry-1.m4a", relative_path: "entry-1.m4a" }],
      artifact_files: [
        {
          name: "transcript.txt",
          relative_path: "processed/entry-1/transcript.txt",
        },
      ],
      has_analysis: true,
      has_transcript_text: true,
      has_transcript_json: true,
      analysis_content: "# ok",
      transcript_text_content: "hello",
      transcript_json_content: "{}",
    });
    reprocessTranscriptionsMetadataMock.mockResolvedValue({
      ok: true,
      enqueued: true,
      job_id: "manual-transcriptions-reprocess-metadata-1",
      run_id: "run-2",
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /re-run metadata/i }),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /re-run metadata/i }));

    await waitFor(() => {
      expect(
        screen.getByText(
          /re-runs calendar matching, title generation, and speaker re-annotation/i,
        ),
      ).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /queue backfill/i }));

    await waitFor(() => {
      expect(reprocessTranscriptionsMetadataMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(fetchTranscriptionsMock).toHaveBeenCalledTimes(2);
    });
    expect(
      screen.getByText(
        "Metadata backfill queued. Calendar match, titles, and speaker labels may take several minutes to refresh.",
      ),
    ).toBeTruthy();
  });

  it("shows chunked progress for partial transcription runs", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "1774046932",
        title: "M&A process review",
        status: "partial",
        is_done: false,
        source_files: [
          { name: "1774046932.m4a", relative_path: "1774046932.m4a" },
        ],
        artifact_files: [
          {
            name: "transcript.txt",
            relative_path: "processed/1774046932/transcript.txt",
          },
        ],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        progress_seconds: 360,
        total_duration_seconds: 1839,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "1774046932",
      title: "M&A process review",
      status: "partial",
      is_done: false,
      source_files: [
        { name: "1774046932.m4a", relative_path: "1774046932.m4a" },
      ],
      artifact_files: [
        {
          name: "transcript.txt",
          relative_path: "processed/1774046932/transcript.txt",
        },
      ],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      progress_seconds: 360,
      total_duration_seconds: 1839,
      transcript_text_content: "partial transcript",
      transcript_json_content: JSON.stringify({ segments: [] }),
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(
        screen.getAllByText(/M&A process review/).length,
      ).toBeGreaterThanOrEqual(1);
    });

    await waitFor(() => {
      expect(screen.getAllByText("In progress 20%").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Chunked transcription progress")).toBeTruthy();
    expect(screen.getByText("Processed 360s of 1839s.")).toBeTruthy();
  });

  it("renders processing logs in the logs pane when available", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-logs",
        title: "entry-logs",
        status: "partial",
        is_done: false,
        source_files: [
          { name: "entry-logs.m4a", relative_path: "entry-logs.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: false,
        has_transcript_json: false,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-logs",
      title: "entry-logs",
      status: "partial",
      is_done: false,
      source_files: [
        { name: "entry-logs.m4a", relative_path: "entry-logs.m4a" },
      ],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: false,
      has_transcript_json: false,
      process_log_content: "[START] file=entry-logs.m4a",
      whisperx_log_content: "[WHISPERX_START] chunk_file=entry-logs.mp3",
      transcript_text_content: null,
      transcript_json_content: null,
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Logs" })).toBeTruthy();
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Logs" })).not.toBeDisabled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Logs" }));

    await waitFor(() => {
      expect(screen.getByText("Process log")).toBeTruthy();
    });
    expect(screen.getByText("[START] file=entry-logs.m4a")).toBeTruthy();
    expect(screen.getByText("WhisperX log")).toBeTruthy();
    expect(
      screen.getByText("[WHISPERX_START] chunk_file=entry-logs.mp3"),
    ).toBeTruthy();
  });

  it("loads source audio and plays the diarized snippet for a turn", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-4",
        title: "entry-4",
        is_done: true,
        source_files: [{ name: "entry-4.m4a", relative_path: "entry-4.m4a" }],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-4",
      title: "entry-4",
      is_done: true,
      source_files: [{ name: "entry-4.m4a", relative_path: "entry-4.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "[SPEAKER_00] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            start: 1.2,
            end: 4.9,
            text: "First line",
          },
        ],
      }),
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /play clip/i })).toBeTruthy();
    });

    expect(screen.queryByText("Chunked transcription progress")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /play clip/i }));

    await waitFor(() => {
      expect(fetchTranscriptionSourceAudioBlobMock).toHaveBeenCalledWith(
        "entry-4",
      );
    });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });

  const iso = "2026-07-15T00:00:00Z";

  it("offers saved profile names in the rename datalist after rename", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-a",
        title: "entry-a",
        is_done: true,
        source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        diarized_speaker_preview: [],
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "entry-a",
      title: "entry-a",
      is_done: true,
      source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      diarized_speaker_preview: [],
      transcript_text_content: "[SPEAKER_00] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            start: 1.2,
            end: 4.9,
            text: "First line",
          },
        ],
      }),
    });
    const adaProfile = {
      id: "ada-profile",
      display_name: "Ada",
      aliases: ["Addie"],
      encoder: "ecapa",
      confirmed_sample_count: 1,
      represented_sample_count: 1,
      pending_sample_count: 0,
      created_at: iso,
      updated_at: iso,
    };
    let directory = { profiles: [adaProfile], pending_samples: [] as object[] };
    fetchSpeakerDirectoryMock.mockImplementation(async () => directory);
    const renamedDetail = {
      id: "entry-a",
      title: "entry-a",
      is_done: true,
      source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      diarized_speaker_preview: [],
      transcript_text_content: "[Scott] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            speaker_name: "Scott",
            start: 1.2,
            end: 4.9,
            text: "First line",
          },
        ],
      }),
    };
    renameTranscriptionSpeakerMock.mockImplementation(async () => {
      directory = {
        profiles: [
          adaProfile,
          {
            id: "scott-profile",
            display_name: "Scott",
            aliases: [],
            encoder: "ecapa",
            confirmed_sample_count: 1,
            represented_sample_count: 1,
            pending_sample_count: 0,
            created_at: iso,
            updated_at: iso,
          },
        ],
        pending_samples: [],
      };
      return renamedDetail;
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "SPEAKER_00" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "SPEAKER_00" }));
    const renameInput = screen.getByLabelText("Rename speaker SPEAKER_00");
    const listId = renameInput.getAttribute("list");
    expect(listId).toBeTruthy();
    expect(
      document.querySelector(`#${listId} option[value="Ada"]`),
    ).toBeTruthy();
    expect(
      document.querySelector(`#${listId} option[value="Addie"]`),
    ).toBeTruthy();

    fireEvent.change(renameInput, { target: { value: "Scott" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Scott" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Scott" }));
    const afterInput = screen.getByLabelText("Rename speaker Scott");
    const afterListId = afterInput.getAttribute("list")!;
    expect(
      document.querySelector(`#${afterListId} option[value="Scott"]`),
    ).toBeTruthy();
  });

  it("clears the shared Speakers review queue after rename without a reload", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "recording-1",
        title: "recording-1",
        is_done: true,
        source_files: [
          { name: "recording-1.m4a", relative_path: "recording-1.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockResolvedValue({
      id: "recording-1",
      title: "recording-1",
      is_done: true,
      source_files: [
        { name: "recording-1.m4a", relative_path: "recording-1.m4a" },
      ],
      artifact_files: [],
      has_analysis: false,
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "[SPEAKER_00] This is Steve speaking.",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            start: 12,
            end: 16,
            text: "This is Steve speaking.",
          },
        ],
      }),
    });
    const pendingDirectory = {
      profiles: [
        {
          id: "monil-profile",
          display_name: "Monil",
          aliases: [],
          encoder: "ecapa",
          confirmed_sample_count: 3,
          represented_sample_count: 3,
          pending_sample_count: 1,
          created_at: iso,
          updated_at: iso,
        },
      ],
      pending_samples: [
        {
          id: "pending-sample",
          candidate_profile_id: "monil-profile",
          candidate_name: "Monil",
          transcription_entry_id: "recording-1",
          speaker_label: "SPEAKER_00",
          source_audio_path: "recording-1.m4a",
          encoder: "ecapa",
          speech_duration_seconds: 4,
          segment_count: 1,
          segment_evidence: [],
          similarity: 0.29,
          status: "pending",
          source_type: "observation",
          represented_sample_count: 1,
          created_at: iso,
          updated_at: iso,
        },
      ],
    };
    const clearedDirectory = {
      profiles: [
        {
          id: "steve-profile",
          display_name: "Steve",
          aliases: [],
          encoder: "ecapa",
          confirmed_sample_count: 1,
          represented_sample_count: 1,
          pending_sample_count: 0,
          created_at: iso,
          updated_at: iso,
        },
      ],
      pending_samples: [],
    };
    let directory = pendingDirectory;
    fetchSpeakerDirectoryMock.mockImplementation(async () => directory);
    renameTranscriptionSpeakerMock.mockImplementation(async () => {
      directory = clearedDirectory;
      return {
        id: "recording-1",
        title: "recording-1",
        is_done: true,
        source_files: [
          { name: "recording-1.m4a", relative_path: "recording-1.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content: "[Steve] This is Steve speaking.",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              speaker_name: "Steve",
              start: 12,
              end: 16,
              text: "This is Steve speaking.",
            },
          ],
        }),
      };
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Review: Monil \(29%\)/)).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "SPEAKER_00" }));
    fireEvent.change(screen.getByLabelText("Rename speaker SPEAKER_00"), {
      target: { value: "Steve" },
    });
    fireEvent.keyDown(screen.getByLabelText("Rename speaker SPEAKER_00"), {
      key: "Enter",
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Steve" })).toBeTruthy();
    });
    expect(screen.queryByText(/Review: Monil/)).toBeNull();
    expect(
      screen.getByText("No speaker observations need review."),
    ).toBeTruthy();
  });

  it("refreshes the open transcript after confirming a pending speaker sample", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-confirm",
        title: "entry-confirm",
        is_done: true,
        source_files: [
          { name: "entry-confirm.m4a", relative_path: "entry-confirm.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock
      .mockResolvedValueOnce({
        id: "entry-confirm",
        title: "entry-confirm",
        is_done: true,
        source_files: [
          { name: "entry-confirm.m4a", relative_path: "entry-confirm.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content: "[SPEAKER_00] Hello",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              start: 1,
              end: 4,
              text: "Hello",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        id: "entry-confirm",
        title: "entry-confirm",
        is_done: true,
        source_files: [
          { name: "entry-confirm.m4a", relative_path: "entry-confirm.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content: "[Jamie] Hello",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              speaker_name: "Jamie",
              start: 1,
              end: 4,
              text: "Hello",
            },
          ],
        }),
      });
    let directory: {
      profiles: object[];
      pending_samples: object[];
    } = {
      profiles: [],
      pending_samples: [
        {
          id: "sample-confirm",
          candidate_profile_id: null,
          candidate_name: null,
          transcription_entry_id: "entry-confirm",
          speaker_label: "SPEAKER_00",
          source_audio_path: "entry-confirm.m4a",
          encoder: "ecapa",
          speech_duration_seconds: 4,
          segment_count: 1,
          segment_evidence: [],
          similarity: null,
          status: "pending",
          source_type: "observation",
          represented_sample_count: 1,
          created_at: iso,
          updated_at: iso,
        },
      ],
    };
    fetchSpeakerDirectoryMock.mockImplementation(async () => directory);
    confirmSpeakerSampleMock.mockImplementation(async () => {
      directory = {
        profiles: [
          {
            id: "jamie-profile",
            display_name: "Jamie",
            aliases: [],
            encoder: "ecapa",
            confirmed_sample_count: 1,
            represented_sample_count: 1,
            pending_sample_count: 0,
            created_at: iso,
            updated_at: iso,
          },
        ],
        pending_samples: [],
      };
      return directory.profiles[0];
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Review speaker/i }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Review speaker/i }));
    fireEvent.change(screen.getByLabelText("Confirm new speaker name"), {
      target: { value: "Jamie" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm example/i }));

    await waitFor(() => {
      expect(confirmSpeakerSampleMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Jamie" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "SPEAKER_00" })).toBeNull();
  });

  it("refreshes the open transcript after confirming from the Speakers panel", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-panel",
        title: "entry-panel",
        is_done: true,
        source_files: [
          { name: "entry-panel.m4a", relative_path: "entry-panel.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock
      .mockResolvedValueOnce({
        id: "entry-panel",
        title: "entry-panel",
        is_done: true,
        source_files: [
          { name: "entry-panel.m4a", relative_path: "entry-panel.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content: "[SPEAKER_00] Hello",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              start: 1,
              end: 4,
              text: "Hello",
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        id: "entry-panel",
        title: "entry-panel",
        is_done: true,
        source_files: [
          { name: "entry-panel.m4a", relative_path: "entry-panel.m4a" },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content: "[Riley] Hello",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              speaker_name: "Riley",
              start: 1,
              end: 4,
              text: "Hello",
            },
          ],
        }),
      });
    let directory: {
      profiles: object[];
      pending_samples: object[];
    } = {
      profiles: [],
      pending_samples: [
        {
          id: "sample-panel",
          candidate_profile_id: null,
          candidate_name: null,
          transcription_entry_id: "entry-panel",
          speaker_label: "SPEAKER_00",
          source_audio_path: "entry-panel.m4a",
          encoder: "ecapa",
          speech_duration_seconds: 4,
          segment_count: 1,
          segment_evidence: [],
          similarity: null,
          status: "pending",
          source_type: "observation",
          represented_sample_count: 1,
          created_at: iso,
          updated_at: iso,
        },
      ],
    };
    fetchSpeakerDirectoryMock.mockImplementation(async () => directory);
    confirmSpeakerSampleMock.mockImplementation(async () => {
      directory = {
        profiles: [
          {
            id: "riley-profile",
            display_name: "Riley",
            aliases: [],
            encoder: "ecapa",
            confirmed_sample_count: 1,
            represented_sample_count: 1,
            pending_sample_count: 0,
            created_at: iso,
            updated_at: iso,
          },
        ],
        pending_samples: [],
      };
      return directory.profiles[0];
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Confirm$/ })).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText("Or create a new speaker"), {
      target: { value: "Riley" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/ }));

    await waitFor(() => {
      expect(confirmSpeakerSampleMock).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Riley" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "SPEAKER_00" })).toBeNull();
  });

  it("shows a Speakers panel error if transcript refresh fails after panel confirm", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-panel-fail",
        title: "entry-panel-fail",
        is_done: true,
        source_files: [
          {
            name: "entry-panel-fail.m4a",
            relative_path: "entry-panel-fail.m4a",
          },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock
      .mockResolvedValueOnce({
        id: "entry-panel-fail",
        title: "entry-panel-fail",
        is_done: true,
        source_files: [
          {
            name: "entry-panel-fail.m4a",
            relative_path: "entry-panel-fail.m4a",
          },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content: "[SPEAKER_00] Hello",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              start: 1,
              end: 4,
              text: "Hello",
            },
          ],
        }),
      })
      .mockRejectedValueOnce(new Error("panel transcript refresh failed"));
    let directory: {
      profiles: object[];
      pending_samples: object[];
    } = {
      profiles: [],
      pending_samples: [
        {
          id: "sample-panel-fail",
          candidate_profile_id: null,
          candidate_name: null,
          transcription_entry_id: "entry-panel-fail",
          speaker_label: "SPEAKER_00",
          source_audio_path: "entry-panel-fail.m4a",
          encoder: "ecapa",
          speech_duration_seconds: 4,
          segment_count: 1,
          segment_evidence: [],
          similarity: null,
          status: "pending",
          source_type: "observation",
          represented_sample_count: 1,
          created_at: iso,
          updated_at: iso,
        },
      ],
    };
    fetchSpeakerDirectoryMock.mockImplementation(async () => directory);
    confirmSpeakerSampleMock.mockImplementation(async () => {
      directory = { profiles: [], pending_samples: [] };
      return {};
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^Confirm$/ })).toBeTruthy();
    });
    fireEvent.change(screen.getByPlaceholderText("Or create a new speaker"), {
      target: { value: "Riley" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Confirm$/ }));

    await waitFor(() => {
      expect(screen.getByText("panel transcript refresh failed")).toBeTruthy();
    });
  });

  it("shows a refresh error after confirm succeeds if the transcript reload fails", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-refresh-fail",
        title: "entry-refresh-fail",
        is_done: true,
        source_files: [
          {
            name: "entry-refresh-fail.m4a",
            relative_path: "entry-refresh-fail.m4a",
          },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock
      .mockResolvedValueOnce({
        id: "entry-refresh-fail",
        title: "entry-refresh-fail",
        is_done: true,
        source_files: [
          {
            name: "entry-refresh-fail.m4a",
            relative_path: "entry-refresh-fail.m4a",
          },
        ],
        artifact_files: [],
        has_analysis: false,
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content: "[SPEAKER_00] Hello",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: "SPEAKER_00",
              start: 1,
              end: 4,
              text: "Hello",
            },
          ],
        }),
      })
      .mockRejectedValueOnce(new Error("transcript refresh failed"));
    let directory: {
      profiles: object[];
      pending_samples: object[];
    } = {
      profiles: [],
      pending_samples: [
        {
          id: "sample-refresh-fail",
          candidate_profile_id: null,
          candidate_name: null,
          transcription_entry_id: "entry-refresh-fail",
          speaker_label: "SPEAKER_00",
          source_audio_path: "entry-refresh-fail.m4a",
          encoder: "ecapa",
          speech_duration_seconds: 4,
          segment_count: 1,
          segment_evidence: [],
          similarity: null,
          status: "pending",
          source_type: "observation",
          represented_sample_count: 1,
          created_at: iso,
          updated_at: iso,
        },
      ],
    };
    fetchSpeakerDirectoryMock.mockImplementation(async () => directory);
    confirmSpeakerSampleMock.mockImplementation(async () => {
      directory = { profiles: [], pending_samples: [] };
      return {};
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /Review speaker/i }),
      ).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /Review speaker/i }));
    fireEvent.change(screen.getByLabelText("Confirm new speaker name"), {
      target: { value: "Jamie" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Confirm example/i }));

    await waitFor(() => {
      expect(screen.getByText("transcript refresh failed")).toBeTruthy();
    });
    expect(
      screen.queryByRole("button", { name: /Confirm example/i }),
    ).toBeNull();
  });

  it("shows a Speakers load error instead of spinning forever", async () => {
    fetchTranscriptionsMock.mockResolvedValue([]);
    fetchSpeakerDirectoryMock.mockRejectedValue(new Error("directory down"));

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByText("directory down")).toBeTruthy();
    });
    expect(screen.queryByText("Loading speaker profiles…")).toBeNull();
    expect(
      screen.getByText("Speaker profiles could not be loaded."),
    ).toBeTruthy();
  });

  it("does not keep the previous transcript on screen after a failed detail fetch", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-a",
        title: "First recording",
        is_done: true,
        source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
      },
      {
        id: "entry-b",
        title: "Second recording",
        is_done: true,
        source_files: [{ name: "entry-b.m4a", relative_path: "entry-b.m4a" }],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockImplementation(async (entryId: string) => {
      if (entryId === "entry-a") {
        return {
          id: "entry-a",
          title: "First recording",
          is_done: true,
          source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
          artifact_files: [],
          has_transcript_text: true,
          has_transcript_json: true,
          transcript_text_content: "[Ada] Only in the first recording",
          transcript_json_content: JSON.stringify({
            segments: [
              {
                speaker: "SPEAKER_00",
                speaker_name: "Ada",
                text: "Only in the first recording",
              },
            ],
          }),
        };
      }
      throw new Error("detail missing");
    });

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByText("Only in the first recording")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: /Second recording/ }));

    await waitFor(() => {
      expect(screen.getByText("detail missing")).toBeTruthy();
    });
    expect(screen.queryByText("Only in the first recording")).toBeNull();
  });

  it("does not apply a rename response after the selected recording changes", async () => {
    let resolveRename: ((value: object) => void) | undefined;
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-a",
        title: "First recording",
        is_done: true,
        source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
      },
      {
        id: "entry-b",
        title: "Second recording",
        is_done: true,
        source_files: [{ name: "entry-b.m4a", relative_path: "entry-b.m4a" }],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockImplementation(
      async (entryId: string) => ({
        id: entryId,
        title: entryId === "entry-a" ? "First recording" : "Second recording",
        is_done: true,
        source_files: [
          { name: `${entryId}.m4a`, relative_path: `${entryId}.m4a` },
        ],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content:
          entryId === "entry-a"
            ? "[SPEAKER_00] First line"
            : "[SPEAKER_01] Second line",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: entryId === "entry-a" ? "SPEAKER_00" : "SPEAKER_01",
              start: 1,
              end: 2,
              text: entryId === "entry-a" ? "First line" : "Second line",
            },
          ],
        }),
      }),
    );
    renameTranscriptionSpeakerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRename = resolve;
        }),
    );

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "SPEAKER_00" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "SPEAKER_00" }));
    fireEvent.change(screen.getByLabelText("Rename speaker SPEAKER_00"), {
      target: { value: "Scott" },
    });
    fireEvent.keyDown(screen.getByLabelText("Rename speaker SPEAKER_00"), {
      key: "Enter",
    });

    fireEvent.click(screen.getByRole("button", { name: /Second recording/ }));

    await waitFor(() => {
      expect(screen.getByText("Second line")).toBeTruthy();
    });

    resolveRename?.({
      id: "entry-a",
      title: "First recording",
      is_done: true,
      source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
      artifact_files: [],
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "[Scott] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            speaker_name: "Scott",
            start: 1,
            end: 2,
            text: "First line",
          },
        ],
      }),
    });

    await waitFor(() => {
      expect(renameTranscriptionSpeakerMock).toHaveBeenCalled();
    });
    expect(screen.getByText("Second line")).toBeTruthy();
    expect(screen.queryByText("First line")).toBeNull();
  });

  it("applies a rename response after returning to the original recording", async () => {
    let resolveRename: ((value: object) => void) | undefined;
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "entry-a",
        title: "First recording",
        is_done: true,
        source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
      },
      {
        id: "entry-b",
        title: "Second recording",
        is_done: true,
        source_files: [{ name: "entry-b.m4a", relative_path: "entry-b.m4a" }],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
      },
    ]);
    fetchTranscriptionDetailMock.mockImplementation(
      async (entryId: string) => ({
        id: entryId,
        title: entryId === "entry-a" ? "First recording" : "Second recording",
        is_done: true,
        source_files: [
          { name: `${entryId}.m4a`, relative_path: `${entryId}.m4a` },
        ],
        artifact_files: [],
        has_transcript_text: true,
        has_transcript_json: true,
        transcript_text_content:
          entryId === "entry-a"
            ? "[SPEAKER_00] First line"
            : "[SPEAKER_01] Second line",
        transcript_json_content: JSON.stringify({
          segments: [
            {
              speaker: entryId === "entry-a" ? "SPEAKER_00" : "SPEAKER_01",
              start: 1,
              end: 2,
              text: entryId === "entry-a" ? "First line" : "Second line",
            },
          ],
        }),
      }),
    );
    renameTranscriptionSpeakerMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRename = resolve;
        }),
    );

    render(<TranscriptionsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "SPEAKER_00" })).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "SPEAKER_00" }));
    fireEvent.change(screen.getByLabelText("Rename speaker SPEAKER_00"), {
      target: { value: "Scott" },
    });
    fireEvent.keyDown(screen.getByLabelText("Rename speaker SPEAKER_00"), {
      key: "Enter",
    });

    fireEvent.click(screen.getByRole("button", { name: /Second recording/ }));
    await waitFor(() => {
      expect(screen.getByText("Second line")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: /First recording/ }));
    await waitFor(() => {
      expect(screen.getByText("First line")).toBeTruthy();
    });

    resolveRename?.({
      id: "entry-a",
      title: "First recording",
      is_done: true,
      source_files: [{ name: "entry-a.m4a", relative_path: "entry-a.m4a" }],
      artifact_files: [],
      has_transcript_text: true,
      has_transcript_json: true,
      transcript_text_content: "[Scott] First line",
      transcript_json_content: JSON.stringify({
        segments: [
          {
            speaker: "SPEAKER_00",
            speaker_name: "Scott",
            start: 1,
            end: 2,
            text: "First line",
          },
        ],
      }),
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Scott" })).toBeTruthy();
    });
    expect(screen.queryByRole("button", { name: "SPEAKER_00" })).toBeNull();
  });
});
