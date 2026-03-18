"""Admin-only transcript browsing endpoints for the shared OpenClaw workspace."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.schemas.transcriptions import TranscriptionDetailRead, TranscriptionEntryRead
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
