# ruff: noqa: S101
"""Annotation-preserving speaker backfill coverage."""

from __future__ import annotations

import json
from pathlib import Path

from app.services.speaker_backfill import preview_annotation_backfill


def _write_transcript(path: Path, segments: list[dict[str, object]]) -> bytes:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"segments": segments}, indent=2), encoding="utf-8")
    return path.read_bytes()


def test_preview_discovers_names_without_changing_transcripts(tmp_path: Path) -> None:
    annotated = tmp_path / "processed" / "meeting-1" / "transcript.json"
    original = _write_transcript(
        annotated,
        [
            {
                "speaker": "SPEAKER_00",
                "speaker_chunk_local": "C000_SPEAKER_00",
                "speaker_name": "Scott",
                "start": 1.0,
                "end": 6.0,
                "text": "Hello",
            },
            {
                "speaker": "SPEAKER_01",
                "speaker_name": "Mike",
                "speaker_name_tentative": True,
                "start": 7.0,
                "end": 12.0,
                "text": "Hi",
            },
        ],
    )
    _write_transcript(
        tmp_path / "processed" / "meeting-2" / "transcript.json",
        [{"speaker": "SPEAKER_00", "start": 0, "end": 4, "text": "Unknown"}],
    )

    preview = preview_annotation_backfill(tmp_path)

    assert preview["recording_count"] == 2
    assert preview["annotated_recording_count"] == 1
    assert preview["unannotated_recording_count"] == 1
    assert preview["speaker_names"] == {"Mike": 1, "Scott": 1}
    assert preview["tentative_annotation_count"] == 1
    assert annotated.read_bytes() == original
    assert not list(tmp_path.rglob("speaker-annotations.json"))


def test_preview_snapshot_changes_when_annotation_changes(tmp_path: Path) -> None:
    transcript = tmp_path / "processed" / "meeting" / "transcript.json"
    _write_transcript(
        transcript,
        [{"speaker_name": "Scott", "start": 0, "end": 5, "text": "Hello"}],
    )
    first = preview_annotation_backfill(tmp_path)["snapshot_hash"]
    _write_transcript(
        transcript,
        [{"speaker_name": "Mike", "start": 0, "end": 5, "text": "Hello"}],
    )
    assert preview_annotation_backfill(tmp_path)["snapshot_hash"] != first
