import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Build a structurally-valid (signature-unverified) JWT with the given `exp`
 * (epoch seconds) so `jwtExpiresAtMs` has a real `exp` claim to read.
 */
function makeJwt(
  expSeconds: number | null,
  extra: Record<string, unknown> = {},
): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = btoa(
    JSON.stringify({
      iss: "http://localhost:3000",
      aud: "http://localhost:3000",
      ...(expSeconds === null ? {} : { exp: expSeconds }),
      ...extra,
    }),
  );
  return `${header.replace(/=+$/, "")}.${payload.replace(/=+$/, "")}.sig`;
}

const fetchMock = vi.hoisted(() => vi.fn());
const getSessionMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());
const socialSignInMock = vi.hoisted(() => vi.fn());
const createAuthClientMock = vi.hoisted(() =>
  vi.fn((_options?: { baseURL?: string }) => ({
    $fetch: fetchMock,
    getSession: getSessionMock,
    signOut: signOutMock,
    signIn: { social: socialSignInMock },
  })),
);

vi.mock("better-auth/client", () => ({
  createAuthClient: createAuthClientMock,
}));

import {
  betterAuthClientBaseUrl,
  fetchBetterAuthSession,
  getBetterAuthClient,
  getBetterAuthToken,
  isBetterAuthMode,
  resetBetterAuthTokenCache,
  signInWithGoogle,
  signOutBetterAuth,
} from "@/auth/betterAuth";

const HOUR_S = 3_600;

describe("isBetterAuthMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true only when NEXT_PUBLIC_AUTH_MODE=betterauth", () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    expect(isBetterAuthMode()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "local");
    expect(isBetterAuthMode()).toBe(false);
    vi.unstubAllEnvs();
    expect(isBetterAuthMode()).toBe(false);
  });
});

describe("getBetterAuthClient", () => {
  it("returns a stable singleton", () => {
    expect(getBetterAuthClient()).toBe(getBetterAuthClient());
    expect(getBetterAuthClient().$fetch).toBe(fetchMock);
  });

  it("creates the client with an absolute base URL", () => {
    // The better-auth client validates its base URL with `new URL(...)` and
    // rejects relative URLs (BetterAuthError before any request is made),
    // which silently stuck the app on the sign-in gate. Pin the contract:
    // the base URL is the app origin plus /api/auth, never a bare path.
    getBetterAuthClient();
    expect(createAuthClientMock).toHaveBeenCalledTimes(1);
    expect(createAuthClientMock).toHaveBeenCalledWith({
      baseURL: `${window.location.origin}/api/auth`,
    });
    expect(createAuthClientMock.mock.calls[0]?.[0]?.baseURL).toMatch(
      /^https?:\/\//,
    );
  });
});

describe("betterAuthClientBaseUrl", () => {
  it("resolves to the app origin plus /api/auth in the browser", () => {
    expect(betterAuthClientBaseUrl()).toBe(
      `${window.location.origin}/api/auth`,
    );
  });

  it("falls back to the SSR base URL when window is undefined", () => {
    // The client's `new URL` validation rejects a relative base URL, so the
    // server-side branch picks the localhost fallback instead of throwing.
    vi.stubGlobal("window", undefined);
    try {
      expect(betterAuthClientBaseUrl()).toBe("http://localhost/api/auth");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("getBetterAuthToken", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    resetBetterAuthTokenCache();
    fetchMock.mockReset();
    signOutMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns null in a server environment (no window)", async () => {
    vi.stubGlobal("window", undefined);
    await expect(getBetterAuthToken()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fetches the /token JWT and caches it until near expiry", async () => {
    const token = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
    fetchMock.mockResolvedValueOnce({ error: null, data: { token } });

    await expect(getBetterAuthToken()).resolves.toBe(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Cached: no second request while the token is fresh (beyond the margin).
    await expect(getBetterAuthToken()).resolves.toBe(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refreshes when the cached token is inside the refresh margin", async () => {
    const fresh = makeJwt(Math.floor(Date.now() / 1000) + HOUR_S);
    const soon = makeJwt(Math.floor(Date.now() / 1000) + 10); // < 30s margin
    fetchMock
      .mockResolvedValueOnce({ error: null, data: { token: fresh } })
      .mockResolvedValueOnce({ error: null, data: { token: soon } })
      .mockResolvedValueOnce({ error: null, data: { token: fresh } });

    await getBetterAuthToken(); // cache `fresh`
    await getBetterAuthToken({ force: true }); // cache `soon`
    await expect(getBetterAuthToken()).resolves.toBe(fresh); // auto-refresh
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns the cached token when the JWT carries no exp claim", async () => {
    const noExp = makeJwt(null, { foo: "bar" });
    fetchMock.mockResolvedValueOnce({ error: null, data: { token: noExp } });

    await expect(getBetterAuthToken()).resolves.toBe(noExp);
    await expect(getBetterAuthToken()).resolves.toBe(noExp);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats an undecodable token as no-exp (still cached)", async () => {
    fetchMock.mockResolvedValueOnce({
      error: null,
      data: { token: "not-a-jwt" },
    });
    await expect(getBetterAuthToken()).resolves.toBe("not-a-jwt");
    await expect(getBetterAuthToken()).resolves.toBe("not-a-jwt");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forces a refresh with { force: true } even when cached and fresh", async () => {
    const fresh = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
    const newer = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
    fetchMock
      .mockResolvedValueOnce({ error: null, data: { token: fresh } })
      .mockResolvedValueOnce({ error: null, data: { token: newer } });

    await getBetterAuthToken();
    await expect(getBetterAuthToken({ force: true })).resolves.toBe(newer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("is single-flight: racing callers share one refresh", async () => {
    const token = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
    fetchMock.mockResolvedValueOnce({ error: null, data: { token } });

    const [a, b] = await Promise.all([
      getBetterAuthToken(),
      getBetterAuthToken(),
    ]);
    expect(a).toBe(token);
    expect(b).toBe(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the /token endpoint reports an error (no session)", async () => {
    fetchMock.mockResolvedValueOnce({
      error: { status: 401, statusText: "Unauthorized" },
      data: null,
    });
    await expect(getBetterAuthToken()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null when the response body has no token", async () => {
    fetchMock.mockResolvedValueOnce({ error: null, data: {} });
    await expect(getBetterAuthToken()).resolves.toBeNull();
  });

  it("returns null when the fetch itself throws", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("network down"));
    await expect(getBetterAuthToken()).resolves.toBeNull();
  });
});

describe("resetBetterAuthTokenCache", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetBetterAuthTokenCache();
  });

  it("makes the next call fetch again even for a fresh cached token", async () => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    resetBetterAuthTokenCache();
    const token = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
    fetchMock
      .mockResolvedValueOnce({ error: null, data: { token } })
      .mockResolvedValueOnce({ error: null, data: { token } });

    await getBetterAuthToken();
    resetBetterAuthTokenCache();
    await getBetterAuthToken();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.unstubAllEnvs();
  });
});

describe("fetchBetterAuthSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    getSessionMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  const session = {
    user: {
      id: "u1",
      email: "ada@example.com",
      name: "Ada Lovelace",
      image: "https://img.example/ada.png",
    },
    session: { id: "s1" },
  };

  it("returns null in a server environment (no window)", async () => {
    vi.stubGlobal("window", undefined);
    await expect(fetchBetterAuthSession()).resolves.toBeNull();
  });

  it("returns the session envelope data when signed in", async () => {
    getSessionMock.mockResolvedValueOnce({ error: null, data: session });
    await expect(fetchBetterAuthSession()).resolves.toEqual(session);
  });

  it("returns null when there is no session (envelope error)", async () => {
    getSessionMock.mockResolvedValueOnce({
      error: { status: 401, statusText: "Unauthorized" },
      data: null,
    });
    await expect(fetchBetterAuthSession()).resolves.toBeNull();
  });

  it("returns null when the call throws", async () => {
    getSessionMock.mockRejectedValueOnce(new TypeError("network down"));
    await expect(fetchBetterAuthSession()).resolves.toBeNull();
  });
});

describe("signInWithGoogle", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    socialSignInMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("starts the google social flow with the given callback url", async () => {
    socialSignInMock.mockResolvedValueOnce({ error: null, data: null });
    await signInWithGoogle("/boards?next=1");
    expect(socialSignInMock).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: "/boards?next=1",
    });
  });

  it("passes an undefined callback url when none is given", async () => {
    socialSignInMock.mockResolvedValueOnce({ error: null, data: null });
    await signInWithGoogle();
    expect(socialSignInMock).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: undefined,
    });
  });
});

describe("signOutBetterAuth", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    signOutMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("ends the session and drops the cached token", async () => {
    signOutMock.mockResolvedValueOnce({ error: null, data: null });
    await signOutBetterAuth();
    expect(signOutMock).toHaveBeenCalledTimes(1);
  });

  it("still clears the cache when the sign-out request fails", async () => {
    signOutMock.mockRejectedValueOnce(new TypeError("network down"));
    await expect(signOutBetterAuth()).resolves.toBeUndefined();
  });

  it("only clears the cache in a server environment (no sign-out call)", async () => {
    vi.stubGlobal("window", undefined);
    await signOutBetterAuth();
    expect(signOutMock).not.toHaveBeenCalled();
  });
});
