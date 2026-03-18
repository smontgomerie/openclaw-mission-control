# ruff: noqa: INP001, S101
"""API coverage for board filesystem memory endpoints."""

from __future__ import annotations

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.boards import router as boards_router
from app.api.deps import get_board_for_actor_read
from app.db.session import get_session
from app.services.openclaw import filesystem_memory as filesystem_memory_service


def _build_test_app(board: object) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(boards_router)
    app.include_router(api_v1)

    async def _override_board_for_actor_read() -> object:
        return board

    async def _override_get_session():
        yield object()

    app.dependency_overrides[get_board_for_actor_read] = _override_board_for_actor_read
    app.dependency_overrides[get_session] = _override_get_session
    return app


@pytest.mark.asyncio
async def test_get_board_filesystem_memory_overview_returns_service_payload(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = SimpleNamespace(id=uuid4(), name="Roadmap")
    app = _build_test_app(board)

    async def _fake_get_overview(self, target_board: object):
        assert target_board is board
        return {
            "lead_agent_id": str(uuid4()),
            "lead_agent_name": "Henry",
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
        filesystem_memory_service.BoardFilesystemMemoryService,
        "get_overview",
        _fake_get_overview,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(f"/api/v1/boards/{board.id}/filesystem-memory")

    assert response.status_code == 200
    payload = response.json()
    assert payload["lead_agent_name"] == "Henry"
    assert payload["long_term_memory"]["path"] == "MEMORY.md"
    assert payload["daily_files"][0]["date"] == "2026-03-16"


@pytest.mark.asyncio
async def test_get_board_filesystem_memory_file_forwards_path(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    board = SimpleNamespace(id=uuid4(), name="Roadmap")
    app = _build_test_app(board)
    seen: dict[str, object] = {}

    async def _fake_get_file(self, *, board: object, path: str):
        seen["board"] = board
        seen["path"] = path
        return {
            "path": path,
            "kind": "daily",
            "label": "2026-03-16",
            "date": "2026-03-16",
            "content": "## Notes",
        }

    monkeypatch.setattr(
        filesystem_memory_service.BoardFilesystemMemoryService,
        "get_file",
        _fake_get_file,
    )

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(
            f"/api/v1/boards/{board.id}/filesystem-memory/file",
            params={"path": "memory/2026-03-16.md"},
        )

    assert response.status_code == 200
    assert seen == {"board": board, "path": "memory/2026-03-16.md"}
    assert response.json()["content"] == "## Notes"
