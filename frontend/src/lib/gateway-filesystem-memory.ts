import { customFetch } from "@/api/mutator";

const FILESYSTEM_MEMORY_TIMEOUT_MS = 15_000;

export type GatewayFilesystemMemoryKind = "long_term" | "daily";

export type GatewayFilesystemMemoryFile = {
  path: string;
  kind: GatewayFilesystemMemoryKind;
  label: string;
  date?: string | null;
};

export type GatewayFilesystemMemoryContent = GatewayFilesystemMemoryFile & {
  content: string;
};

export type GatewayFilesystemMemoryOverview = {
  gateway_id: string;
  gateway_name: string;
  main_agent_id: string;
  main_agent_name: string;
  long_term_memory?: GatewayFilesystemMemoryContent | null;
  daily_files: GatewayFilesystemMemoryFile[];
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

export const fetchGatewayFilesystemMemoryOverview = async (
  gatewayId: string,
): Promise<GatewayFilesystemMemoryOverview> => {
  return withFilesystemMemoryTimeout((signal) =>
    customFetch<{ data: GatewayFilesystemMemoryOverview }>(
      `/api/v1/gateways/${gatewayId}/filesystem-memory`,
      { method: "GET", signal },
    ),
  );
};

export const fetchGatewayFilesystemMemoryFile = async (
  gatewayId: string,
  path: string,
): Promise<GatewayFilesystemMemoryContent> => {
  const encoded = new URLSearchParams({ path }).toString();
  return withFilesystemMemoryTimeout((signal) =>
    customFetch<{ data: GatewayFilesystemMemoryContent }>(
      `/api/v1/gateways/${gatewayId}/filesystem-memory/file?${encoded}`,
      { method: "GET", signal },
    ),
  );
};

export const selectInitialGatewayFilesystemMemoryPath = (
  overview: GatewayFilesystemMemoryOverview | null,
): string | null => {
  return overview?.latest_daily_path?.trim() || null;
};

export const matchesGatewayFilesystemMemorySearch = (
  file: GatewayFilesystemMemoryFile,
  searchTerm: string,
  content?: string | null,
): boolean => {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) return true;
  return [file.path, file.label, file.date ?? "", content ?? ""].some((value) =>
    value.toLowerCase().includes(normalized),
  );
};
