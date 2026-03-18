import { customFetch } from "@/api/mutator";

import {
  fetchFilesystemMemoryOverview,
  matchesFilesystemMemorySearch,
  selectInitialFilesystemMemoryPath,
  type FilesystemMemoryOverview,
} from "./filesystem-memory";

vi.mock("@/api/mutator", () => ({
  customFetch: vi.fn(),
}));

describe("filesystem-memory helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("selects the latest daily path when present", () => {
    const overview: FilesystemMemoryOverview = {
      lead_agent_id: "lead-1",
      lead_agent_name: "Henry",
      daily_files: [],
      latest_daily_path: "memory/2026-03-16.md",
      long_term_memory: null,
    };

    expect(selectInitialFilesystemMemoryPath(overview)).toBe(
      "memory/2026-03-16.md",
    );
  });

  it("matches search against metadata and content", () => {
    const file = {
      path: "memory/2026-03-16.md",
      kind: "daily" as const,
      label: "2026-03-16",
      date: "2026-03-16",
    };

    expect(matchesFilesystemMemorySearch(file, "2026-03-16")).toBe(true);
    expect(
      matchesFilesystemMemorySearch(file, "deployment", "Deployment blocked"),
    ).toBe(true);
    expect(matchesFilesystemMemorySearch(file, "roadmap", "Deployment blocked")).toBe(
      false,
    );
  });

  it("times out stalled overview requests", async () => {
    vi.useFakeTimers();
    vi.mocked(customFetch).mockImplementation(
      (_url, options) =>
        new Promise((_, reject) => {
          options.signal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }) as ReturnType<typeof customFetch>,
    );

    const request = fetchFilesystemMemoryOverview("board-1");
    const expectation = expect(request).rejects.toThrow(
      "Filesystem memory request timed out. Check the gateway and try again.",
    );
    await vi.advanceTimersByTimeAsync(15_000);

    await expectation;
  });
});
