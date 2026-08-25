# Flow-capture harness (openclaw-mission-control)

This repo's UI proof stack is **Cypress** under `frontend/` (already used for
product e2e).
Flow-capture builds on that stack: asserting shot specs that screenshot a
**real product screen** and fail the process with a non-zero exit when an
assertion fails.
Screenshots without assertions are not proof.

## Convention

| Piece | Location |
| --- | --- |
| Shot specs | `frontend/cypress/e2e/shots/<scene>-shots.cy.ts` |
| Runner | `npm run flow-capture --prefix frontend -- <scene>` |
| Artifacts | `frontend/tmp/shots/` (screenshots + videos) |
| Product roots | `frontend/src` |
| Excluded from surface∩diff | `frontend/cypress`, `frontend/tmp`, `frontend/src/api/generated` |

Name every new scene `<scene>-shots.cy.ts` and run it with the same stem:

```bash
npm run flow-capture --prefix frontend -- boards
```

The runner boots a local-auth Next frontend on `:3010` when needed, runs only
that shot spec, writes PNGs/videos under `frontend/tmp/shots`, and exits
non-zero on any failed Cypress assertion.

Override the base URL (for example the Docker stack on `:3100`) with
`CYPRESS_BASE_URL` or `FLOW_CAPTURE_BASE_URL` only when that frontend is
**local-auth** Mission Control. The runner probes for page copy matching
`/local authentication/i` before reusing; otherwise it boots its own Next
instance on `:3010`. Without an explicit base URL override, ambient listeners
are ignored so a random process on `:3010` cannot silently satisfy the run.

## Fail-closed

Every shot spec must assert observable UI (visible copy, rows, CTAs) **before
or while** capturing screenshots.
A broken Boards list must fail the run — do not register or extend a
capture-only script.

To prove fail-closed locally without editing the spec:

```bash
FLOW_CAPTURE_ASSERT_FAIL=1 npm run flow-capture --prefix frontend -- boards
# expect exit ≠ 0
```

## Adding a scene

1. Pick a screen an operator uses (`/boards`, `/agents`, `/activity`, …) — not a
   synthetic HTML fixture.
2. Add `frontend/cypress/e2e/shots/<scene>-shots.cy.ts` with assertions +
   `cy.screenshot(...)`.
3. Run `npm run flow-capture --prefix frontend -- <scene>` and confirm artifacts
   under `frontend/tmp/shots`.
4. Keep `testing.flowCaptureHarness` on the repo policy pointed at this runner
   (`productSourceRoots` / `excludeRoots` already cover `frontend/src`).

## Policy declaration

Claimability reads `testing.flowCaptureHarness` on the server repo profile (and
`.workq/repo.json` when present).
The declared command is:

```text
npm run flow-capture --prefix frontend -- <scene>
```
