"""Detected option roll events for portfolio rationale continuity."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field

from app.core.time import utcnow
from app.models.base import QueryModel


class PortfolioRollEvent(QueryModel, table=True):
    """One detected roll from an old option position_key to a new one."""

    __tablename__ = "portfolio_roll_events"  # pyright: ignore[reportAssignmentType]
    __table_args__ = (
        UniqueConstraint(
            "organization_id",
            "rolled_from_position_key",
            "rolled_to_position_key",
            name="uq_portfolio_roll_events_org_from_to",
        ),
    )

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    organization_id: UUID = Field(foreign_key="organizations.id", index=True)
    rolled_from_position_key: str = Field(index=True)
    rolled_to_position_key: str = Field(index=True)
    rolled_at: datetime = Field(index=True)
    net_credit_cents: int = Field(default=0)
    source_trade_ids: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )
    status: str = Field(default="auto_carried", index=True)
    confidence: float | None = Field(default=None)
    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)
