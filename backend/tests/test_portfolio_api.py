# ruff: noqa: INP001, S101
"""API coverage for shared-workspace portfolio endpoints."""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api import portfolio as portfolio_api
from app.api.deps import require_org_admin
from app.api.portfolio import router as portfolio_router
from app.core.config import settings
from app.db.session import get_session
from app.models.organizations import Organization
from app.models.portfolio_rationales import PortfolioRationale


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_test_app(
    ctx: object,
    session_maker: async_sessionmaker[AsyncSession] | None = None,
) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(portfolio_router)
    app.include_router(api_v1)

    async def _override_require_org_admin() -> object:
        return ctx

    async def _override_get_session():
        if session_maker is None:
            yield object()
            return
        async with session_maker() as session:
            yield session

    app.dependency_overrides[require_org_admin] = _override_require_org_admin
    app.dependency_overrides[get_session] = _override_get_session
    return app


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def _seed_portfolio(workspace: Path) -> None:
    portfolio = workspace / "portfolio"
    _write(
        portfolio / "latest.json",
        json.dumps(
            {
                "as_of": "2026-03-20T14:35:00Z",
                "positions": [
                    {
                        "position_key": "AAPL-put-180-2026-04-17",
                        "as_of": "2026-03-20T14:35:00Z",
                        "source_row_ref": "Positions!14",
                        "ticker": "AAPL",
                        "instrument_type": "option",
                        "strategy": "csp",
                        "option_side": "put",
                        "quantity": 1,
                        "expiration": "2026-04-17",
                        "strike": 180,
                        "cost_basis": 3.25,
                        "mark": 1.55,
                        "unrealized_pnl": 170,
                        "unrealized_pnl_pct": 52.3,
                        "dte": 28,
                        "status": "open",
                        "needs_rationale": True,
                        "latest_flags": [
                            {
                                "code": "missing_rationale",
                                "severity": "warning",
                                "headline": "Position needs rationale",
                            },
                            {
                                "code": "profit_target_hit",
                                "severity": "warning",
                                "headline": "50% premium captured",
                                "summary": "Consider closing and reopening.",
                                "recommendation": "Close and scan for a replacement CSP.",
                            }
                        ],
                    }
                ],
            },
            indent=2,
        ),
    )
    _write(
        portfolio / "reviews" / "2026-03-20.json",
        json.dumps(
            {
                "id": "2026-03-20",
                "date": "2026-03-20",
                "generated_at": "2026-03-20T14:35:30Z",
                "actions": [
                    {
                        "code": "missing_rationale",
                        "severity": "warning",
                        "headline": "1 position needs rationale",
                    }
                ],
                "position_keys": ["AAPL-put-180-2026-04-17"],
            },
            indent=2,
        ),
    )
    _write(
        portfolio / "reviews" / "2026-03-20.md",
        "# Action now\n\n- AAPL CSP has passed the 50% premium-capture threshold.\n",
    )


@pytest.mark.asyncio
async def test_list_positions_reads_latest_snapshot(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    workspace = tmp_path / "workspace"
    _seed_portfolio(workspace)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=uuid4())),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/portfolio/positions")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["position_key"] == "AAPL-put-180-2026-04-17"
    assert payload[0]["ticker"] == "AAPL"
    assert payload[0]["needs_rationale"] is True
    assert {flag["code"] for flag in payload[0]["latest_flags"]} == {
        "missing_rationale",
        "profit_target_hit",
    }
    await engine.dispose()


@pytest.mark.asyncio
async def test_get_position_includes_latest_review_summary(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    workspace = tmp_path / "workspace"
    _seed_portfolio(workspace)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=uuid4())),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/portfolio/positions/AAPL-put-180-2026-04-17")

    assert response.status_code == 200
    payload = response.json()
    assert payload["latest_review_id"] == "2026-03-20"
    assert "Action now" in payload["latest_review_summary_markdown"]
    assert payload["rationale"] is None
    await engine.dispose()


@pytest.mark.asyncio
async def test_update_rationale_writes_json_and_returns_detail(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    organization_id = uuid4()
    async with session_maker() as session:
        session.add(Organization(id=organization_id, name="Portfolio Org"))
        await session.commit()

    workspace = tmp_path / "workspace"
    _seed_portfolio(workspace)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=organization_id)),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.put(
            "/api/v1/portfolio/positions/AAPL-put-180-2026-04-17/rationale",
            json={
                "strategy": "wheel",
                "why": "AAPL at support with acceptable assignment price.",
                "entry_plan": "Take assignment if needed.",
                "profit_take_plan": "Close at 50% premium capture.",
                "risk_plan": "Avoid holding through earnings.",
                "roll_or_reopen_plan": "Reopen on next 14-21 DTE cycle.",
                "tags": ["wheel", "income"],
            },
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["rationale"]["strategy"] == "wheel"
    assert payload["rationale"]["tags"] == ["wheel", "income"]
    assert payload["needs_rationale"] is False
    assert payload["rationale_updated_at"] is not None
    assert {flag["code"] for flag in payload["latest_flags"]} == {"profit_target_hit"}

    async with session_maker() as session:
        stored = (
            await session.exec(
                select(PortfolioRationale).where(
                    PortfolioRationale.organization_id == organization_id,
                    PortfolioRationale.position_key == "AAPL-put-180-2026-04-17",
                )
            )
        )
        rationale_row = stored.one()

    written = json.loads(
        (workspace / "portfolio" / "rationales" / "AAPL-put-180-2026-04-17.json").read_text(
            encoding="utf-8"
        )
    )
    assert rationale_row.why == "AAPL at support with acceptable assignment price."
    assert written["why"] == "AAPL at support with acceptable assignment price."
    assert written["history"] == []
    await engine.dispose()


@pytest.mark.asyncio
async def test_list_positions_clears_missing_rationale_after_rationale_saved(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    organization_id = uuid4()
    async with session_maker() as session:
        session.add(Organization(id=organization_id, name="Portfolio Org"))
        await session.commit()

    workspace = tmp_path / "workspace"
    _seed_portfolio(workspace)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=organization_id)),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        save_response = await client.put(
            "/api/v1/portfolio/positions/AAPL-put-180-2026-04-17/rationale",
            json={"why": "Support level is intact."},
        )
        assert save_response.status_code == 200

        list_response = await client.get("/api/v1/portfolio/positions")

    assert list_response.status_code == 200
    payload = list_response.json()
    assert payload[0]["needs_rationale"] is False
    assert payload[0]["rationale_updated_at"] is not None
    assert {flag["code"] for flag in payload[0]["latest_flags"]} == {"profit_target_hit"}
    await engine.dispose()


@pytest.mark.asyncio
async def test_list_reviews_reads_structured_and_markdown_artifacts(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    workspace = tmp_path / "workspace"
    _seed_portfolio(workspace)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=uuid4())),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/portfolio/reviews")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["id"] == "2026-03-20"
    assert payload[0]["position_keys"] == ["AAPL-put-180-2026-04-17"]
    assert "Action now" in payload[0]["summary_markdown"]
    await engine.dispose()


@pytest.mark.asyncio
async def test_portfolio_reports_missing_workspace_mount(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", "/tmp/definitely-missing-openclaw")
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=uuid4())),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/portfolio/positions")

    assert response.status_code == 503
    assert response.json()["detail"] == "Shared OpenClaw workspace mount is unavailable."
    await engine.dispose()


@pytest.mark.asyncio
async def test_list_positions_returns_empty_when_snapshot_has_not_been_created_yet(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    workspace = tmp_path / "workspace"
    (workspace / "portfolio").mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=uuid4())),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        positions_response = await client.get("/api/v1/portfolio/positions")
        reviews_response = await client.get("/api/v1/portfolio/reviews")

    assert positions_response.status_code == 200
    assert positions_response.json() == []
    assert reviews_response.status_code == 200
    assert reviews_response.json() == []
    await engine.dispose()


@pytest.mark.asyncio
async def test_rationale_update_rejects_path_traversal(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_maker() as session:
        session.add(Organization(id=uuid4(), name="Portfolio Org"))
        await session.commit()

    workspace = tmp_path / "workspace"
    _seed_portfolio(workspace)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(
        SimpleNamespace(organization=SimpleNamespace(id=uuid4())),
        session_maker,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.put(
            "/api/v1/portfolio/positions/../oops/rationale",
            json={"why": "nope", "tags": []},
        )

    assert response.status_code == 404
    assert response.json()["detail"] == "Not Found"
    await engine.dispose()


@pytest.mark.asyncio
async def test_sync_portfolio_enqueues_gateway_cron_job(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ctx = SimpleNamespace(organization=SimpleNamespace(id="org-123"))
    app = _build_test_app(ctx)

    async def _fake_latest_gateway_for_org(session: object, organization_id: object) -> object:
        _ = session
        assert organization_id == "org-123"
        return SimpleNamespace(
            id="gateway-1",
            url="ws://gateway.example/ws",
            token="secret",
            allow_insecure_tls=False,
            disable_device_pairing=False,
        )

    async def _fake_openclaw_call(method: str, params: object = None, *, config: object) -> object:
        _ = config
        assert method == "cron.run"
        assert params == {"id": "morning-portfolio-review"}
        return {"ok": True, "enqueued": True, "runId": "run-123"}

    monkeypatch.setattr(portfolio_api, "_latest_gateway_for_org", _fake_latest_gateway_for_org)
    monkeypatch.setattr(portfolio_api, "openclaw_call", _fake_openclaw_call)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/api/v1/portfolio/sync")

    assert response.status_code == 200
    assert response.json() == {
        "ok": True,
        "enqueued": True,
        "job_id": "morning-portfolio-review",
        "run_id": "run-123",
    }


@pytest.mark.asyncio
async def test_sync_portfolio_requires_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ctx = SimpleNamespace(organization=SimpleNamespace(id="org-123"))
    app = _build_test_app(ctx)

    async def _fake_latest_gateway_for_org(session: object, organization_id: object) -> object | None:
        _ = (session, organization_id)
        return None

    monkeypatch.setattr(portfolio_api, "_latest_gateway_for_org", _fake_latest_gateway_for_org)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/api/v1/portfolio/sync")

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "An OpenClaw gateway is required before the portfolio can sync."
    )


@pytest.mark.asyncio
async def test_sync_portfolio_surfaces_structured_gateway_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ctx = SimpleNamespace(organization=SimpleNamespace(id="org-123"))
    app = _build_test_app(ctx)

    async def _fake_latest_gateway_for_org(session: object, organization_id: object) -> object:
        _ = session
        assert organization_id == "org-123"
        return SimpleNamespace(
            id="gateway-1",
            url="ws://gateway.example/ws",
            token="secret",
            allow_insecure_tls=False,
            disable_device_pairing=False,
        )

    async def _fake_openclaw_call(method: str, params: object = None, *, config: object) -> object:
        _ = config
        assert method == "cron.run"
        assert params == {"id": "morning-portfolio-review"}
        return {
            "ok": False,
            "enqueued": False,
            "error": "Google Sheets command failed due to missing keyring password.",
        }

    monkeypatch.setattr(portfolio_api, "_latest_gateway_for_org", _fake_latest_gateway_for_org)
    monkeypatch.setattr(portfolio_api, "openclaw_call", _fake_openclaw_call)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/api/v1/portfolio/sync")

    assert response.status_code == 502
    assert response.json()["detail"] == (
        "Portfolio sync could not be started: "
        "Google Sheets command failed due to missing keyring password."
    )
