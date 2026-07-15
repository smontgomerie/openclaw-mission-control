"""Organization-scoped speaker identity and voice sample models."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class SpeakerProfile(QueryModel, table=True):
    """A durable named speaker identity derived from confirmed voice samples."""

    __tablename__ = "speaker_profiles"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "normalized_name", name="uq_speaker_profiles_org_normalized_name"
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    display_name: str
    normalized_name: str = Field(index=True)
    aliases: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    encoder: str = Field(default="ecapa")
    centroid_embedding: list[float] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    confirmed_sample_count: int = Field(default=0)
    represented_sample_count: int = Field(default=0)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)


class SpeakerVoiceSample(QueryModel, table=True):
    """One diarized voice embedding awaiting review or confirmed for a profile."""

    __tablename__ = "speaker_voice_samples"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "organization_id", "fingerprint", name="uq_speaker_voice_samples_org_fingerprint"
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    profile_id: UUID | None = Field(default=None, foreign_key="speaker_profiles.id", index=True)
    candidate_profile_id: UUID | None = Field(
        default=None, foreign_key="speaker_profiles.id", index=True
    )
    transcription_entry_id: str | None = Field(default=None, index=True)
    speaker_label: str | None = None
    source_audio_path: str | None = None
    fingerprint: str = Field(index=True)
    embedding: list[float] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    encoder: str = Field(default="ecapa")
    speech_duration_seconds: float | None = None
    segment_count: int | None = None
    similarity: float | None = None
    second_similarity: float | None = None
    status: str = Field(default="pending", index=True)
    source_type: str = Field(default="observation")
    represented_sample_count: int = Field(default=1)
    reviewed_by_user_id: UUID | None = Field(default=None, foreign_key="users.id")
    reviewed_at: datetime | None = None
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
