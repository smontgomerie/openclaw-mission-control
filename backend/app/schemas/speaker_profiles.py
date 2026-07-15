"""API schemas for persistent speaker profiles and reviewed voice samples."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlmodel import Field, SQLModel


class SpeakerProfileRead(SQLModel):
    id: UUID
    display_name: str
    aliases: list[str] = Field(default_factory=list)
    encoder: str
    confirmed_sample_count: int
    represented_sample_count: int
    pending_sample_count: int = 0
    created_at: datetime
    updated_at: datetime


class SpeakerVoiceSampleRead(SQLModel):
    id: UUID
    profile_id: UUID | None = None
    candidate_profile_id: UUID | None = None
    candidate_name: str | None = None
    transcription_entry_id: str | None = None
    speaker_label: str | None = None
    source_audio_path: str | None = None
    encoder: str
    speech_duration_seconds: float | None = None
    segment_count: int | None = None
    similarity: float | None = None
    second_similarity: float | None = None
    status: str
    source_type: str
    represented_sample_count: int
    created_at: datetime
    updated_at: datetime


class SpeakerDirectoryRead(SQLModel):
    profiles: list[SpeakerProfileRead] = Field(default_factory=list)
    pending_samples: list[SpeakerVoiceSampleRead] = Field(default_factory=list)


class SpeakerSampleConfirmRequest(SQLModel):
    profile_id: UUID | None = None
    new_name: str | None = None


class SpeakerProfileRenameRequest(SQLModel):
    display_name: str


class SpeakerProfileMergeRequest(SQLModel):
    target_profile_id: UUID
