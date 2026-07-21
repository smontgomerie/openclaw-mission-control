# Repository Guidelines

## Project Structure and Module Organization

- `backend/`: FastAPI service with routes in `backend/app/api/`, models in `backend/app/models/`, schemas in `backend/app/schemas/`, and service logic in `backend/app/services/`.
- `backend/migrations/`: Alembic migrations, with generated revisions in `backend/migrations/versions/`.
- `backend/tests/`: pytest suite using `test_*.py` naming.
- `backend/templates/`: backend-shipped templates used by gateway flows.
- `frontend/`: Next.js app with routes under `frontend/src/app/`, shared components in `frontend/src/components/`, and utilities in `frontend/src/lib/`.
- `frontend/src/api/generated/`: generated API client that must be regenerated instead of edited by hand.
- `frontend/cypress/`: Cypress end-to-end tests and shared support code.
- `docs/`: contributor and operations documentation, starting at `docs/README.md`.

## Build, Test, and Development Commands

- `make setup`: install and synchronize backend and frontend dependencies.
- `make check`: closest CI-parity run for linting, type checking, tests and coverage, and the frontend build.
- `./scripts/ensure_openclaw_backend_base.sh`: ensure the shared OpenClaw WhisperX/PyTorch base image exists before Docker builds.
- `docker compose -f compose.yml --env-file .env up -d --build`: build and run the full stack.
- `make api-gen`: regenerate the frontend API client after starting the backend on `127.0.0.1:8000`.

For GPU backend runtime, use `env OPENCLAW_TORCH_BACKEND=cu128 docker compose -f compose.yml -f compose.gpu.yml --env-file .env up -d --build backend webhook-worker` on a host with NVIDIA Container Toolkit.

When restarting, recreating, or rebuilding GPU-capable Mission Control or adjacent OpenClaw containers on a CUDA host, never use plain `docker compose up` alone.

Keep `OPENCLAW_TORCH_BACKEND=cu128` set for builds that touch the backend image, and include `-f compose.gpu.yml` for Mission Control GPU services.

For GPU container recreation without a rebuild, prefer `docker compose -f compose.yml -f compose.gpu.yml --env-file .env up -d --force-recreate backend webhook-worker`.

After a GPU-targeted recreate or rebuild, verify that CUDA is available in the live container and that `/dev/nvidia0` can be opened before treating the service as GPU-enabled.

Keep the backend image runtime identity aligned with the live containers, currently `OPENCLAW_APP_UID=1000` and `OPENCLAW_APP_GID=1000`.

Docker Compose writes build metadata under `/tmp`.

If a build fails with `no space left on device`, clear unused Docker build cache before retrying.

For a fast local loop, start the database with Docker, then run `uv run uvicorn app.main:app --reload --port 8000` from `backend/` and `npm run dev` from `frontend/`.

## End-to-End Testing

Read `docs/testing/README.md` before running or changing end-to-end tests.

The Cypress suite lives in `frontend/cypress/` and runs with `cd frontend && npm run e2e`.

The deployed Docker stack is available at `http://100.89.189.52:3100/`.

After rebuilding or recreating Docker services, run the relevant Cypress checks against that deployed URL before considering frontend or user-facing work complete:

```bash
cd frontend
CYPRESS_baseUrl=http://100.89.189.52:3100 npm run e2e
```

For a bug fix, begin by reproducing the reported behavior through an E2E path that closely matches the end-user experience.

When testing the product E2E, inspect the interface closely and treat visible visual defects as work worth fixing, even when they are adjacent to the original change.

## Engineering Standards

- Never use the em dash character. Use a plain hyphen instead.
- Never add an agent name as a commit-message co-author.
- Never manually modify `CHANGELOG.md` files or files marked as auto-generated.
- When writing or substantially editing a long Markdown file, put each complete sentence on its own physical line while preserving normal Markdown structure.
- Prefer quality, simplicity, robustness, scalability, and long-term maintainability over minimizing development cost.
- Resolve lint failures, test failures, and test flakiness you encounter, even when they are outside the immediate change.
- Add or update tests whenever behavior changes.

## Coding Style and Naming

- Python uses Black, isort, flake8, and strict mypy with a 100-character maximum line length and `snake_case` names.
- TypeScript and React use ESLint and Prettier, with `PascalCase` components and `camelCase` variables and functions.
- Prefix intentionally unused destructured TypeScript variables with `_`.

## Commit, Pull Request, and Security Guidance

- Use Conventional Commits such as `feat: ...`, `fix: ...`, `docs: ...`, or `test(core): ...`.
- Keep pull requests focused and based on the latest `master`.
- Include the change summary, rationale, test evidence, linked issue, and screenshots or logs when the user or operator workflow changes.
- Never commit secrets. Copy `.env.example` to `.env` and keep real values only in the local `.env`.
- Report vulnerabilities privately through GitHub security advisories, not public issues.

## Kun's Opinions

When a task would benefit from Kun's viewpoints, read `~/OPINIONS.md` if it is available before making the relevant decisions.

## Voice Profile

When talking or posting on Kun's behalf, read `~/VOICE.md` if it is available and follow that voice.
