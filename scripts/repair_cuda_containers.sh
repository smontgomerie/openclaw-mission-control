#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f compose.yml -f compose.gpu.yml --env-file .env)
SERVICES=(backend webhook-worker)
CHECK_CONTAINER="${CHECK_CONTAINER:-openclaw-mission-control-backend-1}"

cd "${PROJECT_DIR}"

if ! nvidia-smi >/dev/null 2>&1; then
  echo "Host NVIDIA driver/NVML is not healthy; not recreating containers." >&2
  exit 2
fi

if docker --context default exec "${CHECK_CONTAINER}" sh -lc \
  'nvidia-smi >/dev/null && python3 -c "import torch; raise SystemExit(0 if torch.cuda.is_available() and torch.cuda.device_count() > 0 else 1)"' \
  >/dev/null 2>&1; then
  echo "CUDA is healthy in ${CHECK_CONTAINER}."
  exit 0
fi

echo "CUDA is unhealthy in ${CHECK_CONTAINER}; recreating GPU services..."
OPENCLAW_TORCH_BACKEND="${OPENCLAW_TORCH_BACKEND:-cu128}" \
  "${COMPOSE[@]}" up -d --force-recreate "${SERVICES[@]}"

docker --context default exec "${CHECK_CONTAINER}" sh -lc \
  'nvidia-smi && python3 -c "import torch; print(torch.__version__); print(torch.cuda.is_available(), torch.cuda.device_count()); raise SystemExit(0 if torch.cuda.is_available() and torch.cuda.device_count() > 0 else 1)"'
