"""Admin-only transcript browsing endpoints for the shared OpenClaw workspace."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response
from sqlmodel import col

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.models.gateways import Gateway
from app.schemas.transcriptions import (
    TranscriptionDetailRead,
    TranscriptionEntryRead,
    TranscriptionSyncRead,
    TranscriptionSpeakerRenameRequest,
)
from app.services.openclaw.error_messages import normalize_gateway_error_message
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call
from app.services.transcriptions import SharedTranscriptionsService

if TYPE_CHECKING:
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)
MANUAL_TRANSCRIPTION_SYNC_NAME = "manual-transcriptions-catchup"
MANUAL_TRANSCRIPTION_SYNC_TIMEOUT_SECONDS = 7200
MANUAL_TRANSCRIPTION_MAX_FILES_PER_RUN = 1
MANUAL_TRANSCRIPTION_MAX_CHUNKS_PER_RUN = 999
MANUAL_TRANSCRIPTION_CHUNK_THRESHOLD_SECONDS = 900
TRANSCRIPTION_JOB_TERMS = (
    "transcription",
    "transcriptions",
    "transcribe",
    "transcript",
    "whisper",
    "whisperx",
    "process_wav",
)


async def _latest_gateway_for_org(
    session: AsyncSession,
    organization_id: UUID,
) -> Gateway | None:
    gateways = await (
        Gateway.objects.filter_by(organization_id=organization_id)
        .order_by(col(Gateway.created_at).desc())
        .all(session)
    )
    return gateways[0] if gateways else None


def _cron_jobs_from_payload(payload: object) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        return []

    for key in ("jobs", "items", "data", "crons"):
        value = payload.get(key)
        if isinstance(value, list):
            return [item for item in value if isinstance(item, dict)]

    return []


def _string_value(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def _job_identifier(job: dict[str, Any]) -> str:
    for key in ("id", "jobId", "job_id", "name", "key"):
        value = _string_value(job.get(key))
        if value:
            return value
    return ""


def _job_score(job: dict[str, Any]) -> int:
    haystack_parts: list[str] = []
    for key in ("id", "jobId", "job_id", "name", "label", "title", "description", "command", "schedule"):
        value = job.get(key)
        if isinstance(value, str):
            haystack_parts.append(value)
    args = job.get("args")
    if isinstance(args, list):
        haystack_parts.extend(str(item) for item in args)

    haystack = " ".join(haystack_parts).lower()
    if not haystack:
        return 0

    score = 0
    for term in TRANSCRIPTION_JOB_TERMS:
        if term in haystack:
            score += 10

    identifier = _job_identifier(job).lower()
    if "transcriptions" in identifier:
        score += 8
    if "transcription" in identifier:
        score += 6
    if "transcribe" in identifier:
        score += 4

    return score


def _find_transcriptions_job_id(payload: object) -> str | None:
    jobs = _cron_jobs_from_payload(payload)
    if not jobs:
        return None

    ranked = sorted(
        ((job, _job_score(job)) for job in jobs),
        key=lambda item: (item[1], _job_identifier(item[0])),
        reverse=True,
    )
    best_job, best_score = ranked[0]
    if best_score <= 0:
        return None

    return _job_identifier(best_job) or None


def _manual_transcription_sync_payload() -> dict[str, Any]:
    return {
        "name": f"{MANUAL_TRANSCRIPTION_SYNC_NAME}-{int(datetime.now(tz=UTC).timestamp())}",
        "enabled": True,
        "schedule": {
            "kind": "at",
            "at": datetime.now(tz=UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        },
        "sessionTarget": "isolated",
        "wakeMode": "now",
        "delivery": {
            "mode": "none",
        },
        "payload": {
            "kind": "agentTurn",
            "thinking": "low",
            "timeoutSeconds": MANUAL_TRANSCRIPTION_SYNC_TIMEOUT_SECONDS,
            "message": (
                "Run exec with workdir /home/node/.openclaw/workspace and command "
                "./process_transcriptions.sh. "
                f"Set MAX_FILES_PER_RUN={MANUAL_TRANSCRIPTION_MAX_FILES_PER_RUN}, "
                f"MAX_CHUNKS_PER_RUN={MANUAL_TRANSCRIPTION_MAX_CHUNKS_PER_RUN}, and "
                f"CHUNK_THRESHOLD_SECONDS={MANUAL_TRANSCRIPTION_CHUNK_THRESHOLD_SECONDS} "
                "in the command environment. If the script outputs [NO_WORK], respond exactly "
                "NO_REPLY. Otherwise send a concise summary of what file was advanced and whether "
                "more backlog remains."
            ),
        },
    }


async def _enqueue_transcription_sync(gateway: Gateway) -> TranscriptionSyncRead:
    config = gateway_client_config(gateway)

    try:
        jobs_payload = await openclaw_call("cron.list", None, config=config)
    except OpenClawGatewayError as exc:
        detail = normalize_gateway_error_message(str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Transcriptions could not inspect gateway cron jobs: {detail}",
        ) from exc

    if not _find_transcriptions_job_id(jobs_payload):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="A transcription cron job was not found on the gateway.",
        )

    try:
        manual_job_payload = await openclaw_call(
            "cron.add",
            _manual_transcription_sync_payload(),
            config=config,
        )
    except OpenClawGatewayError as exc:
        detail = normalize_gateway_error_message(str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Transcriptions could not create a catch-up run: {detail}",
        ) from exc

    if not isinstance(manual_job_payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcriptions returned an invalid gateway response.",
        )

    manual_job_id = _job_identifier(manual_job_payload)
    if not manual_job_id:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcriptions returned an invalid catch-up job identifier.",
        )

    errors: list[str] = []
    payload: object | None = None
    for params in ({"id": manual_job_id}, {"jobId": manual_job_id}):
        try:
            payload = await openclaw_call("cron.run", params, config=config)
            break
        except OpenClawGatewayError as exc:
            errors.append(str(exc))

    if payload is None:
        detail = normalize_gateway_error_message(errors[-1] if errors else "")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Transcriptions could not start the catch-up run: {detail}",
        )

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Transcriptions returned an invalid gateway response.",
        )

    run_id = payload.get("runId")
    return TranscriptionSyncRead(
        ok=bool(payload.get("ok", True)),
        enqueued=bool(payload.get("enqueued", payload.get("ok", True))),
        job_id=manual_job_id,
        run_id=str(run_id).strip() if isinstance(run_id, str) and str(run_id).strip() else None,
    )


@router.get("", response_model=list[TranscriptionEntryRead])
async def list_transcriptions(
    _ctx=ORG_ADMIN_DEP,
    _session=SESSION_DEP,
) -> list[TranscriptionEntryRead]:
    """List processed transcript entries from the shared workspace."""
    return SharedTranscriptionsService().list_entries()


@router.get("/{entry_id}", response_model=TranscriptionDetailRead)
async def get_transcription(
    entry_id: str,
    _ctx=ORG_ADMIN_DEP,
    _session=SESSION_DEP,
) -> TranscriptionDetailRead:
    """Get one processed transcript entry and its key artifact contents."""
    return SharedTranscriptionsService().get_entry(entry_id)


@router.get("/{entry_id}/audio", response_class=FileResponse)
async def get_transcription_audio(
    entry_id: str,
    _ctx=ORG_ADMIN_DEP,
    _session=SESSION_DEP,
) -> FileResponse:
    """Get the source audio file for one transcription entry."""
    return SharedTranscriptionsService().get_source_audio_response(entry_id)


@router.get("/{entry_id}/export.docx")
async def export_transcription_docx(
    entry_id: str,
    _ctx=ORG_ADMIN_DEP,
    _session=SESSION_DEP,
) -> Response:
    """Export one diarized transcription entry as a DOCX document."""
    return SharedTranscriptionsService().export_diarized_transcript_docx_response(entry_id)


@router.post("/sync", response_model=TranscriptionSyncRead)
async def sync_transcriptions_now(
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> TranscriptionSyncRead:
    """Enqueue the configured transcription cron job immediately."""
    gateway = await _latest_gateway_for_org(session, ctx.organization.id)
    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="An OpenClaw gateway is required before transcriptions can start.",
        )
    return await _enqueue_transcription_sync(gateway)


@router.post("/{entry_id}/speakers/rename", response_model=TranscriptionDetailRead)
async def rename_transcription_speaker(
    entry_id: str,
    payload: TranscriptionSpeakerRenameRequest,
    _ctx=ORG_ADMIN_DEP,
    _session=SESSION_DEP,
) -> TranscriptionDetailRead:
    """Enroll a diarized speaker label under a new name and refresh transcript artifacts."""
    return SharedTranscriptionsService().rename_speaker(entry_id, payload)
