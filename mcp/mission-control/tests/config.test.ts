import test from "node:test";
import assert from "node:assert/strict";

import { loadConfig } from "../src/config.js";

test("loadConfig reads required env vars", () => {
  const config = loadConfig({
    MISSION_CONTROL_BASE_URL: "http://localhost:8000/",
    MISSION_CONTROL_TOKEN: "token-value",
  });

  assert.equal(config.baseUrl, "http://localhost:8000");
  assert.equal(config.token, "token-value");
  assert.equal(config.timeoutMs, 10_000);
});

test("loadConfig rejects invalid timeout", () => {
  assert.throws(
    () =>
      loadConfig({
        MISSION_CONTROL_BASE_URL: "http://localhost:8000",
        MISSION_CONTROL_TOKEN: "token-value",
        MISSION_CONTROL_TIMEOUT_MS: "0",
      }),
    /MISSION_CONTROL_TIMEOUT_MS/,
  );
});
