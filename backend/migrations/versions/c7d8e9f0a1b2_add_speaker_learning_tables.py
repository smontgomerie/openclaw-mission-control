"""Add organization-scoped speaker learning tables.

Revision ID: c7d8e9f0a1b2
Revises: f8a1b2c3d4e5
Create Date: 2026-07-13 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision = "c7d8e9f0a1b2"
down_revision = "f8a1b2c3d4e5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "speaker_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("display_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("normalized_name", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("aliases", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("encoder", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("centroid_embedding", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("confirmed_sample_count", sa.Integer(), nullable=False),
        sa.Column("represented_sample_count", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "normalized_name", name="uq_speaker_profiles_org_normalized_name"
        ),
    )
    op.create_index("ix_speaker_profiles_organization_id", "speaker_profiles", ["organization_id"])
    op.create_index("ix_speaker_profiles_normalized_name", "speaker_profiles", ["normalized_name"])
    op.create_table(
        "speaker_voice_samples",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("profile_id", sa.Uuid(), nullable=True),
        sa.Column("candidate_profile_id", sa.Uuid(), nullable=True),
        sa.Column("transcription_entry_id", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("speaker_label", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("source_audio_path", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("fingerprint", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("embedding", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("encoder", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("speech_duration_seconds", sa.Float(), nullable=True),
        sa.Column("segment_count", sa.Integer(), nullable=True),
        sa.Column("similarity", sa.Float(), nullable=True),
        sa.Column("second_similarity", sa.Float(), nullable=True),
        sa.Column("status", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("source_type", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("represented_sample_count", sa.Integer(), nullable=False),
        sa.Column("reviewed_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["candidate_profile_id"], ["speaker_profiles.id"]),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.ForeignKeyConstraint(["profile_id"], ["speaker_profiles.id"]),
        sa.ForeignKeyConstraint(["reviewed_by_user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id", "fingerprint", name="uq_speaker_voice_samples_org_fingerprint"
        ),
    )
    for column in (
        "organization_id",
        "profile_id",
        "candidate_profile_id",
        "transcription_entry_id",
        "fingerprint",
        "status",
    ):
        op.create_index(f"ix_speaker_voice_samples_{column}", "speaker_voice_samples", [column])


def downgrade() -> None:
    op.drop_table("speaker_voice_samples")
    op.drop_table("speaker_profiles")
