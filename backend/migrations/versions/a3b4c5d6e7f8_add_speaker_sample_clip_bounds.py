"""Add review playback windows for speaker samples.

Revision ID: a3b4c5d6e7f8
Revises: c7d8e9f0a1b2
Create Date: 2026-07-14 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "a3b4c5d6e7f8"
down_revision = "c7d8e9f0a1b2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "speaker_voice_samples",
        sa.Column("clip_start_seconds", sa.Float(), nullable=True),
    )
    op.add_column(
        "speaker_voice_samples",
        sa.Column("clip_end_seconds", sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("speaker_voice_samples", "clip_end_seconds")
    op.drop_column("speaker_voice_samples", "clip_start_seconds")
