# OpenClaw transcriptions pipeline (workspace mirror)

Canonical scripts live under the shared OpenClaw workspace:

`~/.openclaw-docker/workspace/transcriptions/` (container: `/home/node/.openclaw/workspace/transcriptions/`)

| File | Role |
|------|------|
| `calendar_match.py` | Calls `gog --account … calendar events list`, writes `processed/<id>/calendar-match.json`. |
| `title_generator.py` | Writes `processed/<id>/title.txt` from calendar (medium+) or OpenRouter (`OPENROUTER_API_KEY`). |
| `speaker_identity.py` | Registry + `annotate` / `bulk-enroll` (+ optional `--calendar-match`, `--encoder`). |
| `process_wav_files.sh` | WhisperX pipeline; invokes calendar + title + diarized annotate. |
| `tools/reannotate_all.sh` | Re-run annotate from raw `<id>.json` + optional calendar. |
| `reprocess_metadata_all.sh` | One-shot: calendar + title backfill + `reannotate_all` for all `processed/*`. |
| `tools/build_registry.py` | Emit `speaker-review.yaml` per recording. |
| `tools/retranscribe_queue.py` | Heuristic queue file for Whisper large-v3 re-runs. |
| `calendars.yaml` | Accounts for `gog --account` when matching. |

## Backfill (host or container)

```bash
cd /path/to/workspace/transcriptions
python3 calendar_match.py --backfill-processed processed
python3 title_generator.py --backfill-processed processed   # needs OPENROUTER_API_KEY for LLM titles
bash tools/reannotate_all.sh
```

Or run the workspace helper (same steps, prefers `.venv-whisperx` if present):

`reprocess_metadata_all.sh`

## Mission Control (dashboard)

Admins can enqueue the same work via the API (requires a gateway with the transcription cron configured):

- `POST /api/v1/transcriptions/sync` — run the normal transcription sync once.
- `POST /api/v1/transcriptions/reprocess-metadata` — enqueue `reprocess_metadata_all.sh` (calendar + titles + `reannotate_all` for all `processed/*`).

## `gog` preflight (v0.13+)

See workspace `TOOLS.md` (Google Access + multi-account). Verify:

```bash
gog auth list
gog --account montgomerie.scott@gmail.com calendar events list primary \
  --from <RFC3339> --to <RFC3339> --json
```

If `gog` is missing on the host, run these inside the OpenClaw agent container where `gog` is installed.
