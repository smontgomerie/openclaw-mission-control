#!/usr/bin/env python3
"""Reapply durable manual speaker annotations to a derived transcript."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def offset(value: object) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def fingerprint(segment: dict[str, Any]) -> str:
    start = offset(segment.get("start"))
    end = offset(segment.get("end"))
    text = str(segment.get("text") or "").strip()
    return hashlib.sha256(f"{start}\0{end}\0{text}".encode()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--transcript", required=True)
    parser.add_argument("--annotations", required=True)
    parser.add_argument("--text-output")
    args = parser.parse_args()
    transcript_path = Path(args.transcript)
    annotation_path = Path(args.annotations)
    if not annotation_path.is_file():
        return 0
    transcript = json.loads(transcript_path.read_text(encoding="utf-8"))
    annotations = json.loads(annotation_path.read_text(encoding="utf-8"))
    assignments = {
        str(item.get("segment_id")): str(item.get("speaker_name") or "").strip()
        for item in annotations.get("assignments", [])
        if isinstance(item, dict)
        and item.get("segment_id")
        and item.get("speaker_name")
    }
    changed = False
    for segment in transcript.get("segments", []):
        if not isinstance(segment, dict):
            continue
        name = assignments.get(fingerprint(segment))
        if name:
            segment["speaker_name"] = name
            segment.pop("speaker_name_tentative", None)
            changed = True
    if not changed:
        return 0
    temporary = transcript_path.with_suffix(transcript_path.suffix + ".tmp")
    temporary.write_text(
        json.dumps(transcript, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    temporary.replace(transcript_path)
    if args.text_output:
        lines = []
        for segment in transcript.get("segments", []):
            if not isinstance(segment, dict):
                continue
            text = str(segment.get("text") or "").strip()
            if text:
                label = str(
                    segment.get("speaker_name")
                    or segment.get("speaker")
                    or "Unknown speaker"
                )
                lines.append(f"[{label}] {text}")
        Path(args.text_output).write_text("\n".join(lines), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
