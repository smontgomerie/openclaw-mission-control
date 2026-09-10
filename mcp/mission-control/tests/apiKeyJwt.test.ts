import test from "node:test";
import assert from "node:assert/strict";

import type { MissionControlConfig } from "../src/config.js";
import { getApiKeyJwt, resetApiKeyJwtCache } from "../src/apiKeyJwt.js";

/** Unverified structural JWT with a real `exp` claim, good enough for the cache. */
function makeJwt(expSeconds: number, sub: string): string {
  const b64 = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub, exp: expSeconds })}.sig`;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const KEY_CONFIG: MissionControlConfig = {
  baseUrl: "http://mission-control.test",
  apiKey: "mc_test-key",
  betterAuthUrl: "http://auth.test",
  timeoutMs: 10_000,
};

function keyConfig(apiKey: string): MissionControlConfig {
  return { ...KEY_CONFIG, apiKey };
}

function installFetchStub(
  handler: (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => Response | Promise<Response>,
) {
  const originalFetch = global.fetch;
  global.fetch = handler as typeof fetch;
  return () => {
    global.fetch = originalFetch;
  };
}

test("two configs with different API keys exchange independently in one process", async () => {
  resetApiKeyJwtCache();
  const jwtA = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60, "user-a");
  const jwtB = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60, "user-b");
  const exchanges: string[] = [];
  const restore = installFetchStub(async (_input, init) => {
    const key = new Headers(init?.headers).get("x-api-key");
    exchanges.push(key ?? "");
    return json({ token: key === "mc_key-a" ? jwtA : jwtB });
  });

  try {
    const [tokenA, tokenB] = await Promise.all([
      getApiKeyJwt(keyConfig("mc_key-a")),
      getApiKeyJwt(keyConfig("mc_key-b")),
    ]);
    assert.equal(tokenA, jwtA);
    assert.equal(tokenB, jwtB);
    // Each key exchanged exactly once — no cross-key overwriting.
    assert.deepEqual(exchanges, ["mc_key-a", "mc_key-b"]);
    // Cached independently: second round re-exchanges nothing.
    assert.equal(await getApiKeyJwt(keyConfig("mc_key-a")), jwtA);
    assert.equal(await getApiKeyJwt(keyConfig("mc_key-b")), jwtB);
    assert.deepEqual(exchanges, ["mc_key-a", "mc_key-b"]);
  } finally {
    resetApiKeyJwtCache();
    restore();
  }
});

test("racing callers with the same key share one exchange", async () => {
  resetApiKeyJwtCache();
  const jwt = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60, "user-a");
  let exchangeStarts = 0;
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = () => resolve();
  });
  const restore = installFetchStub(async () => {
    exchangeStarts += 1;
    await gate;
    return json({ token: jwt });
  });

  try {
    const first = getApiKeyJwt(KEY_CONFIG);
    const second = getApiKeyJwt(KEY_CONFIG);
    // Both callers started while the first exchange is in flight.
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(exchangeStarts, 1);
    release!();
    const [token1, token2] = await Promise.all([first, second]);
    assert.equal(token1, jwt);
    assert.equal(token2, jwt);
    assert.equal(exchangeStarts, 1);
  } finally {
    resetApiKeyJwtCache();
    restore();
  }
});

test("a reset racing an in-flight exchange cannot overwrite a newer exchange", async () => {
  resetApiKeyJwtCache();
  const staleJwt = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60, "user-a");
  const freshJwt = makeJwt(Math.floor(Date.now() / 1000) + 15 * 60, "user-a");
  let exchangeStarts = 0;
  let releaseStale: (() => void) | undefined;
  let releaseFresh: (() => void) | undefined;
  const gateStale = new Promise<void>((resolve) => {
    releaseStale = () => resolve();
  });
  const gateFresh = new Promise<void>((resolve) => {
    releaseFresh = () => resolve();
  });
  const restore = installFetchStub(async () => {
    exchangeStarts += 1;
    if (exchangeStarts === 1) {
      await gateStale;
      return json({ token: staleJwt });
    }
    await gateFresh;
    return json({ token: freshJwt });
  });

  try {
    // Exchange #1 in flight when the cache is reset (e.g. a 401 path).
    const staleCall = getApiKeyJwt(KEY_CONFIG);
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(exchangeStarts, 1);
    resetApiKeyJwtCache();
    // Exchange #2 runs after the reset and mints the fresh JWT.
    const freshCall = getApiKeyJwt(KEY_CONFIG, { force: true });
    assert.equal(exchangeStarts, 2);
    releaseFresh!();
    releaseStale!();
    const [staleToken, freshToken] = await Promise.all([staleCall, freshCall]);
    assert.equal(staleToken, staleJwt);
    assert.equal(freshToken, freshJwt);
    // The pre-reset exchange must not have clobbered the newer cache entry.
    assert.equal(await getApiKeyJwt(KEY_CONFIG), freshJwt);
    assert.equal(exchangeStarts, 2);
  } finally {
    resetApiKeyJwtCache();
    restore();
  }
});
