# syntax=docker/dockerfile:1.7

FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_LINK_MODE=copy

WORKDIR /app

# System deps (keep minimal)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
  --mount=type=cache,target=/var/lib/apt/lists,sharing=locked \
  apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates git ffmpeg libsndfile1

# Install uv (https://github.com/astral-sh/uv)
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

# --- deps layer ---
FROM base AS deps

# Copy only dependency metadata first for better build caching
# NOTE: compose builds backend with repo-root context, so files live under /backend.
COPY backend/pyproject.toml backend/uv.lock ./

# Create venv and sync deps (including runtime)
RUN --mount=type=cache,target=/root/.cache/uv,sharing=locked \
  uv sync --frozen --no-dev \
  && uv pip install --python /app/.venv/bin/python --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    "torch==2.8.*" "torchaudio==2.8.*" "torchcodec==0.7.*" \
  && uv pip install --python /app/.venv/bin/python --no-cache-dir \
    "huggingface-hub<1.0.0" "requests==2.32.5" "soundfile==0.13.1" "speechbrain==1.0.3" \
  && uv pip install --python /app/.venv/bin/python --no-cache-dir \
    --index-url https://download.pytorch.org/whl/cpu \
    "torchcodec==0.7.*"

# --- runtime ---
FROM base AS runtime

# Create non-root user before COPY so --chown can reference it.
# Using COPY --chown avoids a slow recursive chown on overlay2 (docker/for-linux#388).
RUN groupadd --system appgroup && useradd --system --gid appgroup --create-home appuser \
  && chown appuser:appgroup /app

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

# Persist the gateway device identity at a stable appuser-owned path so Docker
# volumes can be mounted there without changing runtime code defaults.
RUN mkdir -p /home/appuser/.openclaw/identity \
  && chown -R appuser:appgroup /home/appuser/.openclaw

USER appuser

# Default API port
EXPOSE 8000

# Run the API
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
