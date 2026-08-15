"""Add speaker evidence and durable backfill runs.

Revision ID: b4c5d6e7f8a9
Revises: a3b4c5d6e7f8
Create Date: 2026-07-14 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b4c5d6e7f8a9"
down_revision = "a3b4c5d6e7f8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "speaker_voice_samples",
        sa.Column(
            "segment_evidence",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
    )
    op.create_table(
        "speaker_backfill_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("snapshot_hash", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("total_recordings", sa.Integer(), nullable=False),
        sa.Column("processed_recordings", sa.Integer(), nullable=False),
        sa.Column("confirmed_samples", sa.Integer(), nullable=False),
        sa.Column("pending_samples", sa.Integer(), nullable=False),
        sa.Column("skipped_recordings", sa.Integer(), nullable=False),
        sa.Column("processed_entry_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("errors", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_speaker_backfill_runs_organization_id",
        "speaker_backfill_runs",
        ["organization_id"],
    )
    op.create_index(
        "ix_speaker_backfill_runs_snapshot_hash",
        "speaker_backfill_runs",
        ["snapshot_hash"],
    )
    op.create_index("ix_speaker_backfill_runs_status", "speaker_backfill_runs", ["status"])


def downgrade() -> None:
    op.drop_table("speaker_backfill_runs")
    op.drop_column("speaker_voice_samples", "segment_evidence")
