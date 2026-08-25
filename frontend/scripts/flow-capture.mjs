#!/usr/bin/env node
/**
 * Flow-capture runner for openclaw-mission-control.
 *
 * Usage:
 *   node frontend/scripts/flow-capture.mjs <scene>
 *   npm run flow-capture --prefix frontend -- boards
 *
 * Boots a local-auth Next frontend when needed, runs
 * cypress/e2e/shots/<scene>-shots.cy.ts, writes artifacts under
 * frontend/tmp/shots, and exits non-zero when assertions fail.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, "..");
const repoRoot = resolve(frontendRoot, "..");
const artifactDir = join(frontendRoot, "tmp", "shots");
const defaultPort = process.env.FLOW_CAPTURE_PORT || "3010";
const defaultBaseUrl = `http://127.0.0.1:${defaultPort}`;
const baseUrl =
  process.env.FLOW_CAPTURE_BASE_URL ||
  process.env.CYPRESS_BASE_URL ||
  defaultBaseUrl;

function usage() {
  console.error("Usage: npm run flow-capture --prefix frontend -- <scene>");
  console.error("  scene stem maps to cypress/e2e/shots/<scene>-shots.cy.ts");
  process.exit(2);
}

function parseScene(argv) {
  const args = argv.slice(2).filter((a) => a !== "--");
  if (args.length !== 1 || !/^[a-z0-9][a-z0-9-]*$/i.test(args[0])) {
    usage();
  }
  return args[0];
}

function cypressEnv() {
  const env = { ...process.env, CYPRESS_BASE_URL: baseUrl };
  // Avoid Electron-as-Node collisions in some agent hosts.
  delete env.ELECTRON_RUN_AS_NODE;
  return env;
}

function run(command, args, opts = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      env: opts.env || cypressEnv(),
      cwd: opts.cwd || frontendRoot,
      shell: typeof opts.shell === "boolean" ? opts.shell : false,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${command} killed by ${signal}`));
        return;
      }
      resolvePromise(code ?? 1);
    });
  });
}

async function isFrontendUp(url) {
  try {
    const res = await fetch(url, { redirect: "manual" });
    return res.status > 0;
  } catch {
    return false;
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForFrontend(url, timeoutMs = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isFrontendUp(url)) return;
    await wait(500);
  }
  throw new Error(`Frontend did not become ready at ${url} within ${timeoutMs}ms`);
}

function cypressCliArgs(spec, assertFail) {
  return [
    "cypress",
    "run",
    "--config-file",
    "cypress.flow-capture.config.ts",
    "--spec",
    spec,
    "--config",
    [
      `baseUrl=${baseUrl}`,
      "screenshotsFolder=tmp/shots",
      "videosFolder=tmp/shots/videos",
      "video=true",
    ].join(","),
    "--env",
    `FLOW_CAPTURE_ASSERT_FAIL=${assertFail}`,
  ];
}

function startNextDev() {
  const port = new URL(baseUrl).port || defaultPort;
  const env = {
    ...process.env,
    NEXT_PUBLIC_AUTH_MODE: "local",
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || "auto",
    PORT: port,
  };
  delete env.ELECTRON_RUN_AS_NODE;
  console.log(
    `flow-capture: starting Next (local auth) on ${baseUrl} (NEXT_PUBLIC_AUTH_MODE=local)`,
  );
  const child = spawn(
    "npx",
    ["next", "dev", "--hostname", "127.0.0.1", "--port", port],
    {
      stdio: "inherit",
      env,
      cwd: frontendRoot,
    },
  );
  return child;
}

async function main() {
  const scene = parseScene(process.argv);
  const spec = join("cypress", "e2e", "shots", `${scene}-shots.cy.ts`);
  const specAbs = join(frontendRoot, spec);
  if (!existsSync(specAbs)) {
    console.error(`Missing shot spec: ${spec}`);
    console.error("Add frontend/cypress/e2e/shots/<scene>-shots.cy.ts first.");
    process.exit(2);
  }

  mkdirSync(artifactDir, { recursive: true });

  const assertFail =
    process.env.FLOW_CAPTURE_ASSERT_FAIL === "1" ||
    process.env.FLOW_CAPTURE_ASSERT_FAIL === "true";

  const cyArgs = cypressCliArgs(spec, assertFail);
  const alreadyUp = await isFrontendUp(baseUrl);
  let code;
  let nextProc;

  try {
    if (alreadyUp) {
      console.log(`flow-capture: using existing frontend at ${baseUrl}`);
    } else {
      nextProc = startNextDev();
      nextProc.on("exit", (exitCode, signal) => {
        if (exitCode && exitCode !== 0 && !nextProc._flowCaptureStopping) {
          console.error(
            `flow-capture: Next exited early (code=${exitCode}, signal=${signal})`,
          );
        }
      });
      await waitForFrontend(baseUrl);
    }

    code = await run("npx", cyArgs);
  } finally {
    if (nextProc && !nextProc.killed) {
      nextProc._flowCaptureStopping = true;
      nextProc.kill("SIGTERM");
      await wait(500);
      if (!nextProc.killed) nextProc.kill("SIGKILL");
    }
  }

  if (code !== 0) {
    console.error(`flow-capture: ${scene} failed (exit ${code})`);
    process.exit(code);
  }
  const rel = artifactDir.startsWith(repoRoot + "/")
    ? artifactDir.slice(repoRoot.length + 1)
    : artifactDir;
  console.log(`flow-capture: ${scene} ok — artifacts in ${rel}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
