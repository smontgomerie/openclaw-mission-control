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
  API_KEY_STORAGE_KEY,
  betterAuthClientBaseUrl,
  exchangeSeededApiKeyForJwt,
  fetchBetterAuthSession,
  getBetterAuthClient,
  getBetterAuthToken,
  isBetterAuthMode,
  removeSeededApiKey,
  resetBetterAuthTokenCache,
  setSeededApiKey,
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
    window.sessionStorage.clear();
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
    window.sessionStorage.clear();
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

describe("seeded API key helpers", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("stores and removes the seeded key under the documented storage key", () => {
    setSeededApiKey("mc_test-key");
    expect(window.sessionStorage.getItem(API_KEY_STORAGE_KEY)).toBe(
      "mc_test-key",
    );
    removeSeededApiKey();
    expect(window.sessionStorage.getItem(API_KEY_STORAGE_KEY)).toBeNull();
  });

  it("is a no-op in a server environment (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => {
      setSeededApiKey("mc_test-key");
      removeSeededApiKey();
    }).not.toThrow();
  });
});

describe("exchangeSeededApiKeyForJwt", () => {
  const keyJwt = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
  let fetchStub: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    window.sessionStorage.clear();
    fetchStub = vi.fn();
    vi.stubGlobal("fetch", fetchStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns null without a request when no key is seeded", async () => {
    await expect(exchangeSeededApiKeyForJwt()).resolves.toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("returns null without a request in a server environment (no window)", async () => {
    vi.stubGlobal("window", undefined);
    await expect(exchangeSeededApiKeyForJwt()).resolves.toBeNull();
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("exchanges the seeded key at GET /api/auth/token with x-api-key", async () => {
    setSeededApiKey("mc_123");
    fetchStub.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ token: keyJwt }),
    });
    await expect(exchangeSeededApiKeyForJwt()).resolves.toBe(keyJwt);
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchStub.mock.calls[0]?.[0]).toBe(
      `${window.location.origin}/api/auth/token`,
    );
    expect(fetchStub.mock.calls[0]?.[1]?.headers).toEqual({
      "x-api-key": "mc_123",
    });
  });

  it("returns null when the exchange is refused (401)", async () => {
    setSeededApiKey("mc_revoked");
    fetchStub.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    });
    await expect(exchangeSeededApiKeyForJwt()).resolves.toBeNull();
  });

  it("returns null when the response body has no token", async () => {
    setSeededApiKey("mc_123");
    fetchStub.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(exchangeSeededApiKeyForJwt()).resolves.toBeNull();
  });

  it("returns null when the request throws", async () => {
    setSeededApiKey("mc_123");
    fetchStub.mockRejectedValueOnce(new TypeError("network down"));
    await expect(exchangeSeededApiKeyForJwt()).resolves.toBeNull();
  });

  it("uses an explicitly provided fetch implementation", async () => {
    setSeededApiKey("mc_123");
    const explicit = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: keyJwt }),
    }));
    await expect(
      exchangeSeededApiKeyForJwt(explicit as unknown as typeof fetch),
    ).resolves.toBe(keyJwt);
    expect(explicit).toHaveBeenCalledTimes(1);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("getBetterAuthToken — machine-client key fallback", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    signOutMock.mockReset();
    window.sessionStorage.clear();
    resetBetterAuthTokenCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back to the seeded key when /token reports a session error", async () => {
    const keyJwt = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
    fetchMock.mockResolvedValue({
      error: { status: 401, statusText: "Unauthorized" },
      data: null,
    });
    window.sessionStorage.setItem(API_KEY_STORAGE_KEY, "mc_123");
    const exchange = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: keyJwt }),
    }));
    vi.stubGlobal("fetch", exchange);

    await expect(getBetterAuthToken()).resolves.toBe(keyJwt);
    expect(exchange).toHaveBeenCalledTimes(1);

    // The key JWT is cached like a session JWT: the next call is a cache hit.
    await expect(getBetterAuthToken()).resolves.toBe(keyJwt);
    expect(exchange).toHaveBeenCalledTimes(1);
  });

  it("re-runs the exchange on a forced refresh", async () => {
    const keyJwt = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60);
    fetchMock.mockResolvedValue({ error: { status: 401 }, data: null });
    window.sessionStorage.setItem(API_KEY_STORAGE_KEY, "mc_123");
    const exchange = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: keyJwt }),
    }));
    vi.stubGlobal("fetch", exchange);

    await getBetterAuthToken();
    await expect(getBetterAuthToken({ force: true })).resolves.toBe(keyJwt);
    expect(exchange).toHaveBeenCalledTimes(2);
  });

  it("returns null when signed out and the key exchange is refused", async () => {
    fetchMock.mockResolvedValue({ error: { status: 401 }, data: null });
    window.sessionStorage.setItem(API_KEY_STORAGE_KEY, "mc_revoked");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );

    await expect(getBetterAuthToken()).resolves.toBeNull();
  });

  it("returns null when signed out and no key is seeded (no key request)", async () => {
    fetchMock.mockResolvedValue({ error: null, data: null });
    const exchange = vi.fn();
    vi.stubGlobal("fetch", exchange);

    await expect(getBetterAuthToken()).resolves.toBeNull();
    expect(exchange).not.toHaveBeenCalled();
  });
});

describe("fetchBetterAuthSession — machine-client key fallback", () => {
  const keyOwnerSession = {
    user: {
      id: "u-key",
      email: "ada@example.com",
      name: "Ada Lovelace",
      image: "https://img.example/ada.png",
    },
    session: { id: "s-key" },
  };

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_AUTH_MODE", "betterauth");
    getSessionMock.mockReset();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("returns the key owner's session when signed out but a key is seeded", async () => {
    getSessionMock.mockResolvedValueOnce({ error: null, data: null });
    window.sessionStorage.setItem(API_KEY_STORAGE_KEY, "mc_123");
    const get = vi.fn(async (_url: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => keyOwnerSession,
    }));
    vi.stubGlobal("fetch", get);

    await expect(fetchBetterAuthSession()).resolves.toEqual(keyOwnerSession);
    expect(get).toHaveBeenCalledTimes(1);
    expect(get.mock.calls[0]?.[0]).toBe(
      `${window.location.origin}/api/auth/get-session`,
    );
    expect(get.mock.calls[0]?.[1]?.headers).toEqual({ "x-api-key": "mc_123" });
  });

  it("prefers the cookie session when a session and a key both exist", async () => {
    getSessionMock.mockResolvedValueOnce({
      error: null,
      data: keyOwnerSession,
    });
    window.sessionStorage.setItem(API_KEY_STORAGE_KEY, "mc_123");
    const get = vi.fn();
    vi.stubGlobal("fetch", get);

    await expect(fetchBetterAuthSession()).resolves.toEqual(keyOwnerSession);
    expect(get).not.toHaveBeenCalled();
  });

  it("returns null when the key session lookup is refused (401)", async () => {
    getSessionMock.mockResolvedValueOnce({
      error: { status: 401 },
      data: null,
    });
    window.sessionStorage.setItem(API_KEY_STORAGE_KEY, "mc_revoked");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })),
    );

    await expect(fetchBetterAuthSession()).resolves.toBeNull();
  });

  it("returns null when the key session lookup throws", async () => {
    getSessionMock.mockResolvedValueOnce({ error: null, data: null });
    window.sessionStorage.setItem(API_KEY_STORAGE_KEY, "mc_123");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("network down");
      }),
    );

    await expect(fetchBetterAuthSession()).resolves.toBeNull();
  });

  it("returns null when signed out and no key is seeded (no key request)", async () => {
    getSessionMock.mockResolvedValueOnce({ error: null, data: null });
    const get = vi.fn();
    vi.stubGlobal("fetch", get);

    await expect(fetchBetterAuthSession()).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });
});
