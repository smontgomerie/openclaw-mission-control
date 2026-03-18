"""Read-only access to shared-workspace transcription artifacts."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, status

from app.core.config import settings
from app.schemas.transcriptions import (
    TranscriptionDetailRead,
    TranscriptionEntryRead,
    TranscriptionFileRead,
)

TRANSCRIPTIONS_DIRNAME = "transcriptions"
PROCESSED_DIRNAME = "processed"
TEXT_CANDIDATES = ("transcript.txt",)
JSON_CANDIDATES = ("transcript.json",)
ANALYSIS_CANDIDATES = ("analysis.md",)
STRUCTURED_TEXT_SUFFIXES = (".txt", ".md", ".json", ".srt", ".tsv", ".vtt", ".log")
SOURCE_AUDIO_SUFFIXES = (".m4a", ".wav", ".mp3")
IGNORED_ROOT_NAMES = {"transcribe.sh", "process_wav_files.sh", ".test"}


def _utc_datetime(value: float) -> datetime:
    return datetime.fromtimestamp(value, tz=UTC)


def _safe_read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except UnicodeDecodeError:
        return path.read_text(encoding="utf-8", errors="replace")


def _file_read(path: Path, *, relative_to: Path) -> TranscriptionFileRead:
    stat = path.stat()
    return TranscriptionFileRead(
        name=path.name,
        relative_path=path.relative_to(relative_to).as_posix(),
        size_bytes=stat.st_size,
        modified_at=_utc_datetime(stat.st_mtime),
    )


def _is_transcription_source_file(path: Path) -> bool:
    return (
        path.is_file()
        and path.name not in IGNORED_ROOT_NAMES
        and path.suffix.lower() in SOURCE_AUDIO_SUFFIXES
    )


def _find_first_existing(entry_dir: Path, candidates: tuple[str, ...]) -> Path | None:
    for name in candidates:
        candidate = entry_dir / name
        if candidate.is_file():
            return candidate
    return None


def _find_best_transcript_text(entry_dir: Path) -> Path | None:
    named = _find_first_existing(entry_dir, TEXT_CANDIDATES)
    if named is not None:
        return named
    for path in sorted(entry_dir.iterdir(), key=lambda item: item.name.lower()):
        if path.is_file() and path.suffix.lower() == ".txt":
            return path
    return None


def _find_best_transcript_json(entry_dir: Path) -> Path | None:
    named = _find_first_existing(entry_dir, JSON_CANDIDATES)
    if named is not None:
        return named
    for path in sorted(entry_dir.iterdir(), key=lambda item: item.name.lower()):
        if path.is_file() and path.suffix.lower() == ".json":
            return path
    return None


def _parse_captured_at(entry_id: str, source_files: list[TranscriptionFileRead]) -> datetime | None:
    if entry_id.isdigit():
        try:
            timestamp = int(entry_id)
            if len(entry_id) >= 13:
                timestamp = timestamp // 1000
            return datetime.fromtimestamp(timestamp, tz=UTC)
        except (OverflowError, OSError, ValueError):
            pass
    if source_files:
        return min(
            (item.modified_at for item in source_files if item.modified_at is not None),
            default=None,
        )
    return None


class SharedTranscriptionsService:
    """Read processed transcript entries from the mounted shared workspace."""

    def _workspace_root(self) -> Path:
        raw = settings.openclaw_shared_workspace_root.strip()
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Shared OpenClaw workspace is not configured.",
            )
        root = Path(raw)
        if not root.exists() or not root.is_dir():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Shared OpenClaw workspace mount is unavailable.",
            )
        return root

    def _transcriptions_root(self) -> Path:
        root = self._workspace_root() / TRANSCRIPTIONS_DIRNAME
        if not root.exists() or not root.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared transcriptions directory was not found.",
            )
        return root

    def _processed_root(self) -> Path:
        root = self._transcriptions_root() / PROCESSED_DIRNAME
        if not root.exists() or not root.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Processed transcriptions directory was not found.",
            )
        return root

    def _entry_dir(self, entry_id: str) -> Path:
        if not entry_id or "/" in entry_id or "\\" in entry_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription entry not found.",
            )
        processed_root = self._processed_root()
        candidate = (processed_root / entry_id).resolve()
        try:
            candidate.relative_to(processed_root.resolve())
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription entry not found.",
            ) from exc
        if not candidate.exists() or not candidate.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription entry not found.",
            )
        return candidate

    def _source_files(self, entry_id: str, *, transcriptions_root: Path) -> list[TranscriptionFileRead]:
        matches: list[TranscriptionFileRead] = []
        for path in sorted(transcriptions_root.iterdir(), key=lambda item: item.name.lower()):
            if not _is_transcription_source_file(path):
                continue
            if path.stem != entry_id:
                continue
            matches.append(_file_read(path, relative_to=transcriptions_root))
        return matches

    def _artifact_files(self, entry_dir: Path, *, transcriptions_root: Path) -> list[TranscriptionFileRead]:
        artifact_files: list[TranscriptionFileRead] = []
        for path in sorted(entry_dir.iterdir(), key=lambda item: item.name.lower()):
            if not path.is_file():
                continue
            artifact_files.append(_file_read(path, relative_to=transcriptions_root))
        return artifact_files

    def _build_entry(self, entry_dir: Path, *, transcriptions_root: Path) -> TranscriptionEntryRead:
        entry_id = entry_dir.name
        source_files = self._source_files(entry_id, transcriptions_root=transcriptions_root)
        artifact_files = self._artifact_files(entry_dir, transcriptions_root=transcriptions_root)
        analysis_path = _find_first_existing(entry_dir, ANALYSIS_CANDIDATES)
        text_path = _find_best_transcript_text(entry_dir)
        json_path = _find_best_transcript_json(entry_dir)
        done_path = entry_dir / ".done"
        processed_at = max(
            (item.modified_at for item in artifact_files if item.modified_at is not None),
            default=None,
        )
        return TranscriptionEntryRead(
            id=entry_id,
            title=entry_id,
            is_done=done_path.is_file(),
            captured_at=_parse_captured_at(entry_id, source_files),
            processed_at=processed_at,
            source_files=source_files,
            artifact_files=artifact_files,
            has_analysis=analysis_path is not None,
            has_transcript_text=text_path is not None,
            has_transcript_json=json_path is not None,
        )

    def list_entries(self) -> list[TranscriptionEntryRead]:
        transcriptions_root = self._transcriptions_root()
        processed_root = self._processed_root()
        entries: list[TranscriptionEntryRead] = []
        for path in sorted(processed_root.iterdir(), key=lambda item: item.name.lower(), reverse=True):
            if not path.is_dir():
                continue
            entries.append(self._build_entry(path, transcriptions_root=transcriptions_root))
        entries.sort(
            key=lambda item: (
                item.processed_at or datetime.min.replace(tzinfo=UTC),
                item.id.lower(),
            ),
            reverse=True,
        )
        return entries

    def get_entry(self, entry_id: str) -> TranscriptionDetailRead:
        transcriptions_root = self._transcriptions_root()
        entry_dir = self._entry_dir(entry_id)
        summary = self._build_entry(entry_dir, transcriptions_root=transcriptions_root)

        analysis_path = _find_first_existing(entry_dir, ANALYSIS_CANDIDATES)
        text_path = _find_best_transcript_text(entry_dir)
        json_path = _find_best_transcript_json(entry_dir)

        transcript_json_content: str | None = None
        if json_path is not None:
            raw_json = _safe_read_text(json_path)
            if raw_json is not None:
                try:
                    transcript_json_content = json.dumps(
                        json.loads(raw_json),
                        indent=2,
                        ensure_ascii=False,
                    )
                except json.JSONDecodeError:
                    transcript_json_content = raw_json

        return TranscriptionDetailRead(
            **summary.model_dump(),
            analysis_content=_safe_read_text(analysis_path) if analysis_path else None,
            transcript_text_content=_safe_read_text(text_path) if text_path else None,
            transcript_json_content=transcript_json_content,
        )
