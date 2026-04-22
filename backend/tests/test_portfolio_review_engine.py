# ruff: noqa: INP001, S101
"""Integration tests for portfolio review engine."""

from __future__ import annotations

from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app.core.config import settings
from app.models.organizations import Organization
from app.services.portfolio.price_enrichment import EnrichmentBundle
from app.services.portfolio.review_engine import run_portfolio_review


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


@pytest.mark.asyncio
async def test_run_portfolio_review_writes_snapshot_and_review(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(tmp_path))
    monkeypatch.setattr(
        "app.services.portfolio.review_engine.enrich_positions",
        lambda positions, workspace_portfolio_root: EnrichmentBundle(),
    )

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    org_id = uuid4()
    async with session_maker() as session:
        session.add(Organization(id=org_id, name="Review Org"))
        await session.commit()

    positions_rows = [
        ["Ticker", "Qty", "Strike", "Expiration", "DTE", "Instrument Type", "Strategy"],
        ["XYZ", "1", "100", "2026-05-01", "10", "put", "csp"],
    ]

    async with session_maker() as session:
        result = await run_portfolio_review(
            session,
            org_id,
            positions_rows=positions_rows,
            trades_rows=[],
        )

    assert result.ok is True
    assert result.position_count == 1
    latest = tmp_path / "portfolio" / "latest.json"
    assert latest.is_file()
    data = latest.read_text(encoding="utf-8")
    assert "XYZ" in data
    assert "Rolls detected" in (tmp_path / "portfolio" / "reviews" / f"{result.review_id}.md").read_text(
        encoding="utf-8",
    )
    await engine.dispose()
