# syntax=docker/dockerfile:1.7

ARG OPENCLAW_BACKEND_BASE_IMAGE=openclaw-whisperx-base:cpu
ARG APP_UID=1000
ARG APP_GID=1000

FROM ${OPENCLAW_BACKEND_BASE_IMAGE} AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# Keep only lightweight app/runtime packages here; the shared base owns the
# heavyweight torch + WhisperX stack.
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
  apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git libsndfile1 python3-venv

# Install uv (https://github.com/astral-sh/uv)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# --- deps layer ---
FROM base AS deps

# Copy only dependency metadata first for better build caching.
# NOTE: compose builds backend with repo-root context, so files live under /backend.
COPY backend/pyproject.toml backend/uv.lock ./

# Create a project venv that can import packages baked into the shared base.
RUN python3 -m venv --system-site-packages /app/.venv

# Install only mission-control specific Python deps here; torch/WhisperX stay in
# the shared base image so Docker can reuse those heavy layers across repos.
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
  uv sync --frozen --no-dev --python /app/.venv/bin/python

# --- runtime ---
FROM base AS runtime

ARG APP_UID
ARG APP_GID

# Create non-root user before COPY so --chown can reference it.
# Using COPY --chown avoids a slow recursive chown on overlay2 (docker/for-linux#388).
RUN set -eux; \
  if getent group appgroup >/dev/null; then \
    :; \
  elif getent group "${APP_GID}" >/dev/null; then \
    groupmod -n appgroup "$(getent group "${APP_GID}" | cut -d: -f1)"; \
  else \
    groupadd --system --gid "${APP_GID}" appgroup; \
  fi; \
  if id -u appuser >/dev/null 2>&1; then \
    :; \
  elif id -u "${APP_UID}" >/dev/null 2>&1; then \
    usermod -l appuser -d /home/appuser -m "$(getent passwd "${APP_UID}" | cut -d: -f1)"; \
  else \
    useradd --system --uid "${APP_UID}" --gid appgroup --create-home appuser; \
  fi; \
  usermod -g appgroup appuser; \
  mkdir -p /home/appuser; \
  chown -R appuser:appgroup /app /home/appuser

# Copy virtual environment from deps stage
COPY --from=deps --chown=appuser:appgroup /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:${PATH}"

# Copy app source
COPY --chown=appuser:appgroup backend/migrations ./migrations
COPY --chown=appuser:appgroup backend/alembic.ini ./alembic.ini
COPY --chown=appuser:appgroup backend/app ./app

# Copy provisioning templates.
# In-repo these live at `backend/templates/`; runtime path is `/app/templates`.
COPY --chown=appuser:appgroup backend/templates ./templates

# Copy worker scripts.
# In-repo these live at `scripts/`; runtime path is `/app/scripts`.
COPY --chown=appuser:appgroup scripts ./scripts

# Persist runtime-owned directories at stable appuser-owned paths so Docker
# volumes and local caches can be mounted there without changing runtime code defaults.
RUN mkdir -p /home/appuser/.openclaw/identity \
  && mkdir -p /home/appuser/.cache/openclaw/transcriptions \
  && chown -R appuser:appgroup /home/appuser/.openclaw /home/appuser/.cache

USER appuser

# Default API port
EXPOSE 8000

# Run the API
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
