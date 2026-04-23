# ruff: noqa: INP001, S101
"""Integration tests for portfolio review engine."""

from __future__ import annotations

import json
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
    assert result.review.id == result.review_id
    assert "Rolls detected" in (result.review.summary_markdown or "")
    assert not result.snapshot_path.startswith("/")
    assert result.snapshot_path.startswith("portfolio/")
    assert result.review_json_path.startswith("portfolio/reviews/")
    assert result.review_markdown_path.endswith(".md")
    latest = tmp_path / "portfolio" / "latest.json"
    assert latest.is_file()
    data = latest.read_text(encoding="utf-8")
    assert "XYZ" in data
    assert "Rolls detected" in (tmp_path / "portfolio" / "reviews" / f"{result.review_id}.md").read_text(
        encoding="utf-8",
    )
    await engine.dispose()


@pytest.mark.asyncio
async def test_run_portfolio_review_hydrates_rationale_from_disk_mirror(
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
        session.add(Organization(id=org_id, name="Hydrate Org"))
        await session.commit()

    rationale_dir = tmp_path / "portfolio" / "rationales"
    rationale_dir.mkdir(parents=True, exist_ok=True)
    position_key = "xyz-stock-base-na-na-10"
    rationale_dir.joinpath(f"{position_key}.json").write_text(
        json.dumps(
            {
                "position_key": position_key,
                "why": "Holding for long-term.",
                "updated_at": "2026-03-10T15:30:00Z",
            },
            indent=2,
        ),
        encoding="utf-8",
    )

    positions_rows = [
        ["Ticker", "Qty Open"],
        ["XYZ", "10"],
    ]

    async with session_maker() as session:
        result = await run_portfolio_review(
            session,
            org_id,
            positions_rows=positions_rows,
            trades_rows=[],
        )

    assert result.missing_rationale_count == 0
    latest = json.loads((tmp_path / "portfolio" / "latest.json").read_text(encoding="utf-8"))
    row = latest["positions"][0]
    assert row["position_key"] == position_key
    assert row["needs_rationale"] is False
    assert row["rationale_updated_at"] == "2026-03-10T15:30:00Z"
    await engine.dispose()
