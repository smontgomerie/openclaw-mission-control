#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

torch_backend="${OPENCLAW_TORCH_BACKEND:-cpu}"
base_repository="${OPENCLAW_BACKEND_BASE_REPOSITORY:-openclaw-whisperx-base}"
base_image="${OPENCLAW_BACKEND_BASE_IMAGE:-${base_repository}:${torch_backend}}"
source_repo="${OPENCLAW_SOURCE_REPO_PATH:-${REPO_ROOT}/../openclaw}"
dockerfile_path="${source_repo}/scripts/docker/Dockerfile.whisperx-base"

echo "Ensuring shared backend base image is available: ${base_image}"

if docker image inspect "${base_image}" >/dev/null 2>&1; then
  echo "Using existing local image: ${base_image}"
  exit 0
fi

if [[ "${base_image}" != "${base_repository}:${torch_backend}" ]]; then
  echo "Local image missing; pulling explicit base image: ${base_image}"
  docker pull "${base_image}"
  exit 0
fi

if [[ -f "${dockerfile_path}" ]]; then
  echo "Building shared base from sibling OpenClaw checkout: ${dockerfile_path}"
  docker build \
    -f "${dockerfile_path}" \
    -t "${base_image}" \
    --build-arg "WHISPERX_TORCH_BACKEND=${torch_backend}" \
    "${source_repo}"
  exit 0
fi

cat >&2 <<EOF
Unable to resolve shared backend base image ${base_image}.

Provide one of:
  - a sibling OpenClaw checkout at ${source_repo}
  - OPENCLAW_BACKEND_BASE_IMAGE pointing to a pullable published image
  - an already-built local image tagged as ${base_image}
EOF
exit 1
