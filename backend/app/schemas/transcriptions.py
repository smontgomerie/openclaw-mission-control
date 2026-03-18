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
    is_done: bool = False
    captured_at: datetime | None = None
    processed_at: datetime | None = None
    source_files: list[TranscriptionFileRead] = Field(default_factory=list)
    artifact_files: list[TranscriptionFileRead] = Field(default_factory=list)
    has_analysis: bool = False
    has_transcript_text: bool = False
    has_transcript_json: bool = False


class TranscriptionDetailRead(TranscriptionEntryRead):
    """Detailed processed transcription payload."""

    analysis_content: str | None = None
    transcript_text_content: str | None = None
    transcript_json_content: str | None = None
