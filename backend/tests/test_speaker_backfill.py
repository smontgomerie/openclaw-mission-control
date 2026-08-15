# ruff: noqa: S101
"""Annotation-preserving speaker backfill coverage."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app import models as _models
from app.models.organizations import Organization
from app.models.speaker_profiles import SpeakerBackfillRun
from app.services.queue import QueuedTask
from app.services.speaker_backfill import (
    preview_annotation_backfill,
    process_backfill_task,
)

MODEL_REGISTRY = _models


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


@pytest.mark.asyncio
async def test_backfill_apply_writes_overlay_and_leaves_failures_retryable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    processed = tmp_path / "processed"
    meeting = processed / "meeting-1"
    broken = processed / "meeting-2"
    _write_transcript(
        meeting / "transcript.json",
        [
            {
                "speaker": "SPEAKER_00",
                "speaker_name": "Scott",
                "start": 0,
                "end": 5,
                "text": "Hello",
            }
        ],
    )
    (broken / "transcript.json").parent.mkdir(parents=True, exist_ok=True)
    (broken / "transcript.json").write_text("not-json", encoding="utf-8")

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'backfill.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_factory() as session:
        organization = Organization(name="Backfill Org")
        session.add(organization)
        await session.commit()
        await session.refresh(organization)
        preview = preview_annotation_backfill(tmp_path)
        run = SpeakerBackfillRun(
            organization_id=organization.id,
            snapshot_hash=str(preview["snapshot_hash"]),
            total_recordings=int(preview["transcript_count"]),
        )
        session.add(run)
        await session.commit()
        await session.refresh(run)
        run_id = run.id
        org_id = organization.id

    class _FakeTranscriptions:
        def _transcriptions_root(self) -> Path:
            return tmp_path

        def _source_audio_path(self, entry_id: str, *, transcriptions_root: Path) -> Path:
            if entry_id == "meeting-2":
                raise RuntimeError("missing audio")
            return transcriptions_root / f"{entry_id}.m4a"

        def _speaker_python_bin(self, *, transcriptions_root: Path) -> str:
            return "python3"

    monkeypatch.setattr(
        "app.services.speaker_backfill.SharedTranscriptionsService",
        lambda: _FakeTranscriptions(),
    )
    monkeypatch.setattr("app.services.speaker_backfill.async_session_maker", session_factory)
    monkeypatch.setattr(
        "app.services.speaker_backfill.subprocess.run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("encoder skipped")),
    )

    await process_backfill_task(
        QueuedTask(
            task_type="speaker_annotation_backfill",
            payload={"run_id": str(run_id), "organization_id": str(org_id)},
            created_at=datetime.now(UTC),
        )
    )

    overlay = meeting / "speaker-annotations.json"
    assert overlay.is_file()
    payload = json.loads(overlay.read_text(encoding="utf-8"))
    assert payload["assignments"][0]["speaker_name"] == "Scott"
    preview = json.loads((meeting / "speaker-preview.json").read_text(encoding="utf-8"))
    assert preview["names"] == ["Scott"]

    async with session_factory() as session:
        stored = await SpeakerBackfillRun.objects.by_id(run_id).first(session)
        assert stored is not None
        assert stored.status == "failed"
        assert "meeting-1" in stored.processed_entry_ids
        assert "meeting-2" not in stored.processed_entry_ids
        assert stored.skipped_recordings >= 1

    await engine.dispose()
