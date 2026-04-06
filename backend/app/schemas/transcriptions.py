"""Schemas for shared-workspace transcription browsing."""

from __future__ import annotations

from datetime import datetime

from sqlmodel import Field, SQLModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class TranscriptionFileRead(SQLModel):
    """Metadata about one file in the shared transcriptions workspace."""

    name: str
    relative_path: str
    size_bytes: int | None = None
    modified_at: datetime | None = None


class TranscriptionEntryRead(SQLModel):
    """Processed transcription summary for list views."""

    id: str
    title: str
    status: str = "pending"
    is_done: bool = False
    captured_at: datetime | None = None
    processed_at: datetime | None = None
    source_files: list[TranscriptionFileRead] = Field(default_factory=list)
    artifact_files: list[TranscriptionFileRead] = Field(default_factory=list)
    has_analysis: bool = False
    has_transcript_text: bool = False
    has_transcript_json: bool = False
    progress_seconds: int | None = None
    total_duration_seconds: int | None = None
    diarized_speaker_count: int | None = None
    diarized_speaker_preview: list[str] = Field(default_factory=list)


class TranscriptionDetailRead(TranscriptionEntryRead):
    """Detailed processed transcription payload."""

    analysis_content: str | None = None
    transcript_text_content: str | None = None
    transcript_json_content: str | None = None
    process_log_content: str | None = None
    whisperx_log_content: str | None = None


class TranscriptionSyncRead(SQLModel):
    """Result of enqueuing a manual transcription sync."""

    ok: bool = True
    enqueued: bool = True
    job_id: str
    run_id: str | None = None


class TranscriptionSpeakerRenameRequest(SQLModel):
    """Payload for renaming a diarized speaker and re-annotating the transcript."""

    speaker_label: str
    new_name: str
