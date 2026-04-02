"""Read-only access to shared-workspace transcription artifacts."""

from __future__ import annotations

import json
import mimetypes
import re
import subprocess
from datetime import UTC, datetime
from pathlib import Path

from fastapi import HTTPException, status
from fastapi.responses import FileResponse

from app.core.config import settings
from app.schemas.transcriptions import (
    TranscriptionDetailRead,
    TranscriptionEntryRead,
    TranscriptionFileRead,
    TranscriptionSpeakerRenameRequest,
)

TRANSCRIPTIONS_DIRNAME = "transcriptions"
PROCESSED_DIRNAME = "processed"
TEXT_CANDIDATES = ("transcript.txt",)
JSON_CANDIDATES = ("transcript.json",)
ANALYSIS_CANDIDATES = ("analysis.md",)
STRUCTURED_TEXT_SUFFIXES = (".txt", ".md", ".json", ".srt", ".tsv", ".vtt", ".log")
SOURCE_AUDIO_SUFFIXES = (".m4a", ".wav", ".mp3")
IGNORED_ROOT_NAMES = {"transcribe.sh", "process_wav_files.sh", ".test"}
SPEAKER_HELPER_NAME = "speaker_identity.py"
TRANSCRIPT_VENV_DIRNAME = ".venv-whisperx"
PROCESS_LOG_DURATION_PATTERN = re.compile(r"duration=(?P<duration>\d+)s")
WHISPERX_LOG_DURATION_PATTERN = re.compile(r"\[DURATION\]\s+(?P<duration>\d+)s")


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


def _entry_status(*, done: bool, has_artifacts: bool) -> str:
    if done:
        return "done"
    if has_artifacts:
        return "partial"
    return "pending"


def _read_processing_progress(entry_dir: Path) -> int | None:
    state_path = entry_dir / ".chunk_state"
    if not state_path.is_file():
        return None

    try:
        lines = [line.strip() for line in state_path.read_text(encoding="utf-8").splitlines()]
    except OSError:
        return None

    if not lines:
        return None

    try:
        progress_seconds = int(lines[0])
    except ValueError:
        return None

    return max(progress_seconds, 0)


def _read_processing_total_duration(entry_dir: Path) -> int | None:
    candidate_paths = (entry_dir / "process.log", entry_dir / "whisperx.log")
    patterns = (PROCESS_LOG_DURATION_PATTERN, WHISPERX_LOG_DURATION_PATTERN)

    for path in candidate_paths:
        if not path.is_file():
            continue
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for pattern in patterns:
            match = pattern.search(content)
            if match is None:
                continue
            try:
                duration_seconds = int(match.group("duration"))
            except (TypeError, ValueError):
                continue
            return max(duration_seconds, 0)

    return None


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

    def _processed_root_if_present(self) -> Path | None:
        root = self._transcriptions_root() / PROCESSED_DIRNAME
        if not root.exists() or not root.is_dir():
            return None
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

    def _validate_entry_id(self, entry_id: str) -> None:
        if not entry_id or "/" in entry_id or "\\" in entry_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription entry not found.",
            )

    def _source_file_map(self, *, transcriptions_root: Path) -> dict[str, list[TranscriptionFileRead]]:
        files_by_id: dict[str, list[TranscriptionFileRead]] = {}
        for path in sorted(transcriptions_root.iterdir(), key=lambda item: item.name.lower()):
            if not _is_transcription_source_file(path):
                continue
            files_by_id.setdefault(path.stem, []).append(_file_read(path, relative_to=transcriptions_root))
        return files_by_id

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

    def _source_audio_path(self, entry_id: str, *, transcriptions_root: Path) -> Path:
        candidates = [
            path
            for path in sorted(transcriptions_root.iterdir(), key=lambda item: item.name.lower())
            if _is_transcription_source_file(path) and path.stem == entry_id
        ]
        if not candidates:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Source audio file is required to rename speakers for this transcript.",
            )
        return candidates[0]

    def _require_processed_entry_dir(self, entry_id: str) -> Path:
        self._validate_entry_id(entry_id)
        processed_root = self._processed_root()
        entry_dir = processed_root / entry_id
        if not entry_dir.exists() or not entry_dir.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Processed transcription entry not found.",
            )
        return entry_dir

    def _raw_transcript_json_path(self, entry_dir: Path) -> Path:
        raw_path = entry_dir / f"{entry_dir.name}.json"
        if not raw_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Canonical raw transcript JSON is missing for this entry.",
            )
        return raw_path

    def _speaker_helper_path(self, *, transcriptions_root: Path) -> Path:
        helper_path = transcriptions_root / SPEAKER_HELPER_NAME
        if not helper_path.is_file():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Speaker rename helper is unavailable in the shared transcriptions workspace.",
            )
        return helper_path

    def _speaker_python_bin(self, *, transcriptions_root: Path) -> str:
        configured = settings.openclaw_transcriptions_python_bin.strip()
        if configured:
            return configured

        for candidate_name in ("python", "python3"):
            candidate = transcriptions_root / TRANSCRIPT_VENV_DIRNAME / "bin" / candidate_name
            if candidate.is_file():
                return str(candidate)

        return "python3"

    def _run_speaker_helper(self, command: list[str], *, transcriptions_root: Path) -> None:
        try:
            subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                cwd=str(transcriptions_root),
                timeout=300,
            )
        except FileNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Python runtime is unavailable for speaker rename processing.",
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise HTTPException(
                status_code=status.HTTP_504_GATEWAY_TIMEOUT,
                detail="Speaker rename processing timed out.",
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            detail = stderr or stdout or "Speaker rename processing failed."
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=detail.splitlines()[0][:300],
            ) from exc

    def _build_entry(
        self,
        entry_id: str,
        *,
        transcriptions_root: Path,
        source_files: list[TranscriptionFileRead] | None = None,
        entry_dir: Path | None = None,
    ) -> TranscriptionEntryRead:
        resolved_source_files = source_files or self._source_files(
            entry_id, transcriptions_root=transcriptions_root
        )
        artifact_files = (
            self._artifact_files(entry_dir, transcriptions_root=transcriptions_root)
            if entry_dir is not None
            else []
        )
        analysis_path = (
            _find_first_existing(entry_dir, ANALYSIS_CANDIDATES) if entry_dir is not None else None
        )
        text_path = _find_best_transcript_text(entry_dir) if entry_dir is not None else None
        json_path = _find_best_transcript_json(entry_dir) if entry_dir is not None else None
        done_path = entry_dir / ".done" if entry_dir is not None else None
        is_done = done_path.is_file() if done_path is not None else False
        progress_seconds = (
            None if entry_dir is None or is_done else _read_processing_progress(entry_dir)
        )
        total_duration_seconds = (
            None if entry_dir is None else _read_processing_total_duration(entry_dir)
        )
        processed_at = (
            max((item.modified_at for item in artifact_files if item.modified_at is not None), default=None)
            if artifact_files
            else None
        )
        return TranscriptionEntryRead(
            id=entry_id,
            title=entry_id,
            status=_entry_status(done=is_done, has_artifacts=bool(artifact_files)),
            is_done=is_done,
            captured_at=_parse_captured_at(entry_id, resolved_source_files),
            processed_at=processed_at,
            source_files=resolved_source_files,
            artifact_files=artifact_files,
            has_analysis=analysis_path is not None,
            has_transcript_text=text_path is not None,
            has_transcript_json=json_path is not None,
            progress_seconds=progress_seconds,
            total_duration_seconds=total_duration_seconds,
        )

    def list_entries(self) -> list[TranscriptionEntryRead]:
        transcriptions_root = self._transcriptions_root()
        processed_root = self._processed_root_if_present()
        source_files_by_id = self._source_file_map(transcriptions_root=transcriptions_root)
        entries: list[TranscriptionEntryRead] = []
        processed_dirs = (
            {
                path.name: path
                for path in sorted(
                    processed_root.iterdir(), key=lambda item: item.name.lower(), reverse=True
                )
                if path.is_dir()
            }
            if processed_root is not None
            else {}
        )
        for entry_id in sorted(
            set(source_files_by_id.keys()) | set(processed_dirs.keys()),
            key=str.lower,
            reverse=True,
        ):
            entries.append(
                self._build_entry(
                    entry_id,
                    transcriptions_root=transcriptions_root,
                    source_files=source_files_by_id.get(entry_id, []),
                    entry_dir=processed_dirs.get(entry_id),
                )
            )
        entries.sort(
            key=lambda item: (
                item.processed_at or item.captured_at or datetime.min.replace(tzinfo=UTC),
                item.id.lower(),
            ),
            reverse=True,
        )
        return entries

    def get_entry(self, entry_id: str) -> TranscriptionDetailRead:
        transcriptions_root = self._transcriptions_root()
        self._validate_entry_id(entry_id)
        processed_root = self._processed_root_if_present()
        entry_dir = processed_root / entry_id if processed_root is not None else None
        if entry_dir is not None and entry_dir.exists() and not entry_dir.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription entry not found.",
            )
        source_files = self._source_files(entry_id, transcriptions_root=transcriptions_root)
        if not source_files and (entry_dir is None or not entry_dir.is_dir()):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Transcription entry not found.",
            )
        summary = self._build_entry(
            entry_id,
            transcriptions_root=transcriptions_root,
            source_files=source_files,
            entry_dir=entry_dir if entry_dir is not None and entry_dir.is_dir() else None,
        )

        analysis_path = (
            _find_first_existing(entry_dir, ANALYSIS_CANDIDATES)
            if entry_dir is not None and entry_dir.is_dir()
            else None
        )
        text_path = (
            _find_best_transcript_text(entry_dir) if entry_dir is not None and entry_dir.is_dir() else None
        )
        json_path = (
            _find_best_transcript_json(entry_dir) if entry_dir is not None and entry_dir.is_dir() else None
        )
        process_log_path = entry_dir / "process.log" if entry_dir is not None and entry_dir.is_dir() else None
        whisperx_log_path = entry_dir / "whisperx.log" if entry_dir is not None and entry_dir.is_dir() else None

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
            process_log_content=_safe_read_text(process_log_path) if process_log_path else None,
            whisperx_log_content=_safe_read_text(whisperx_log_path) if whisperx_log_path else None,
        )

    def rename_speaker(
        self,
        entry_id: str,
        payload: TranscriptionSpeakerRenameRequest,
    ) -> TranscriptionDetailRead:
        transcriptions_root = self._transcriptions_root()
        entry_dir = self._require_processed_entry_dir(entry_id)
        audio_path = self._source_audio_path(entry_id, transcriptions_root=transcriptions_root)
        raw_json_path = self._raw_transcript_json_path(entry_dir)
        transcript = json.loads(raw_json_path.read_text(encoding="utf-8"))
        segments = transcript.get("segments")
        if not isinstance(segments, list) or not any(
            isinstance(segment, dict)
            and str(segment.get("speaker") or "").strip() == payload.speaker_label.strip()
            for segment in segments
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Speaker label was not found in the transcript diarization data.",
            )

        helper_path = self._speaker_helper_path(transcriptions_root=transcriptions_root)
        normalized_name = " ".join(payload.new_name.strip().split())
        if not normalized_name:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Speaker name cannot be empty.",
            )

        transcript_json_path = entry_dir / "transcript.json"
        transcript_text_path = entry_dir / "transcript.txt"
        python_bin = self._speaker_python_bin(transcriptions_root=transcriptions_root)
        registry_dir = str(transcriptions_root)

        self._run_speaker_helper(
            [
                python_bin,
                str(helper_path),
                "--registry-dir",
                registry_dir,
                "enroll-from-transcript",
                "--name",
                normalized_name,
                "--audio",
                str(audio_path),
                "--transcript",
                str(raw_json_path),
                "--speaker",
                payload.speaker_label.strip(),
            ],
            transcriptions_root=transcriptions_root,
        )
        self._run_speaker_helper(
            [
                python_bin,
                str(helper_path),
                "--registry-dir",
                registry_dir,
                "annotate",
                "--audio",
                str(audio_path),
                "--transcript",
                str(raw_json_path),
                "--output-json",
                str(transcript_json_path),
                "--output-text",
                str(transcript_text_path),
            ],
            transcriptions_root=transcriptions_root,
        )

        return self.get_entry(entry_id)

    def get_source_audio_response(self, entry_id: str) -> FileResponse:
        transcriptions_root = self._transcriptions_root()
        audio_path = self._source_audio_path(entry_id, transcriptions_root=transcriptions_root)
        media_type, _ = mimetypes.guess_type(audio_path.name)
        return FileResponse(
            path=audio_path,
            media_type=media_type or "application/octet-stream",
            filename=audio_path.name,
        )
