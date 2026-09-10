import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getBetterAuthTokenMock = vi.hoisted(() => vi.fn());
const isBetterAuthModeMock = vi.hoisted(() => vi.fn(() => false));
const getLocalAuthTokenMock = vi.hoisted(() => vi.fn());
const isLocalAuthModeMock = vi.hoisted(() => vi.fn(() => false));

vi.mock("@/auth/betterAuth", () => ({
  getBetterAuthToken: getBetterAuthTokenMock,
  isBetterAuthMode: isBetterAuthModeMock,
}));
vi.mock("@/auth/localAuth", () => ({
  getLocalAuthToken: getLocalAuthTokenMock,
  isLocalAuthMode: isLocalAuthModeMock,
}));

import { fetchWithAuth, resolveBearerToken } from "@/auth/tokenSource";

function response(status: number): Response {
  return new Response(null, { status });
}

function clerkWindowWith(token: string | null) {
  vi.stubGlobal("window", {
    location: { pathname: "/", search: "" },
    sessionStorage: globalThis.sessionStorage,
    Clerk: token ? { session: { getToken: async () => token } } : undefined,
  });
}

describe("resolveBearerToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBetterAuthTokenMock.mockReset();
    getLocalAuthTokenMock.mockReset();
    isBetterAuthModeMock.mockReset();
    isLocalAuthModeMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the Better Auth JWT in betterauth mode", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValueOnce("jwt");
    await expect(resolveBearerToken()).resolves.toBe("jwt");
    expect(getLocalAuthTokenMock).not.toHaveBeenCalled();
  });

  it("returns the pasted token in local mode", async () => {
    isLocalAuthModeMock.mockReturnValue(true);
    getLocalAuthTokenMock.mockReturnValueOnce("local-token");
    await expect(resolveBearerToken()).resolves.toBe("local-token");
    expect(getBetterAuthTokenMock).not.toHaveBeenCalled();
  });

  it("returns null in betterauth mode when there is no session", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValueOnce(null);
    await expect(resolveBearerToken()).resolves.toBeNull();
  });

  it("returns the Clerk session token in clerk mode", async () => {
    clerkWindowWith("clerk-jwt");
    await expect(resolveBearerToken()).resolves.toBe("clerk-jwt");
  });

  it("returns null in clerk mode when Clerk is not on the page", async () => {
    clerkWindowWith(null);
    await expect(resolveBearerToken()).resolves.toBeNull();
  });

  it("returns null in clerk mode when getToken throws", async () => {
    vi.stubGlobal("window", {
      Clerk: {
        session: {
          getToken: () => {
            throw new Error("no session");
          },
        },
      },
    });
    await expect(resolveBearerToken()).resolves.toBeNull();
  });

  it("returns null in clerk mode on a server (no window)", async () => {
    vi.stubGlobal("window", undefined);
    await expect(resolveBearerToken()).resolves.toBeNull();
  });
});

describe("fetchWithAuth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBetterAuthTokenMock.mockReset();
    getLocalAuthTokenMock.mockReset();
    isBetterAuthModeMock.mockReset();
    isLocalAuthModeMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("attaches the mode's bearer token to the request", async () => {
    isLocalAuthModeMock.mockReturnValue(true);
    getLocalAuthTokenMock.mockReturnValueOnce("local-token");
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(200),
    );

    await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer local-token");
  });

  it("does not override an explicit Authorization header", async () => {
    isLocalAuthModeMock.mockReturnValue(true);
    getLocalAuthTokenMock.mockReturnValueOnce("local-token");
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(200),
    );

    await fetchWithAuth(
      "/api/x",
      { method: "GET", headers: { Authorization: "Bearer explicit" } },
      fetchImpl,
    );

    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer explicit");
  });

  it("sends no Authorization header when no token is available", async () => {
    isLocalAuthModeMock.mockReturnValue(true);
    getLocalAuthTokenMock.mockReturnValueOnce(null);
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(200),
    );

    await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    const headers = new Headers(fetchImpl.mock.calls[0][1]?.headers);
    expect(headers.has("Authorization")).toBe(false);
  });

  it("refreshes an expired Better Auth JWT on 401 and retries once", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock
      .mockResolvedValueOnce("stale-jwt") // attached token
      .mockResolvedValueOnce("fresh-jwt"); // forced refresh
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, init?: RequestInit) => {
        const attached = new Headers(init?.headers).get("Authorization");
        return attached === "Bearer fresh-jwt" ? response(200) : response(401);
      },
    );

    const result = await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    expect(result.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(getBetterAuthTokenMock).toHaveBeenCalledWith({ force: true });
  });

  it("does not retry when the refresh yields the same token", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValue("same-jwt");
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(401),
    );

    const result = await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    expect(result.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not retry when the refresh has no session", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock
      .mockResolvedValueOnce("stale-jwt")
      .mockResolvedValueOnce(null);
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(401),
    );

    const result = await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    expect(result.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not 401-retry in non-betterauth modes", async () => {
    isLocalAuthModeMock.mockReturnValue(true);
    getLocalAuthTokenMock.mockReturnValueOnce("local-token");
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(401),
    );

    const result = await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    expect(result.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getBetterAuthTokenMock).not.toHaveBeenCalled();
  });

  it("returns a 401 as-is when no token was attached", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValueOnce(null);
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(401),
    );

    const result = await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    expect(result.status).toBe(401);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("uses the global fetch when no fetch implementation is passed", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValueOnce("stale-jwt");
    const globalFetchMock = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(200),
    );
    vi.stubGlobal("fetch", globalFetchMock);

    await fetchWithAuth("/api/x", { method: "GET" });

    expect(globalFetchMock).toHaveBeenCalledTimes(1);
    const headers = new Headers(globalFetchMock.mock.calls[0][1]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer stale-jwt");
  });

  it("does not refresh on non-401 responses in betterauth mode", async () => {
    isBetterAuthModeMock.mockReturnValue(true);
    getBetterAuthTokenMock.mockResolvedValueOnce("stale-jwt");
    const fetchImpl = vi.fn(
      async (_url: string | Request | URL, _init?: RequestInit) =>
        response(500),
    );

    await fetchWithAuth("/api/x", { method: "GET" }, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(getBetterAuthTokenMock).not.toHaveBeenCalledWith({ force: true });
  });
});
