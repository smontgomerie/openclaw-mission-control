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
test("loadConfig accepts a Better Auth API key with its origin", () => {
  const config = loadConfig({
    MISSION_CONTROL_BASE_URL: "http://localhost:8000/",
    MISSION_CONTROL_API_KEY: "mc_key123",
    MISSION_CONTROL_BETTER_AUTH_URL: "http://localhost:3000/",
  });
  assert.equal(config.apiKey, "mc_key123");
  assert.equal(config.betterAuthUrl, "http://localhost:3000");
  assert.equal(config.token, undefined);
});
test("loadConfig keeps the token when both a key and a token are set", () => {
  const config = loadConfig({
    MISSION_CONTROL_BASE_URL: "http://localhost:8000",
    MISSION_CONTROL_TOKEN: "shared-token",
    MISSION_CONTROL_API_KEY: "mc_key123",
    MISSION_CONTROL_BETTER_AUTH_URL: "http://localhost:3000",
  });
  // Key mode takes precedence; the token is just carried along.
  assert.equal(config.apiKey, "mc_key123");
  assert.equal(config.token, "shared-token");
});
test("loadConfig rejects an API key without its origin", () => {
  assert.throws(
    () =>
      loadConfig({
        MISSION_CONTROL_BASE_URL: "http://localhost:8000",
        MISSION_CONTROL_API_KEY: "mc_key123",
      }),
    /MISSION_CONTROL_BETTER_AUTH_URL/,
  );
});
test("loadConfig rejects when no credential is configured", () => {
  assert.throws(
    () => loadConfig({ MISSION_CONTROL_BASE_URL: "http://localhost:8000" }),
    /MISSION_CONTROL_TOKEN/,
  );
});
