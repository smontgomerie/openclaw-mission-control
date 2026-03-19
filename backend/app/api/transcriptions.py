"""Admin-only transcript browsing endpoints for the shared OpenClaw workspace."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.schemas.transcriptions import (
    TranscriptionDetailRead,
    TranscriptionEntryRead,
    TranscriptionSpeakerRenameRequest,
)
from app.services.transcriptions import SharedTranscriptionsService

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)


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


@router.post("/{entry_id}/speakers/rename", response_model=TranscriptionDetailRead)
async def rename_transcription_speaker(
    entry_id: str,
    payload: TranscriptionSpeakerRenameRequest,
    _ctx=ORG_ADMIN_DEP,
    _session=SESSION_DEP,
) -> TranscriptionDetailRead:
    """Enroll a diarized speaker label under a new name and refresh transcript artifacts."""
    return SharedTranscriptionsService().rename_speaker(entry_id, payload)
