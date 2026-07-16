#!/usr/bin/env python3
"""Extract reviewable speaker embeddings with the workspace identity encoder."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any


def segment_offset_seconds(segment: dict[str, Any], key: str) -> float | None:
    """Read a valid diarization offset without making malformed turns fatal."""
    value = segment.get(key)
    try:
        offset = float(value)
    except (TypeError, ValueError):
        return None
    return offset if offset >= 0 else None


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
    parser.add_argument("--trust-speaker-names", action="store_true")
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

    grouped: dict[tuple[str, str | None], list[dict[str, Any]]] = {}
    for segment in segments:
        if not isinstance(segment, dict):
            continue
        label = str(segment.get("speaker") or "").strip()
        confirmed_name = (
            str(segment.get("speaker_name") or "").strip()
            if args.trust_speaker_names
            else ""
        )
        key = (
            (f"name:{confirmed_name.casefold()}", confirmed_name)
            if confirmed_name
            else (label, None)
        )
        if key[0]:
            grouped.setdefault(key, []).append(segment)

    registry = helper.SpeakerRegistry(Path(args.registry_dir).expanduser().resolve())
    encoder = helper.SpeakerEncoder(registry, encoder=args.encoder)
    observations: list[dict[str, object]] = []
    for (label, confirmed_name), speaker_segments in grouped.items():
        duration = helper.total_segment_duration(speaker_segments)
        starts = [
            offset
            for segment in speaker_segments
            if (offset := segment_offset_seconds(segment, "start")) is not None
        ]
        ends = [
            offset
            for segment in speaker_segments
            if (offset := segment_offset_seconds(segment, "end")) is not None
        ]
        try:
            embedding = encoder.encode_segments(audio_path, speaker_segments)
        except Exception as exc:
            print(f"[skip] {label}: {exc}", file=sys.stderr)
            continue
        evidence = []
        for segment in speaker_segments:
            start = segment_offset_seconds(segment, "start")
            end = segment_offset_seconds(segment, "end")
            text = str(segment.get("text") or "").strip()
            material = f"{start}\0{end}\0{text}".encode()
            evidence.append(
                {
                    "id": hashlib.sha256(material).hexdigest(),
                    "start": start,
                    "end": end,
                    "text": text,
                }
            )
        observations.append(
            {
                "speaker_label": label,
                "embedding": [round(float(value), 8) for value in embedding.tolist()],
                "speech_duration_seconds": round(float(duration), 3),
                "segment_count": len(speaker_segments),
                "clip_start_seconds": round(min(starts), 3) if starts else None,
                "clip_end_seconds": round(max(ends), 3) if ends else None,
                "segment_evidence": evidence,
                "confirmed_name": confirmed_name,
            }
        )

    payload = {
        "version": 2,
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
