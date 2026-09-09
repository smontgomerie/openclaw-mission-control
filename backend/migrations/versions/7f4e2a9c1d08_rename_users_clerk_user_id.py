"""Rename users.clerk_user_id to external_auth_id.

Provider-neutral name for the column that keys a user on an external
identity (Clerk, local auth, or a future provider). Pure rename: column
type, nullability, and the unique index are all preserved.

Revision ID: 7f4e2a9c1d08
Revises: b4c5d6e7f8a9
Create Date: 2026-09-09 00:00:00.000000

"""

from __future__ import annotations

import sqlalchemy as sa
import sqlmodel
from alembic import op

# revision identifiers, used by Alembic.
revision = "7f4e2a9c1d08"
down_revision = "b4c5d6e7f8a9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Rename the column and its unique index, keeping both in place."""
    op.alter_column(
        "users",
        "clerk_user_id",
        new_column_name="external_auth_id",
        existing_type=sqlmodel.sql.sqltypes.AutoString(),
        existing_nullable=False,
    )
    op.drop_index(op.f("ix_users_clerk_user_id"), table_name="users")
    op.create_index(
        op.f("ix_users_external_auth_id"),
        "users",
        ["external_auth_id"],
        unique=True,
    )


def downgrade() -> None:
    """Restore the original column and index names."""
    op.alter_column(
        "users",
        "external_auth_id",
        new_column_name="clerk_user_id",
        existing_type=sqlmodel.sql.sqltypes.AutoString(),
        existing_nullable=False,
    )
    op.drop_index(op.f("ix_users_external_auth_id"), table_name="users")
    op.create_index(
        op.f("ix_users_clerk_user_id"), "users", ["clerk_user_id"], unique=True,
    )
