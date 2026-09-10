import type { MissionControlConfig } from "./config.js";
import { getApiKeyJwt, resetApiKeyJwtCache } from "./apiKeyJwt.js";

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
  const keyMode = Boolean(config.apiKey && config.betterAuthUrl);

  const run = async (
    input: RequestInfo | URL,
    init: RequestInit | undefined,
    forceExchange: boolean,
  ): Promise<Response> => {
    let credential: string;
    if (keyMode) {
      credential = (await getApiKeyJwt(config, { force: forceExchange })) ?? "";
      if (!credential) {
        throw new MissionControlApiError(
          0,
          "API key exchange failed: the Better Auth origin refused the key or is unreachable.",
          null,
        );
      }
    } else {
      // Token mode behaves exactly as before: the configured bearer token.
      credential = config.token ?? "";
    }

    const headers = new Headers(init?.headers);
    headers.set("Authorization", `Bearer ${credential}`);
    if (
      init?.body !== undefined &&
      init.body !== null &&
      !headers.has("Content-Type")
    ) {
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

  return async (input, init) => {
    const first = await run(input, init, false);
    if (first.status === 401 && keyMode) {
      // Stale exchanged JWT or a freshly revoked key: force one re-exchange
      // and retry the call once.
      resetApiKeyJwtCache();
      return await run(input, init, true);
    }
    return first;
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
    let message =
      typeof detail === "string" && detail
        ? detail
        : "Mission Control request failed.";
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
