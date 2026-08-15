#!/usr/bin/env bash
# Discoverability copy of the workspace script. Canonical path:
#   ~/.openclaw-docker/workspace/transcriptions/reprocess_metadata_all.sh
# Override with OPENCLAW_TRANSCRIPTIONS_DIR if your workspace differs.
set -euo pipefail
TRANSCRIPTIONS="${OPENCLAW_TRANSCRIPTIONS_DIR:-$HOME/.openclaw-docker/workspace/transcriptions}"
if [[ ! -f "$TRANSCRIPTIONS/calendar_match.py" ]]; then
  echo "[NO_WORK] calendar_match.py not found under $TRANSCRIPTIONS" >&2
  exit 0
fi
cd "$TRANSCRIPTIONS"
PY=python3
if [[ -x .venv-whisperx/bin/python ]]; then PY=.venv-whisperx/bin/python; fi
"$PY" calendar_match.py --backfill-processed ./processed
if [[ -f title_generator.py ]]; then "$PY" title_generator.py --backfill-processed ./processed; fi
if [[ -f tools/reannotate_all.sh ]]; then bash ./tools/reannotate_all.sh; fi
if [[ -f apply_speaker_annotations.py ]]; then
  while IFS= read -r -d "" transcript; do
    entry="$(dirname "$transcript")"
    if [[ -f "$entry/speaker-annotations.json" ]]; then
      "$PY" apply_speaker_annotations.py --transcript "$transcript" \
        --annotations "$entry/speaker-annotations.json" --text-output "$entry/transcript.txt"
    fi
  done < <(find ./processed -mindepth 2 -maxdepth 2 -name transcript.json -print0)
fi
