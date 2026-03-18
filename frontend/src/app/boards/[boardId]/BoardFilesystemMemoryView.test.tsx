import { render, screen, waitFor } from "@testing-library/react";

import { BoardFilesystemMemoryView } from "./BoardFilesystemMemoryView";

vi.mock("@/lib/filesystem-memory", () => ({
  fetchFilesystemMemoryFile: vi.fn(),
  fetchFilesystemMemoryOverview: vi.fn(),
  matchesFilesystemMemorySearch: vi.fn(() => true),
  selectInitialFilesystemMemoryPath: vi.fn(() => null),
}));

import {
  fetchFilesystemMemoryFile,
  fetchFilesystemMemoryOverview,
} from "@/lib/filesystem-memory";

describe("BoardFilesystemMemoryView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the loading state after overview fetch resolves", async () => {
    vi.mocked(fetchFilesystemMemoryOverview).mockResolvedValue({
      lead_agent_id: "lead-1",
      lead_agent_name: "Finn",
      long_term_memory: {
        path: "MEMORY.md",
        kind: "long_term",
        label: "Long-term memory",
        date: null,
        content: "# Durable context",
      },
      daily_files: [],
      latest_daily_path: null,
    });
    vi.mocked(fetchFilesystemMemoryFile).mockResolvedValue({
      path: "memory/2026-03-17.md",
      kind: "daily",
      label: "2026-03-17",
      date: "2026-03-17",
      content: "# Daily memory",
    });

    render(<BoardFilesystemMemoryView active boardId="board-1" />);

    expect(screen.getByText("Loading filesystem memory…")).toBeInTheDocument();

    await screen.findByText("Lead: Finn");
    await waitFor(() => {
      expect(
        screen.queryByText("Loading filesystem memory…"),
      ).not.toBeInTheDocument();
    });
  });
});
