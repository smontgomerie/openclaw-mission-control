#!/usr/bin/env python3
"""Extract reviewable speaker embeddings with the workspace identity encoder."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


def load_identity_helper(path: Path) -> ModuleType:
    spec = importlib.util.spec_from_file_location("openclaw_speaker_identity", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load speaker helper: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--helper", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--transcript", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--registry-dir", required=True)
    parser.add_argument("--encoder", default="ecapa")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    helper = load_identity_helper(Path(args.helper).expanduser().resolve())
    audio_path = Path(args.audio).expanduser().resolve()
    transcript_path = Path(args.transcript).expanduser().resolve()
    output_path = Path(args.output).expanduser().resolve()
    transcript = helper.load_json(transcript_path)
    segments = transcript.get("segments")
    if not isinstance(segments, list):
        raise ValueError("Transcript does not contain diarized segments")

    grouped: dict[str, list[dict[str, Any]]] = {}
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        label = str(segment.get("speaker") or "").strip()
        if label:
            grouped.setdefault(label, []).append(segment)

    registry = helper.SpeakerRegistry(Path(args.registry_dir).expanduser().resolve())
    encoder = helper.SpeakerEncoder(registry, encoder=args.encoder)
    observations: list[dict[str, object]] = []
    for label, speaker_segments in grouped.items():
        duration = helper.total_segment_duration(speaker_segments)
        try:
            embedding = encoder.encode_segments(audio_path, speaker_segments)
        except Exception as exc:
            print(f"[skip] {label}: {exc}", file=sys.stderr)
            continue
        observations.append(
            {
                "speaker_label": label,
                "embedding": [round(float(value), 8) for value in embedding.tolist()],
                "speech_duration_seconds": round(float(duration), 3),
                "segment_count": len(speaker_segments),
            }
        )

    payload = {
        "version": 1,
        "entry_id": transcript_path.parent.name,
        "audio_path": str(audio_path),
        "encoder": args.encoder,
        "observations": observations,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = output_path.with_suffix(output_path.suffix + ".tmp")
    temporary.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output_path)
    print(f"Wrote {len(observations)} speaker observation(s) to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
