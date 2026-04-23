# ruff: noqa: INP001, S101
"""API coverage for shared-workspace transcription endpoints."""

from __future__ import annotations

import json
import subprocess
import zipfile
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient

from app.api import transcriptions as transcriptions_api
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
async def test_list_transcriptions_sorted_newest_first_by_entry_id_timestamp(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    for entry_id in ("1700000000", "1800000000"):
        _write(root / f"{entry_id}.m4a", "audio")
        _write(processed / entry_id / "transcript.txt", "hello")
        _write(processed / entry_id / ".done", "")

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions")

    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload] == ["1800000000", "1700000000"]


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
    assert payload[0]["title"] != "1773166957"
    assert "2026" in payload[0]["title"]
    assert payload[0]["status"] == "done"
    assert payload[0]["is_done"] is True
    assert payload[0]["has_analysis"] is True
    assert payload[0]["has_transcript_text"] is True
    assert payload[0]["has_transcript_json"] is True
    assert payload[0]["source_files"][0]["name"] == "1773166957.m4a"
    assert payload[0]["diarized_speaker_count"] is None
    assert payload[0]["diarized_speaker_preview"] == []


@pytest.mark.asyncio
async def test_list_transcriptions_includes_diarized_speaker_preview(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    transcript_json = {
        "segments": [
            {"speaker": "SPEAKER_00", "text": "Hello there", "start": 0.0, "end": 1.0},
            {"speaker": "SPEAKER_01", "text": "Hi back", "start": 1.0, "end": 2.0},
            {"speaker": "SPEAKER_02", "text": "Me too", "start": 2.0, "end": 3.0},
            {"speaker": "SPEAKER_03", "text": "Same", "start": 3.0, "end": 4.0},
            {"speaker": "SPEAKER_04", "text": "Likewise", "start": 4.0, "end": 5.0},
        ],
    }
    _write(root / "meet.m4a", "audio")
    _write(processed / "meet" / "transcript.json", json.dumps(transcript_json))
    _write(processed / "meet" / ".done", "")

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
    assert payload[0]["id"] == "meet"
    assert payload[0]["diarized_speaker_count"] == 5
    assert payload[0]["diarized_speaker_preview"] == [
        "SPEAKER_00",
        "SPEAKER_01",
        "SPEAKER_02",
        "SPEAKER_03",
    ]


@pytest.mark.asyncio
async def test_list_transcriptions_title_prefers_calendar_match_high(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    entry_id = "1999999999"
    _write(root / f"{entry_id}.m4a", "audio")
    _write(processed / entry_id / "transcript.txt", "x")
    _write(processed / entry_id / "transcript.json", "{}")
    _write(processed / entry_id / ".done", "")
    _write(
        processed / entry_id / "calendar-match.json",
        json.dumps({"confidence": "high", "title": "Board sync"}),
    )

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
    assert payload[0]["id"] == entry_id
    assert payload[0]["title"] == "Board sync"


@pytest.mark.asyncio
async def test_list_transcriptions_title_prefers_title_txt_when_calendar_low(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    entry_id = "1999999998"
    _write(root / f"{entry_id}.m4a", "audio")
    _write(processed / entry_id / "transcript.txt", "x")
    _write(processed / entry_id / "transcript.json", "{}")
    _write(processed / entry_id / ".done", "")
    _write(
        processed / entry_id / "calendar-match.json",
        json.dumps({"confidence": "low", "title": "Ignored"}),
    )
    _write(processed / entry_id / "title.txt", "Investor diligence recap\n")

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["title"] == "Investor diligence recap"


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
    _write(processed / "Neil in Boston" / "process.log", "[START] file=Neil in Boston.m4a")
    _write(processed / "Neil in Boston" / "whisperx.log", "[WHISPERX_START] chunk_file=Neil.mp3")

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
    assert payload["process_log_content"] == "[START] file=Neil in Boston.m4a"
    assert payload["whisperx_log_content"] == "[WHISPERX_START] chunk_file=Neil.mp3"
    assert payload["calendar_match_present"] is False
    assert payload["calendar_match_confidence"] is None
    assert payload["calendar_match_event_title"] is None
    assert payload["calendar_match_used_for_title"] is False


@pytest.mark.asyncio
async def test_get_transcription_includes_calendar_match_metadata(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    entry = "1999999997"
    _write(root / f"{entry}.m4a", "audio")
    _write(processed / entry / "analysis.md", "## Summary")
    _write(processed / entry / "transcript.txt", "hello")
    _write(
        processed / entry / "calendar-match.json",
        json.dumps({"confidence": "high", "title": "Q1 planning"}),
    )

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get(f"/api/v1/transcriptions/{entry}")

    assert response.status_code == 200
    payload = response.json()
    assert payload["calendar_match_present"] is True
    assert payload["calendar_match_confidence"] == "high"
    assert payload["calendar_match_event_title"] == "Q1 planning"
    assert payload["calendar_match_used_for_title"] is True


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
async def test_list_transcriptions_reports_chunked_progress_for_partial_entries(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    _write(root / "1774046932.m4a", "audio")
    _write(processed / "1774046932" / "transcript.txt", "partial transcript")
    _write(processed / "1774046932" / "transcript.json", '{"segments":[]}')
    _write(processed / "1774046932" / ".chunk_state", "360\n2\n")
    _write(
        processed / "1774046932" / "process.log",
        "[2026-03-26 05:08:43] [DURATION] working_file=/tmp/1774046932.m4a duration=1839s\n"
        "[PARTIAL] 1774046932 next_start=360s\n",
    )

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions")

    assert response.status_code == 200
    payload = response.json()
    assert payload[0]["id"] == "1774046932"
    assert payload[0]["status"] == "partial"
    assert payload[0]["progress_seconds"] == 360
    assert payload[0]["total_duration_seconds"] == 1839


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
async def test_export_transcription_docx_returns_diarized_document(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    _write(root / "docx-check.m4a", "audio")
    _write(
        processed / "docx-check" / "transcript.json",
        (
            '{"segments":['
            '{"speaker":"SPEAKER_00","speaker_name":"Scott","start":1.2,"end":4.9,"text":"First line"},'
            '{"speaker":"SPEAKER_01","start":5.1,"end":6.5,"text":"Second line"}'
            "]}"
        ),
    )

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions/docx-check/export.docx")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert "docx-check-diarized-transcript.docx" in response.headers["content-disposition"]

    archive = zipfile.ZipFile(BytesIO(response.content))
    document_xml = archive.read("word/document.xml").decode("utf-8")
    assert "docx-check diarized transcript" in document_xml
    assert "Scott (0:01 - 0:04)" in document_xml
    assert "First line" in document_xml
    assert "SPEAKER_01 (0:05 - 0:06)" in document_xml
    assert "Second line" in document_xml


@pytest.mark.asyncio
async def test_export_transcription_docx_rejects_non_diarized_transcript(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed"
    _write(root / "plain-only.m4a", "audio")
    _write(
        processed / "plain-only" / "transcript.json",
        '{"segments":[{"start":0,"end":2,"text":"No speaker labels here"}]}',
    )

    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.get("/api/v1/transcriptions/plain-only/export.docx")

    assert response.status_code == 409
    assert response.json()["detail"] == "Only diarized transcripts can be exported to DOCX."


@pytest.mark.asyncio
async def test_sync_transcriptions_enqueues_gateway_cron_job(
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

    added_job_payload: dict[str, object] | None = None

    async def _fake_openclaw_call(method: str, params: object = None, *, config: object) -> object:
        nonlocal added_job_payload
        _ = config
        if method == "cron.list":
            return {
                "jobs": [
                    {"id": "nightly-maintenance", "name": "Nightly maintenance"},
                    {
                        "id": "shared-transcriptions",
                        "name": "Shared workspace transcriptions",
                        "command": "./transcribe.sh",
                    },
                ],
            }
        if method == "cron.add":
            assert isinstance(params, dict)
            added_job_payload = params
            assert params["sessionTarget"] == "isolated"
            assert params["schedule"]["kind"] == "at"
            assert params["delivery"] == {"mode": "none"}
            payload = params["payload"]
            assert payload["kind"] == "agentTurn"
            assert payload["timeoutSeconds"] == 7200
            assert "MAX_FILES_PER_RUN=1" in payload["message"]
            assert "MAX_CHUNKS_PER_RUN=999" in payload["message"]
            return {"id": "manual-transcriptions-catchup-123"}
        assert method == "cron.run"
        assert params == {"id": "manual-transcriptions-catchup-123"}
        return {"ok": True, "enqueued": True, "runId": "run-456"}

    monkeypatch.setattr(transcriptions_api, "_latest_gateway_for_org", _fake_latest_gateway_for_org)
    monkeypatch.setattr(transcriptions_api, "openclaw_call", _fake_openclaw_call)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/api/v1/transcriptions/sync")

    assert response.status_code == 200
    assert added_job_payload is not None
    assert response.json() == {
        "ok": True,
        "enqueued": True,
        "job_id": "manual-transcriptions-catchup-123",
        "run_id": "run-456",
    }


@pytest.mark.asyncio
async def test_reprocess_transcriptions_metadata_enqueues_gateway_cron_job(
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

    added_job_payload: dict[str, object] | None = None

    async def _fake_openclaw_call(method: str, params: object = None, *, config: object) -> object:
        nonlocal added_job_payload
        _ = config
        if method == "cron.list":
            return {
                "jobs": [
                    {"id": "nightly-maintenance", "name": "Nightly maintenance"},
                    {
                        "id": "shared-transcriptions",
                        "name": "Shared workspace transcriptions",
                        "command": "./transcribe.sh",
                    },
                ],
            }
        if method == "cron.add":
            assert isinstance(params, dict)
            added_job_payload = params
            assert params["sessionTarget"] == "isolated"
            assert params["schedule"]["kind"] == "at"
            assert params["delivery"] == {"mode": "none"}
            payload = params["payload"]
            assert payload["kind"] == "agentTurn"
            assert payload["timeoutSeconds"] == 7200
            assert "reprocess_metadata_all.sh" in payload["message"]
            return {"id": "manual-transcriptions-reprocess-metadata-999"}
        assert method == "cron.run"
        assert params == {"id": "manual-transcriptions-reprocess-metadata-999"}
        return {"ok": True, "enqueued": True, "runId": "run-789"}

    monkeypatch.setattr(transcriptions_api, "_latest_gateway_for_org", _fake_latest_gateway_for_org)
    monkeypatch.setattr(transcriptions_api, "openclaw_call", _fake_openclaw_call)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/api/v1/transcriptions/reprocess-metadata")

    assert response.status_code == 200
    assert added_job_payload is not None
    assert response.json() == {
        "ok": True,
        "enqueued": True,
        "job_id": "manual-transcriptions-reprocess-metadata-999",
        "run_id": "run-789",
    }


@pytest.mark.asyncio
async def test_sync_transcriptions_requires_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ctx = SimpleNamespace(organization=SimpleNamespace(id="org-123"))
    app = _build_test_app(ctx)

    async def _fake_latest_gateway_for_org(session: object, organization_id: object) -> object | None:
        _ = (session, organization_id)
        return None

    monkeypatch.setattr(transcriptions_api, "_latest_gateway_for_org", _fake_latest_gateway_for_org)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/api/v1/transcriptions/sync")

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "An OpenClaw gateway is required before transcriptions can start."
    )


@pytest.mark.asyncio
async def test_reprocess_transcriptions_metadata_requires_gateway(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    ctx = SimpleNamespace(organization=SimpleNamespace(id="org-123"))
    app = _build_test_app(ctx)

    async def _fake_latest_gateway_for_org(session: object, organization_id: object) -> object | None:
        _ = (session, organization_id)
        return None

    monkeypatch.setattr(transcriptions_api, "_latest_gateway_for_org", _fake_latest_gateway_for_org)

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post("/api/v1/transcriptions/reprocess-metadata")

    assert response.status_code == 422
    assert response.json()["detail"] == (
        "An OpenClaw gateway is required before transcriptions can start."
    )


@pytest.mark.asyncio
async def test_rename_transcription_speaker_enrolls_and_reannotates(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    registry_root = tmp_path / "speaker-registry"
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
    monkeypatch.setattr(settings, "openclaw_transcriptions_speaker_registry_root", str(registry_root))
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
    assert calls[0][calls[0].index("--registry-dir") + 1] == str(registry_root)
    assert calls[1][calls[1].index("--registry-dir") + 1] == str(registry_root)
    assert registry_root.exists()


@pytest.mark.asyncio
async def test_rename_transcription_speaker_prefers_workspace_venv_python(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed" / "meeting-venv"
    venv_python = root / ".venv-whisperx" / "bin" / "python"
    _write(root / "speaker_identity.py", "#!/usr/bin/env python3\n")
    _write(root / "meeting-venv.m4a", "audio")
    _write(venv_python, "#!/usr/bin/env python3\n")
    _write(processed / "meeting-venv.json", '{"segments":[{"speaker":"SPEAKER_00","text":"hello"}]}')
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
    monkeypatch.setattr(settings, "openclaw_transcriptions_python_bin", "")
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/transcriptions/meeting-venv/speakers/rename",
            json={"speaker_label": "SPEAKER_00", "new_name": "Scott"},
        )

    assert response.status_code == 200
    assert calls[0][0] == str(venv_python)
    assert calls[1][0] == str(venv_python)


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


@pytest.mark.asyncio
async def test_rename_transcription_speaker_skips_warning_prefixed_stderr(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed" / "meeting-warn"
    _write(root / "speaker_identity.py", "#!/usr/bin/env python3\n")
    _write(root / "meeting-warn.m4a", "audio")
    _write(
        processed / "meeting-warn.json",
        '{"segments":[{"speaker":"SPEAKER_00","text":"hello"}]}',
    )
    _write(processed / "transcript.json", '{"segments":[{"speaker":"SPEAKER_00","text":"hello"}]}')

    warning_and_error = "\n".join(
        [
            "/app/.venv/lib/python3.12/site-packages/torchaudio/_backend/utils.py:213: UserWarning: warning",
            "  warnings.warn(message, stacklevel=2)",
            "RuntimeError: Model checkpoint is missing",
        ]
    )

    def _fake_run(*args, **kwargs):
        command = list(args[0])
        raise subprocess.CalledProcessError(
            1,
            command,
            output="",
            stderr=warning_and_error,
        )

    monkeypatch.setattr("app.services.transcriptions.subprocess.run", _fake_run)
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    app = _build_test_app(SimpleNamespace())

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://testserver",
    ) as client:
        response = await client.post(
            "/api/v1/transcriptions/meeting-warn/speakers/rename",
            json={"speaker_label": "SPEAKER_00", "new_name": "Scott"},
        )

    assert response.status_code == 409
    assert response.json()["detail"] == "RuntimeError: Model checkpoint is missing"
