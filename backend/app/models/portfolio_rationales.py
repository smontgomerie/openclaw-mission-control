"""Portfolio rationale storage owned by Mission Control."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel

RUNTIME_ANNOTATION_TYPES = (datetime,)


class PortfolioRationale(QueryModel, table=True):
    """Durable rationale for one organization-scoped portfolio position."""

    __tablename__ = "portfolio_rationales"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "position_key",
            name="uq_portfolio_rationales_org_position_key",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    position_key: str = Field(index=True)
    strategy: str | None = Field(default=None)
    why: str | None = Field(default=None)
    entry_plan: str | None = Field(default=None)
    profit_take_plan: str | None = Field(default=None)
    risk_plan: str | None = Field(default=None)
    roll_or_reopen_plan: str | None = Field(default=None)
    tags: list[str] = Field(default_factory=list, sa_column=Column(JSON, nullable=False))
    history: list[dict[str, object]] = Field(
        default_factory=list,
        sa_column=Column(JSON, nullable=False),
    )
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
