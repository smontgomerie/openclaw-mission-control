"""Add portfolio_roll_events and rolled_from on portfolio_rationales.

Revision ID: f8a1b2c3d4e5
Revises: e6f7a8b9c0d1
Create Date: 2026-04-22 12:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

revision = "f8a1b2c3d4e5"
down_revision = "e6f7a8b9c0d1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "portfolio_rationales",
        sa.Column("rolled_from_position_key", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
    )
    op.create_index(
        op.f("ix_portfolio_rationales_rolled_from_position_key"),
        "portfolio_rationales",
        ["rolled_from_position_key"],
        unique=False,
    )

    op.create_table(
        "portfolio_roll_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organization_id", sa.Uuid(), nullable=False),
        sa.Column("rolled_from_position_key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("rolled_to_position_key", sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column("rolled_at", sa.DateTime(), nullable=False),
        sa.Column("net_credit_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "source_trade_ids",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'[]'"),
        ),
        sa.Column(
            "status",
            sqlmodel.sql.sqltypes.AutoString(),
            nullable=False,
            server_default=sa.text("'auto_carried'"),
        ),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organization_id",
            "rolled_from_position_key",
            "rolled_to_position_key",
            name="uq_portfolio_roll_events_org_from_to",
        ),
    )
    op.create_index(
        op.f("ix_portfolio_roll_events_organization_id"),
        "portfolio_roll_events",
        ["organization_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portfolio_roll_events_rolled_from_position_key"),
        "portfolio_roll_events",
        ["rolled_from_position_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portfolio_roll_events_rolled_to_position_key"),
        "portfolio_roll_events",
        ["rolled_to_position_key"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portfolio_roll_events_rolled_at"),
        "portfolio_roll_events",
        ["rolled_at"],
        unique=False,
    )
    op.create_index(
        op.f("ix_portfolio_roll_events_status"),
        "portfolio_roll_events",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_portfolio_roll_events_status"), table_name="portfolio_roll_events")
    op.drop_index(op.f("ix_portfolio_roll_events_rolled_at"), table_name="portfolio_roll_events")
    op.drop_index(op.f("ix_portfolio_roll_events_rolled_to_position_key"), table_name="portfolio_roll_events")
    op.drop_index(op.f("ix_portfolio_roll_events_rolled_from_position_key"), table_name="portfolio_roll_events")
    op.drop_index(op.f("ix_portfolio_roll_events_organization_id"), table_name="portfolio_roll_events")
    op.drop_table("portfolio_roll_events")

    op.drop_index(op.f("ix_portfolio_rationales_rolled_from_position_key"), table_name="portfolio_rationales")
    op.drop_column("portfolio_rationales", "rolled_from_position_key")
