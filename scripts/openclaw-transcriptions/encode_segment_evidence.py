#!/usr/bin/env python3
"""Encode speaker-segment evidence via a pinned helper in a subprocess."""

from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path


def load_helper(path: Path):
    spec = importlib.util.spec_from_file_location("openclaw_speaker_identity_runtime", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load speaker helper: {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--helper", required=True)
    parser.add_argument("--registry-dir", required=True)
    parser.add_argument("--audio", required=True)
    parser.add_argument("--encoder", default="ecapa")
    parser.add_argument("--audio-root", required=True)
    return parser.parse_args()


def confine(path: Path, root: Path) -> Path:
    resolved = path.expanduser().resolve()
    resolved.relative_to(root.expanduser().resolve())
    if not resolved.is_file():
        raise FileNotFoundError(str(resolved))
    return resolved


def main() -> int:
    args = parse_args()
    audio_root = Path(args.audio_root)
    helper_path = confine(Path(args.helper), Path(args.helper).resolve().parent)
    audio_path = confine(Path(args.audio), audio_root)
    payload = json.loads(sys.stdin.read())
    evidence = payload.get("evidence")
    if not isinstance(evidence, list):
        raise ValueError("evidence must be a list")
    helper = load_helper(helper_path)
    registry = helper.SpeakerRegistry(Path(args.registry_dir).expanduser().resolve())
    encoder = helper.SpeakerEncoder(registry, encoder=args.encoder)
    segments = [
        {"start": item.get("start"), "end": item.get("end"), "text": item.get("text", "")}
        for item in evidence
        if isinstance(item, dict)
    ]
    embedding = encoder.encode_segments(audio_path, segments)
    json.dump([float(value) for value in embedding.tolist()], sys.stdout)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
