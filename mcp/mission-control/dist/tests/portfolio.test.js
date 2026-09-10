import test from "node:test";
import assert from "node:assert/strict";
import { resetApiKeyJwtCache } from "../src/apiKeyJwt.js";
import { MissionControlApiError } from "../src/http.js";
import {
  portfolioListPositions,
  portfolioListReviews,
  portfolioSaveRationale,
} from "../src/tools/portfolio.js";
/** Unverified structural JWT with a real `exp` claim, good enough for the cache. */
function makeJwt(expSeconds) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  return `${b64({ alg: "none", typ: "JWT" })}.${b64({ sub: "u1", exp: expSeconds })}.sig`;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
const KEY_CONFIG = {
  baseUrl: "http://mission-control.test",
  apiKey: "mc_test-key",
  betterAuthUrl: "http://auth.test",
  timeoutMs: 10_000,
};
const futureExp = () => Math.floor(Date.now() / 1000) + 15 * 60;
const config = {
  baseUrl: "http://mission-control.test",
  token: "secret-token",
  timeoutMs: 10_000,
};
function installFetchStub(handler) {
  const originalFetch = global.fetch;
  global.fetch = handler;
  return () => {
    global.fetch = originalFetch;
  };
}
test("portfolioListPositions applies client-side filters", async () => {
  const restore = installFetchStub(async (_input, init) => {
    assert.equal(init?.method, "GET");
    return new Response(
      JSON.stringify([
        {
          position_key: "aapl-1",
          ticker: "AAPL",
          latest_flags: [],
          needs_rationale: true,
        },
        {
          position_key: "msft-1",
          ticker: "MSFT",
          latest_flags: [{ code: "flag", headline: "Flag" }],
          needs_rationale: false,
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  try {
    const positions = await portfolioListPositions(config, {
      ticker: "MSFT",
      flagged_only: true,
    });
    assert.equal(positions.length, 1);
    assert.equal(positions[0]?.position_key, "msft-1");
  } finally {
    restore();
  }
});
test("portfolioListReviews filters by position key and limit", async () => {
  const restore = installFetchStub(async () => {
    return new Response(
      JSON.stringify([
        { id: "2026-03-25", position_keys: ["aapl-1"], summary_markdown: "A" },
        {
          id: "2026-03-24",
          position_keys: ["aapl-1", "msft-1"],
          summary_markdown: "B",
        },
        { id: "2026-03-23", position_keys: ["msft-1"], summary_markdown: "C" },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  try {
    const reviews = await portfolioListReviews(config, {
      position_key: "aapl-1",
      limit: 1,
    });
    assert.equal(reviews.length, 1);
    assert.equal(reviews[0]?.id, "2026-03-25");
  } finally {
    restore();
  }
});
test("portfolioSaveRationale sends the expected payload", async () => {
  const restore = installFetchStub(async (input, init) => {
    assert.equal(
      String(input),
      "http://mission-control.test/api/v1/portfolio/positions/aapl-1/rationale",
    );
    assert.equal(init?.method, "PUT");
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      "Bearer secret-token",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      strategy: "wheel",
      why: "Support",
      tags: ["income"],
    });
    return new Response(
      JSON.stringify({
        position_key: "aapl-1",
        ticker: "AAPL",
        latest_flags: [],
        rationale_history: [],
        rationale: { why: "Support", tags: ["income"] },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });
  try {
    const detail = await portfolioSaveRationale(config, {
      position_key: "aapl-1",
      strategy: "wheel",
      why: "Support",
      tags: ["income"],
    });
    assert.equal(detail.rationale?.why, "Support");
  } finally {
    restore();
  }
});
test("key mode exchanges the API key for a JWT and attaches it as bearer", async () => {
  resetApiKeyJwtCache();
  const jwt = makeJwt(futureExp());
  const seen = [];
  const restore = installFetchStub(async (input, init) => {
    const url = String(input);
    seen.push(url);
    if (url.startsWith("http://auth.test")) {
      assert.equal(new Headers(init?.headers).get("x-api-key"), "mc_test-key");
      return json({ token: jwt });
    }
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      `Bearer ${jwt}`,
    );
    return json([
      {
        position_key: "aapl-1",
        ticker: "AAPL",
        latest_flags: [],
        needs_rationale: false,
      },
    ]);
  });
  try {
    const positions = await portfolioListPositions(KEY_CONFIG, {});
    assert.equal(positions.length, 1);
    // Exactly one exchange (cached for the JWT lifetime) plus the API call.
    assert.deepEqual(seen, [
      "http://auth.test/api/auth/token",
      "http://mission-control.test/api/v1/portfolio/positions",
    ]);
  } finally {
    resetApiKeyJwtCache();
    restore();
  }
});
test("key mode: a 401 forces one re-exchange and retries the call once", async () => {
  resetApiKeyJwtCache();
  const stale = makeJwt(futureExp());
  const fresh = makeJwt(futureExp());
  let exchanges = 0;
  let apiCalls = 0;
  const restore = installFetchStub(async (input, init) => {
    const url = String(input);
    if (url.startsWith("http://auth.test")) {
      exchanges += 1;
      return json({ token: exchanges === 1 ? stale : fresh });
    }
    apiCalls += 1;
    if (apiCalls === 1) {
      assert.equal(
        new Headers(init?.headers).get("Authorization"),
        `Bearer ${stale}`,
      );
      return json({ detail: "token expired" }, 401);
    }
    assert.equal(
      new Headers(init?.headers).get("Authorization"),
      `Bearer ${fresh}`,
    );
    return json([]);
  });
  try {
    const positions = await portfolioListPositions(KEY_CONFIG, {});
    assert.deepEqual(positions, []);
    assert.equal(exchanges, 2);
    assert.equal(apiCalls, 2);
  } finally {
    resetApiKeyJwtCache();
    restore();
  }
});
test("key mode: a refused exchange surfaces as an error and never reaches the backend", async () => {
  resetApiKeyJwtCache();
  let backendCalls = 0;
  const restore = installFetchStub(async (input) => {
    if (String(input).startsWith("http://auth.test")) {
      return json({ error: "Invalid API key" }, 401);
    }
    backendCalls += 1;
    return json([]);
  });
  try {
    await assert.rejects(
      portfolioListPositions(KEY_CONFIG, {}),
      (err) => err instanceof MissionControlApiError && err.status === 0,
    );
    assert.equal(backendCalls, 0);
  } finally {
    resetApiKeyJwtCache();
    restore();
  }
});
