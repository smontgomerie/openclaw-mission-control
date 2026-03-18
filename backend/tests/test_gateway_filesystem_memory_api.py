# ruff: noqa: INP001, S101
"""API coverage for gateway filesystem memory endpoints."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.gateways import router as gateways_router
from app.api.deps import require_org_admin
from app.db.session import get_session
from app.services.openclaw import filesystem_memory as filesystem_memory_service


def _build_test_app(ctx: object) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(gateways_router)
    app.include_router(api_v1)

    async def _override_require_org_admin() -> object:
        return ctx

    async def _override_get_session():
        yield object()

    app.dependency_overrides[require_org_admin] = _override_require_org_admin
    app.dependency_overrides[get_session] = _override_get_session
    return app


@pytest.mark.asyncio
async def test_get_gateway_filesystem_memory_overview_returns_service_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    gateway = SimpleNamespace(id=uuid4(), name="Core Gateway")
    ctx = SimpleNamespace(organization=SimpleNamespace(id=uuid4()))
    app = _build_test_app(ctx)

    async def _fake_require_gateway(self, *, gateway_id, organization_id):
        assert gateway_id == gateway.id
        assert organization_id == ctx.organization.id
        return gateway

    async def _fake_get_overview(self, target_gateway: object):
        assert target_gateway is gateway
        return {
            "gateway_id": str(gateway.id),
            "gateway_name": "Core Gateway",
            "main_agent_id": "mc-gateway-main",
            "main_agent_name": "Core Gateway main",
            "long_term_memory": {
                "path": "MEMORY.md",
                "kind": "long_term",
                "label": "Long-term memory",
                "content": "# Memory",
            },
            "daily_files": [
                {
                    "path": "memory/2026-03-16.md",
                    "kind": "daily",
                    "label": "2026-03-16",
                    "date": "2026-03-16",
                }
            ],
            "latest_daily_path": "memory/2026-03-16.md",
        }

    monkeypatch.setattr(
        "app.services.openclaw.admin_service.GatewayAdminLifecycleService.require_gateway",
        _fake_require_gateway,
    )
    monkeypatch.setattr(
        filesystem_memory_service.GatewayFilesystemMemoryService,
        "get_overview",
        _fake_get_overview,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(f"/api/v1/gateways/{gateway.id}/filesystem-memory")

    assert response.status_code == 200
    payload = response.json()
    assert payload["gateway_name"] == "Core Gateway"
    assert payload["main_agent_name"] == "Core Gateway main"
    assert payload["long_term_memory"]["path"] == "MEMORY.md"


@pytest.mark.asyncio
async def test_get_gateway_filesystem_memory_file_forwards_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    gateway = SimpleNamespace(id=uuid4(), name="Core Gateway")
    ctx = SimpleNamespace(organization=SimpleNamespace(id=uuid4()))
    app = _build_test_app(ctx)
    seen: dict[str, object] = {}

    async def _fake_require_gateway(self, *, gateway_id, organization_id):
        assert gateway_id == gateway.id
        assert organization_id == ctx.organization.id
        return gateway

    async def _fake_get_file(self, *, gateway: object, path: str):
        seen["gateway"] = gateway
        seen["path"] = path
        return {
            "path": path,
            "kind": "daily",
            "label": "2026-03-16",
            "date": "2026-03-16",
            "content": "## Notes",
        }

    monkeypatch.setattr(
        "app.services.openclaw.admin_service.GatewayAdminLifecycleService.require_gateway",
        _fake_require_gateway,
    )
    monkeypatch.setattr(
        filesystem_memory_service.GatewayFilesystemMemoryService,
        "get_file",
        _fake_get_file,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(
            f"/api/v1/gateways/{gateway.id}/filesystem-memory/file",
            params={"path": "memory/2026-03-16.md"},
        )

    assert response.status_code == 200
    assert seen == {"gateway": gateway, "path": "memory/2026-03-16.md"}
    assert response.json()["content"] == "## Notes"
