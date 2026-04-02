"""Add portfolio_rationales table.

Revision ID: d4a8f1b2c3e4
Revises: 1a7b2c3d4e5f
Create Date: 2026-03-22 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision = "d4a8f1b2c3e4"
down_revision = "1a7b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create organization-scoped portfolio rationale storage."""
    op.create_table(
        "portfolio_rationales",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("position_key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("strategy", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("why", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("entry_plan", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("profit_take_plan", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("risk_plan", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("roll_or_reopen_plan", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column(
            "tags",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "history",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "position_key",
            name="uq_portfolio_rationales_org_position_key",
        ),
    )
    op.create_index(
        op.f("ix_portfolio_rationales_organization_id"),
        "portfolio_rationales",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portfolio_rationales_position_key"),
        "portfolio_rationales",
        ["position_key"],
        unique=False,
    )


def downgrade() -> None:
    """Drop portfolio_rationales table."""
    op.drop_index(op.f("ix_portfolio_rationales_position_key"), table_name="portfolio_rationales")
    op.drop_index(op.f("ix_portfolio_rationales_organization_id"), table_name="portfolio_rationales")
    op.drop_table("portfolio_rationales")
