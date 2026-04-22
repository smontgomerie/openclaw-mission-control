# ruff: noqa: INP001, S101
"""API tests for portfolio roll events and undo."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.deps import require_org_admin
from app.api.portfolio import router as portfolio_router
from app.core.config import settings
from app.core.time import utcnow
from app.db.session import get_session
from app.models.organizations import Organization
from app.models.portfolio_rationales import PortfolioRationale
from app.models.portfolio_roll_events import PortfolioRollEvent


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_app(session_maker: async_sessionmaker[AsyncSession], org_id) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(portfolio_router)
    app.include_router(api_v1)

    async def _override_require_org_admin():
        return SimpleNamespace(organization=SimpleNamespace(id=org_id))

    async def _override_get_session():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[require_org_admin] = _override_require_org_admin
    app.dependency_overrides[get_session] = _override_get_session
    return app


@pytest.mark.asyncio
async def test_undo_roll_dismisses_event_and_removes_rationale(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    org_id = uuid4()
    from_key = "nvda-call-base-200-2026-05-21-na"
    to_key = "nvda-call-base-205-2026-07-16-na"
    event_id = uuid4()
    now = utcnow()

    async with session_maker() as session:
        session.add(Organization(id=org_id, name="Roll Org"))
        session.add(
            PortfolioRationale(
                organization_id=org_id,
                position_key=to_key,
                why="carried",
                rolled_from_position_key=from_key,
                tags=[],
                history=[],
                created_at=now,
                updated_at=now,
            ),
        )
        session.add(
            PortfolioRollEvent(
                id=event_id,
                organization_id=org_id,
                rolled_from_position_key=from_key,
                rolled_to_position_key=to_key,
                rolled_at=datetime(2026, 4, 20, 12, 0, 0, tzinfo=UTC),
                net_credit_cents=140,
                source_trade_ids=["a", "b"],
                status="auto_carried",
                created_at=now,
                updated_at=now,
            ),
        )
        await session.commit()

    workspace = tmp_path / "ws"
    (workspace / "portfolio" / "rationales").mkdir(parents=True)
    (workspace / "portfolio" / "rationales" / f"{to_key}.json").write_text(
        json.dumps({"position_key": to_key, "why": "carried", "rolled_from_position_key": from_key}),
        encoding="utf-8",
    )
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))

    app = _build_app(session_maker, org_id)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        res = await client.post(f"/api/v1/portfolio/roll-events/{event_id}/undo")
    assert res.status_code == 204

    async with session_maker() as session:
        left = (
            await session.exec(select(PortfolioRationale).where(PortfolioRationale.position_key == to_key))
        ).first()
        assert left is None
        ev = await session.get(PortfolioRollEvent, event_id)
        assert ev is not None
        assert ev.status == "dismissed"

    await engine.dispose()
