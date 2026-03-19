import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import TranscriptionsPage from "./page";

const fetchTranscriptionsMock = vi.hoisted(() => vi.fn());
const fetchTranscriptionDetailMock = vi.hoisted(() => vi.fn());

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
    placeholder,
    id,
    className,
  }: {
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    placeholder?: string;
    id?: string;
    className?: string;
  }) => (
    <input
      id={id}
      className={className}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
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
  };
});

describe("TranscriptionsPage", () => {
  beforeEach(() => {
    fetchTranscriptionsMock.mockReset();
    fetchTranscriptionDetailMock.mockReset();
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
});
