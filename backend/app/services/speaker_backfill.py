"""Annotation-preserving speaker backfill preview and worker."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast
from uuid import UUID

from app.core.config import settings
from app.core.time import utcnow
from app.db.session import async_session_maker
from app.models.speaker_profiles import SpeakerBackfillRun
from app.services.queue import QueuedTask, enqueue_task
from app.services.queue import requeue_if_failed as generic_requeue_if_failed
from app.services.speaker_learning import (
    SpeakerLearningService,
    _pinned_speaker_helper,
    _speaker_tools_dir,
    normalize_speaker_name,
)
from app.services.transcriptions import SharedTranscriptionsService, _write_speaker_list_preview

TASK_TYPE = "speaker_annotation_backfill"


def _load_transcript(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return value if isinstance(value, dict) else None


def _offset(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _segments(transcript: dict[str, Any]) -> list[dict[str, Any]]:
    value = transcript.get("segments")
    return [item for item in value if isinstance(item, dict)] if isinstance(value, list) else []


def preview_annotation_backfill(root: Path) -> dict[str, object]:
    processed = root / "processed"
    digest = hashlib.sha256()
    entries = sorted((item for item in processed.iterdir() if item.is_dir()), key=lambda p: p.name)
    transcript_count = 0
    annotated_count = 0
    tentative_count = 0
    speaker_names: dict[str, int] = {}
    skipped: list[dict[str, str]] = []
    for entry in entries:
        transcript_path = entry / "transcript.json"
        if not transcript_path.is_file():
            skipped.append({"entry_id": entry.name, "reason": "transcript.json is missing"})
            continue
        raw = transcript_path.read_bytes()
        digest.update(entry.name.encode())
        digest.update(hashlib.sha256(raw).digest())
        transcript = _load_transcript(transcript_path)
        if transcript is None:
            skipped.append({"entry_id": entry.name, "reason": "transcript.json is invalid"})
            continue
        transcript_count += 1
        names: set[str] = set()
        for segment in _segments(transcript):
            name = str(segment.get("speaker_name") or "").strip()
            if not name:
                continue
            display_name, normalized = normalize_speaker_name(name)
            names.add(normalized)
            speaker_names.setdefault(display_name, 0)
            if segment.get("speaker_name_tentative"):
                tentative_count += 1
        if names:
            annotated_count += 1
            for normalized in names:
                display = next(name for name in speaker_names if name.casefold() == normalized)
                speaker_names[display] += 1
    return {
        "snapshot_hash": digest.hexdigest(),
        "recording_count": len(entries),
        "transcript_count": transcript_count,
        "annotated_recording_count": annotated_count,
        "unannotated_recording_count": transcript_count - annotated_count,
        "speaker_names": dict(sorted(speaker_names.items(), key=lambda item: item[0].casefold())),
        "tentative_annotation_count": tentative_count,
        "skipped": skipped,
    }


def _write_overlay(entry: Path, transcript: dict[str, Any]) -> None:
    assignments: list[dict[str, object]] = []
    for segment in _segments(transcript):
        name = str(segment.get("speaker_name") or "").strip()
        if not name:
            continue
        start = _offset(segment.get("start"))
        end = _offset(segment.get("end"))
        text = str(segment.get("text") or "").strip()
        fingerprint = hashlib.sha256(f"{start}\0{end}\0{text}".encode()).hexdigest()
        assignments.append(
            {
                "segment_id": fingerprint,
                "speaker_name": name,
                "speaker": segment.get("speaker"),
                "speaker_chunk_local": segment.get("speaker_chunk_local"),
                "start": start,
                "end": end,
                "text": text,
                "source": "historical_annotation",
            }
        )
    payload = {"version": 1, "entry_id": entry.name, "assignments": assignments}
    output = entry / "speaker-annotations.json"
    temporary = output.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(output)
    _write_speaker_list_preview(entry, transcript)


def _backup_annotations(root: Path, entry: Path, run_id: UUID) -> None:
    destination = root / ".annotation-backups" / str(run_id) / entry.name
    destination.mkdir(parents=True, exist_ok=True)
    checksums: dict[str, str] = {}
    for name in ("transcript.json", "transcript.txt"):
        source = entry / name
        if not source.is_file():
            continue
        target = destination / name
        if not target.exists():
            shutil.copy2(source, target)
        checksums[name] = hashlib.sha256(source.read_bytes()).hexdigest()
    (destination / "checksums.json").write_text(
        json.dumps(checksums, indent=2) + "\n", encoding="utf-8"
    )


def enqueue_backfill(run: SpeakerBackfillRun) -> bool:
    return enqueue_task(
        QueuedTask(
            task_type=TASK_TYPE,
            payload={
                "run_id": str(run.id),
                "organization_id": str(run.organization_id),
            },
            created_at=datetime.now(UTC),
        ),
        settings.rq_queue_name,
        redis_url=settings.rq_redis_url,
    )


def requeue_backfill(task: QueuedTask, delay_seconds: float) -> bool:
    return generic_requeue_if_failed(
        task,
        settings.rq_queue_name,
        max_retries=settings.rq_dispatch_max_retries,
        redis_url=settings.rq_redis_url,
        delay_seconds=delay_seconds,
    )


async def process_backfill_task(task: QueuedTask) -> None:
    run_id = UUID(str(task.payload["run_id"]))
    organization_id = UUID(str(task.payload["organization_id"]))
    transcription_service = SharedTranscriptionsService()
    root = transcription_service._transcriptions_root()
    current_preview = preview_annotation_backfill(root)
    async with async_session_maker() as session:
        run = await SpeakerBackfillRun.objects.by_id(run_id).first(session)
        if run is None or run.organization_id != organization_id:
            return
        if run.status == "completed":
            return
        if current_preview["snapshot_hash"] != run.snapshot_hash:
            run.status = "failed"
            run.errors = [
                {
                    "reason": "Transcripts changed after preview; create a new preview before importing."
                }
            ]
            run.completed_at = utcnow()
            run.updated_at = utcnow()
            session.add(run)
            await session.commit()
            return
        run.status = "running"
        run.started_at = run.started_at or utcnow()
        run.errors = []
        run.skipped_recordings = 0
        run.total_recordings = cast(int, current_preview["transcript_count"])
        session.add(run)
        await session.commit()

        learning = SpeakerLearningService(session, organization_id, root)
        for name in cast(dict[str, int], current_preview["speaker_names"]):
            await learning.find_or_create_profile(name)
        await session.commit()

        entries = sorted((root / "processed").glob("*/transcript.json"))
        processed_entry_ids = set(run.processed_entry_ids)
        for transcript_path in entries:
            entry = transcript_path.parent
            if entry.name in processed_entry_ids:
                continue
            try:
                transcript = _load_transcript(transcript_path)
                if transcript is None:
                    raise ValueError("Invalid transcript JSON")
                _backup_annotations(root, entry, run.id)
                _write_overlay(entry, transcript)
                helper_path = _pinned_speaker_helper()
                if not helper_path.is_file():
                    processed_entry_ids.add(entry.name)
                    run.processed_entry_ids = sorted(processed_entry_ids)
                    run.processed_recordings = len(processed_entry_ids)
                    run.updated_at = utcnow()
                    session.add(run)
                    await session.commit()
                    continue
                audio_path = transcription_service._source_audio_path(
                    entry.name, transcriptions_root=root
                )
                output = entry / "speaker-observations.json"
                script = _speaker_tools_dir() / "speaker_observations.py"
                command = [
                    transcription_service._speaker_python_bin(transcriptions_root=root),
                    str(script),
                    "--helper",
                    str(helper_path),
                    "--registry-dir",
                    str(root),
                    "--audio",
                    str(audio_path),
                    "--transcript",
                    str(transcript_path),
                    "--output",
                    str(output),
                    "--trust-speaker-names",
                ]
                subprocess.run(command, check=True, capture_output=True, text=True)
                manifest = json.loads(output.read_text(encoding="utf-8"))
                for observation in manifest.get("observations", []):
                    confirmed_name = str(observation.get("confirmed_name") or "").strip()
                    common = {
                        "entry_id": entry.name,
                        "speaker_label": str(observation["speaker_label"]),
                        "source_audio_path": str(audio_path),
                        "embedding": [float(value) for value in observation["embedding"]],
                        "encoder": str(manifest.get("encoder") or "ecapa"),
                        "speech_duration_seconds": observation.get("speech_duration_seconds"),
                        "segment_count": observation.get("segment_count"),
                        "segment_evidence": observation.get("segment_evidence") or [],
                    }
                    if confirmed_name:
                        await learning.add_confirmed_embedding(
                            name=confirmed_name,
                            source_type="historical_annotation",
                            persist_registry=False,
                            **common,
                        )
                        run.confirmed_samples += 1
                    else:
                        await learning.add_pending_observation(
                            clip_start_seconds=observation.get("clip_start_seconds"),
                            clip_end_seconds=observation.get("clip_end_seconds"),
                            **common,
                        )
                        run.pending_samples += 1
            except Exception as exc:
                run.skipped_recordings += 1
                run.errors = [*run.errors, {"entry_id": entry.name, "reason": str(exc)}]
                run.updated_at = utcnow()
                session.add(run)
                await session.commit()
                continue
            processed_entry_ids.add(entry.name)
            run.processed_entry_ids = sorted(processed_entry_ids)
            run.processed_recordings = len(processed_entry_ids)
            run.updated_at = utcnow()
            session.add(run)
            await session.commit()
        await learning.export_registry()
        run.status = "failed" if run.errors else "completed"
        run.completed_at = utcnow()
        run.updated_at = utcnow()
        session.add(run)
        await session.commit()
