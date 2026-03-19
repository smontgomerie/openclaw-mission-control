import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TranscriptionsPage from "./page";

const fetchTranscriptionsMock = vi.hoisted(() => vi.fn());
const fetchTranscriptionDetailMock = vi.hoisted(() => vi.fn());
const renameTranscriptionSpeakerMock = vi.hoisted(() => vi.fn());
const fetchTranscriptionSourceAudioBlobMock = vi.hoisted(() => vi.fn());

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
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement>) => void;
    onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void;
    placeholder?: string;
    id?: string;
    className?: string;
    autoFocus?: boolean;
    disabled?: boolean;
  }) => (
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
    />
  ),
}));

vi.mock("@/lib/transcriptions", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/transcriptions")>(
      "@/lib/transcriptions",
    );
  return {
    ...actual,
    fetchTranscriptions: fetchTranscriptionsMock,
    fetchTranscriptionDetail: fetchTranscriptionDetailMock,
    renameTranscriptionSpeaker: renameTranscriptionSpeakerMock,
    fetchTranscriptionSourceAudioBlob: fetchTranscriptionSourceAudioBlobMock,
  };
});

describe("TranscriptionsPage", () => {
  beforeEach(() => {
    fetchTranscriptionsMock.mockReset();
    fetchTranscriptionDetailMock.mockReset();
    renameTranscriptionSpeakerMock.mockReset();
    fetchTranscriptionSourceAudioBlobMock.mockReset();
    fetchTranscriptionSourceAudioBlobMock.mockResolvedValue(new Blob(["audio"]));
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
    expect(screen.queryByText("No speaker labels here")).toBeNull();
  });

  it("shows pending entries from source files without processed artifacts", async () => {
    fetchTranscriptionsMock.mockResolvedValue([
      {
        id: "pending-1",
        title: "pending-1",
        status: "pending",
        is_done: false,
        source_files: [{ name: "pending-1.m4a", relative_path: "pending-1.m4a" }],
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
    expect(screen.queryByRole("button", { name: "SPEAKER_00" })).toBeNull();
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

    fireEvent.click(screen.getByRole("button", { name: /play clip/i }));

    await waitFor(() => {
      expect(fetchTranscriptionSourceAudioBlobMock).toHaveBeenCalledWith("entry-4");
    });
    expect(HTMLMediaElement.prototype.play).toHaveBeenCalled();
  });
});
