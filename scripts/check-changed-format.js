#!/usr/bin/env node
/**
 * Repo-root changed-files prettier gate.
 *
 * Prettier lives under `frontend/node_modules`. The playbook default looks for
 * `./node_modules/.bin/prettier` at the monorepo root, which this repo does not
 * have (and must not invent as a worktree node_modules shadow).
 */
const { spawnSync } = require("child_process");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const prettierBin = path.join(
  repoRoot,
  "frontend",
  "node_modules",
  ".bin",
  "prettier",
);

function parseBase(argv) {
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") return String(argv[i + 1] || "").trim() || null;
    if (argv[i].startsWith("--base=")) {
      return argv[i].slice("--base=".length).trim() || null;
    }
  }
  return null;
}

const base = parseBase(process.argv.slice(2)) || "origin/master";
const gitDiff = spawnSync(
  "git",
  ["diff", "--name-only", "--diff-filter=ACMR", `${base}...HEAD`],
  { cwd: repoRoot, encoding: "utf8" },
);

if (gitDiff.status !== 0) {
  console.error(gitDiff.stderr || "git diff failed");
  process.exit(1);
}

const paths = (gitDiff.stdout || "")
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean)
  // Prettier has no parser for .gitignore.
  .filter((p) => path.basename(p) !== ".gitignore");

if (paths.length === 0) {
  console.log(
    "assert-changed-format: ok — no prettier-applicable changed files",
  );
  process.exit(0);
}

// Prettier refuses files it cannot infer a parser for (e.g. .env.example,
// .npmrc, .sql). The gate only manages files Prettier *can* format, so skip
// those exactly like .gitignore above — prettier never touches them.
const unformatted = [];
const skipped = [];
for (const p of paths) {
  const r = spawnSync(prettierBin, ["--check", p], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (r.status === 0) continue;
  const output = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  if (output.includes("No parser could be inferred")) {
    skipped.push(p);
    continue;
  }
  if (r.status === 1) {
    unformatted.push(p);
    continue;
  }
  console.error(`prettier errored on ${p}:`);
  console.error(output.trim());
  process.exit(1);
}

if (skipped.length > 0) {
  console.log(
    `assert-changed-format: skipped (no prettier parser): ${skipped.join(", ")}`,
  );
}

if (unformatted.length === 0) {
  console.log(
    `assert-changed-format: ok — prettier --check clean on ${paths.length} changed file(s)`,
  );
  process.exit(0);
}

console.error(
  "assert-changed-format: REFUSE — changed-files prettier --check refused",
);
for (const p of unformatted) {
  const r = spawnSync(prettierBin, ["--check", p], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (r.stdout) console.error(r.stdout);
}
process.exit(1);
