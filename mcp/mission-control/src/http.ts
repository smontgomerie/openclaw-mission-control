import type { MissionControlConfig } from "./config.js";

export class MissionControlApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.name = "MissionControlApiError";
    this.status = status;
    this.detail = detail;
  }
}

type FetchLike = typeof fetch;

export function createAuthenticatedFetch(
  config: MissionControlConfig,
  fetchImpl: FetchLike = fetch,
): FetchLike {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${config.token}`);
    if (init?.body !== undefined && init.body !== null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      return await fetchImpl(input, {
        ...init,
        headers,
        signal: init?.signal ?? controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";
  const isJson =
    contentType.includes("application/json") || contentType.includes("+json");

  if (!response.ok) {
    let detail: unknown = null;
    if (isJson) {
      detail = await response.json().catch(() => null);
    } else {
      detail = await response.text().catch(() => "");
    }
    let message = typeof detail === "string" && detail ? detail : "Mission Control request failed.";
    if (detail && typeof detail === "object") {
      const payloadDetail = (detail as { detail?: unknown }).detail;
      if (typeof payloadDetail === "string" && payloadDetail) {
        message = payloadDetail;
      }
    }
    throw new MissionControlApiError(response.status, message, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  if (isJson) {
    return (await response.json()) as T;
  }

  return (await response.text()) as T;
}
