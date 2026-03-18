import { customFetch } from "@/api/mutator";

const FILESYSTEM_MEMORY_TIMEOUT_MS = 15_000;

export type FilesystemMemoryKind = "long_term" | "daily";

export type FilesystemMemoryFile = {
  path: string;
  kind: FilesystemMemoryKind;
  label: string;
  date?: string | null;
};

export type FilesystemMemoryContent = FilesystemMemoryFile & {
  content: string;
};

export type FilesystemMemoryOverview = {
  lead_agent_id: string;
  lead_agent_name: string;
  long_term_memory?: FilesystemMemoryContent | null;
  daily_files: FilesystemMemoryFile[];
  latest_daily_path?: string | null;
};

const withFilesystemMemoryTimeout = async <T>(
  request: (signal: AbortSignal) => Promise<{ data: T }>,
): Promise<T> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FILESYSTEM_MEMORY_TIMEOUT_MS);

  try {
    const response = await request(controller.signal);
    return response.data;
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(
        "Filesystem memory request timed out. Check the gateway and try again.",
      );
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
};

export const fetchFilesystemMemoryOverview = async (
  boardId: string,
): Promise<FilesystemMemoryOverview> => {
  return withFilesystemMemoryTimeout((signal) =>
    customFetch<{ data: FilesystemMemoryOverview }>(
      `/api/v1/boards/${boardId}/filesystem-memory`,
      { method: "GET", signal },
    ),
  );
};

export const fetchFilesystemMemoryFile = async (
  boardId: string,
  path: string,
): Promise<FilesystemMemoryContent> => {
  const encoded = new URLSearchParams({ path }).toString();
  return withFilesystemMemoryTimeout((signal) =>
    customFetch<{ data: FilesystemMemoryContent }>(
      `/api/v1/boards/${boardId}/filesystem-memory/file?${encoded}`,
      { method: "GET", signal },
    ),
  );
};

export const selectInitialFilesystemMemoryPath = (
  overview: FilesystemMemoryOverview | null,
): string | null => {
  return overview?.latest_daily_path?.trim() || null;
};

export const matchesFilesystemMemorySearch = (
  file: FilesystemMemoryFile,
  searchTerm: string,
  content?: string | null,
): boolean => {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return true;
  return [file.path, file.label, file.date ?? "", content ?? ""].some((value) =>
    value.toLowerCase().includes(normalized),
  );
};
