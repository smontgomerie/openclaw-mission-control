"""Merge activity_events and portfolio_rationales heads.

Revision ID: e6f7a8b9c0d1
Revises: a9b1c2d3e4f7, d4a8f1b2c3e4
Create Date: 2026-03-23 17:35:00.000000

"""

from __future__ import annotations

# revision identifiers, used by Alembic.
revision = "e6f7a8b9c0d1"
down_revision = ("a9b1c2d3e4f7", "d4a8f1b2c3e4")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Merge independent heads into a single linear tip."""


def downgrade() -> None:
    """Restore the branched migration graph."""
