# ruff: noqa: INP001, S101
"""API coverage for shared-workspace transcription endpoints."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient

from app.api.deps import require_org_admin
from app.api.transcriptions import router as transcriptions_router
from app.core.config import settings
from app.db.session import get_session


def _build_test_app(ctx: object) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(transcriptions_router)
    app.include_router(api_v1)

    async def _override_require_org_admin() -> object:
        return ctx

    async def _override_get_session():
        yield object()

    app.dependency_overrides[require_org_admin] = _override_require_org_admin
    app.dependency_overrides[get_session] = _override_get_session
    return app


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


@pytest.mark.asyncio
async def test_list_transcriptions_reads_processed_entries(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    _write(root / "1773166957.m4a", "audio")
    _write(processed / "1773166957" / "analysis.md", "# Summary")
    _write(processed / "1773166957" / "transcript.txt", "hello world")
    _write(processed / "1773166957" / "transcript.json", '{"text":"hello world"}')
    _write(processed / "1773166957" / ".done", "")

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["id"] == "1773166957"
    assert payload[0]["is_done"] is True
    assert payload[0]["has_analysis"] is True
    assert payload[0]["has_transcript_text"] is True
    assert payload[0]["has_transcript_json"] is True
    assert payload[0]["source_files"][0]["name"] == "1773166957.m4a"


@pytest.mark.asyncio
async def test_get_transcription_returns_mixed_artifacts(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    _write(root / "Neil in Boston.m4a", "audio")
    _write(processed / "Neil in Boston" / "Neil in Boston.txt", "meeting transcript")
    _write(processed / "Neil in Boston" / "analysis.md", "## Actions")
    _write(processed / "Neil in Boston" / "Neil in Boston.json", '{"segments":[]}')

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions/Neil%20in%20Boston")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "Neil in Boston"
    assert payload["analysis_content"] == "## Actions"
    assert payload["transcript_text_content"] == "meeting transcript"
    assert '"segments": []' in payload["transcript_json_content"]


@pytest.mark.asyncio
async def test_list_transcriptions_reports_missing_workspace_mount(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", "/tmp/definitely-missing-openclaw")
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions")

    assert response.status_code == 503
    assert response.json()["detail"] == "Shared OpenClaw workspace mount is unavailable."
