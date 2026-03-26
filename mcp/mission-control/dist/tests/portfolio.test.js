import test from "node:test";
import assert from "node:assert/strict";
import { portfolioListPositions, portfolioListReviews, portfolioSaveRationale } from "../src/tools/portfolio.js";
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
        return new Response(JSON.stringify([
            { position_key: "aapl-1", ticker: "AAPL", latest_flags: [], needs_rationale: true },
            { position_key: "msft-1", ticker: "MSFT", latest_flags: [{ code: "flag", headline: "Flag" }], needs_rationale: false }
        ]), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
        const positions = await portfolioListPositions(config, {
            ticker: "MSFT",
            flagged_only: true,
        });
        assert.equal(positions.length, 1);
        assert.equal(positions[0]?.position_key, "msft-1");
    }
    finally {
        restore();
    }
});
test("portfolioListReviews filters by position key and limit", async () => {
    const restore = installFetchStub(async () => {
        return new Response(JSON.stringify([
            { id: "2026-03-25", position_keys: ["aapl-1"], summary_markdown: "A" },
            { id: "2026-03-24", position_keys: ["aapl-1", "msft-1"], summary_markdown: "B" },
            { id: "2026-03-23", position_keys: ["msft-1"], summary_markdown: "C" }
        ]), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
        const reviews = await portfolioListReviews(config, {
            position_key: "aapl-1",
            limit: 1,
        });
        assert.equal(reviews.length, 1);
        assert.equal(reviews[0]?.id, "2026-03-25");
    }
    finally {
        restore();
    }
});
test("portfolioSaveRationale sends the expected payload", async () => {
    const restore = installFetchStub(async (input, init) => {
        assert.equal(String(input), "http://mission-control.test/api/v1/portfolio/positions/aapl-1/rationale");
        assert.equal(init?.method, "PUT");
        assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer secret-token");
        assert.deepEqual(JSON.parse(String(init?.body)), {
            strategy: "wheel",
            why: "Support",
            tags: ["income"],
        });
        return new Response(JSON.stringify({
            position_key: "aapl-1",
            ticker: "AAPL",
            latest_flags: [],
            rationale_history: [],
            rationale: { why: "Support", tags: ["income"] },
        }), { status: 200, headers: { "content-type": "application/json" } });
    });
    try {
        const detail = await portfolioSaveRationale(config, {
            position_key: "aapl-1",
            strategy: "wheel",
            why: "Support",
            tags: ["income"],
        });
        assert.equal(detail.rationale?.why, "Support");
    }
    finally {
        restore();
    }
});
