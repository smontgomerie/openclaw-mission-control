# ruff: noqa: INP001, S101
"""API coverage for shared-workspace transcription endpoints."""

from __future__ import annotations

import subprocess
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
    assert payload[0]["status"] == "done"
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
    assert payload["status"] == "partial"
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


@pytest.mark.asyncio
async def test_list_transcriptions_includes_pending_source_files(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    _write(root / "2001.m4a", "audio")
    _write(root / "2002.wav", "audio")
    _write(processed / "2001" / "transcript.txt", "done enough")

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions")

    assert response.status_code == 200
    payload = response.json()
    by_id = {entry["id"]: entry for entry in payload}
    assert by_id["2001"]["status"] == "partial"
    assert by_id["2001"]["has_transcript_text"] is True
    assert by_id["2002"]["status"] == "pending"
    assert by_id["2002"]["artifact_files"] == []
    assert by_id["2002"]["source_files"][0]["name"] == "2002.wav"


@pytest.mark.asyncio
async def test_get_transcription_returns_pending_source_only_entry(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    (root / "processed").mkdir(parents=True, exist_ok=True)
    _write(root / "waiting-room.m4a", "audio")

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions/waiting-room")

    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == "waiting-room"
    assert payload["status"] == "pending"
    assert payload["source_files"][0]["name"] == "waiting-room.m4a"
    assert payload["artifact_files"] == []
    assert payload["analysis_content"] is None
    assert payload["transcript_text_content"] is None
    assert payload["transcript_json_content"] is None


@pytest.mark.asyncio
async def test_get_transcription_audio_returns_source_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    (root / "processed").mkdir(parents=True, exist_ok=True)
    _write(root / "audio-check.m4a", "fake-audio")

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions/audio-check/audio")

    assert response.status_code == 200
    assert response.content == b"fake-audio"
    assert response.headers["content-type"].startswith("audio/")


@pytest.mark.asyncio
async def test_rename_transcription_speaker_enrolls_and_reannotates(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed" / "meeting-1"
    _write(root / "speaker_identity.py", "#!/usr/bin/env python3\n")
    _write(root / "meeting-1.m4a", "audio")
    _write(processed / "meeting-1.json", '{"segments":[{"speaker":"SPEAKER_00","text":"hello"}]}')
    _write(processed / "transcript.json", '{"segments":[{"speaker":"SPEAKER_00","text":"hello"}]}')
    _write(processed / "transcript.txt", "[SPEAKER_00] hello")

    calls: list[list[str]] = []

    def _fake_run(*args, **kwargs):
        command = list(args[0])
        calls.append(command)
        if "annotate" in command:
            output_json = Path(command[command.index("--output-json") + 1])
            output_text = Path(command[command.index("--output-text") + 1])
            output_json.write_text(
                '{"segments":[{"speaker":"SPEAKER_00","speaker_name":"Scott","text":"hello"}]}',
                encoding="utf-8",
            )
            output_text.write_text("[Scott] hello", encoding="utf-8")
        return subprocess.CompletedProcess(command, 0, stdout="ok", stderr="")

    monkeypatch.setattr("app.services.transcriptions.subprocess.run", _fake_run)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/transcriptions/meeting-1/speakers/rename",
            json={"speaker_label": "SPEAKER_00", "new_name": "Scott"},
        )

    assert response.status_code == 200
    payload = response.json()
    assert payload["transcript_text_content"] == "[Scott] hello"
    assert '"speaker_name": "Scott"' in payload["transcript_json_content"]
    assert len(calls) == 2
    assert "enroll-from-transcript" in calls[0]
    assert "annotate" in calls[1]


@pytest.mark.asyncio
async def test_rename_transcription_speaker_requires_raw_json(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed" / "meeting-2"
    _write(root / "speaker_identity.py", "#!/usr/bin/env python3\n")
    _write(root / "meeting-2.m4a", "audio")
    _write(processed / "transcript.json", '{"segments":[{"speaker":"SPEAKER_00","text":"hello"}]}')

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/transcriptions/meeting-2/speakers/rename",
            json={"speaker_label": "SPEAKER_00", "new_name": "Scott"},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "Canonical raw transcript JSON is missing for this entry."
