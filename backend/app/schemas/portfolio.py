"""Schemas for shared-workspace portfolio browsing and rationale editing."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from sqlmodel import Field, SQLModel


class PortfolioReviewActionRead(SQLModel):
    """One review action or flag attached to a position or daily review."""

    code: str
    severity: str = "info"
    headline: str
    summary: str | None = None
    recommendation: str | None = None


class PortfolioRationaleRead(SQLModel):
    """Current durable rationale for one position."""

    position_key: str | None = None
    rolled_from_position_key: str | None = None
    strategy: str | None = None
    why: str | None = None
    entry_plan: str | None = None
    profit_take_plan: str | None = None
    risk_plan: str | None = None
    roll_or_reopen_plan: str | None = None
    tags: list[str] = Field(default_factory=list)
    updated_at: datetime | None = None


class PortfolioRationaleHistoryRead(PortfolioRationaleRead):
    """Historical rationale version."""


class PortfolioRationaleUpdate(SQLModel):
    """Payload for creating or updating a position rationale."""

    strategy: str | None = None
    why: str | None = None
    entry_plan: str | None = None
    profit_take_plan: str | None = None
    risk_plan: str | None = None
    roll_or_reopen_plan: str | None = None
    tags: list[str] = Field(default_factory=list)


class PortfolioPositionRead(SQLModel):
    """List-friendly normalized position view."""

    position_key: str
    as_of: datetime | None = None
    source_row_ref: str | None = None
    ticker: str
    instrument_type: str | None = None
    strategy: str | None = None
    option_side: str | None = None
    quantity: float | None = None
    expiration: str | None = None
    strike: float | None = None
    cost_basis: float | None = None
    mark: float | None = None
    unrealized_pnl: float | None = None
    unrealized_pnl_pct: float | None = None
    dte: int | None = None
    status: str | None = None
    latest_flags: list[PortfolioReviewActionRead] = Field(default_factory=list)
    needs_rationale: bool = False
    rationale_updated_at: datetime | None = None


class PortfolioPositionDetailRead(PortfolioPositionRead):
    """Detailed position payload for the portfolio detail pane."""

    rationale: PortfolioRationaleRead | None = None
    rationale_history: list[PortfolioRationaleHistoryRead] = Field(default_factory=list)
    latest_review_id: str | None = None
    latest_review_summary_markdown: str | None = None


class PortfolioReviewRead(SQLModel):
    """Daily portfolio review payload."""

    id: str
    date: str | None = None
    generated_at: datetime | None = None
    summary_markdown: str | None = None
    actions: list[PortfolioReviewActionRead] = Field(default_factory=list)
    position_keys: list[str] = Field(default_factory=list)


class PortfolioSyncRead(SQLModel):
    """Result of enqueuing a manual portfolio sync."""

    ok: bool = True
    enqueued: bool = True
    job_id: str
    run_id: str | None = None


class PortfolioReviewRunRequest(SQLModel):
    """Raw Google Sheet rows for server-side portfolio review generation."""

    positions_rows: list[list[Any]] = Field(default_factory=list)
    trades_rows: list[list[Any]] = Field(default_factory=list)
    generated_at: str | None = None


class PortfolioReviewRunResult(SQLModel):
    """Result of running the portfolio review engine (cron / manual)."""

    ok: bool = True
    generated_at: str
    position_count: int = 0
    flagged_count: int = 0
    missing_rationale_count: int = 0
    rolls_detected_count: int = 0
    review_id: str
    snapshot_path: str
    review_json_path: str
    review_markdown_path: str


class PortfolioRollEventRead(SQLModel):
    """One detected or recorded option roll."""

    id: str
    rolled_from_position_key: str
    rolled_to_position_key: str
    rolled_at: datetime
    net_credit_cents: int = 0
    source_trade_ids: list[str] = Field(default_factory=list)
    status: str = "auto_carried"
    confidence: float | None = None
