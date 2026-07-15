"""Admin APIs for organization-scoped speaker learning."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, status

from app.api.deps import require_org_admin, require_user_auth
from app.core.auth import AuthContext
from app.db.session import get_session
from app.models.speaker_profiles import SpeakerProfile
from app.schemas.common import OkResponse
from app.schemas.speaker_profiles import (
    SpeakerDirectoryRead,
    SpeakerProfileMergeRequest,
    SpeakerProfileRead,
    SpeakerProfileRenameRequest,
    SpeakerSampleConfirmRequest,
    SpeakerVoiceSampleRead,
)
from app.services.organizations import OrganizationContext
from app.services.speaker_learning import SpeakerLearningService
from app.services.transcriptions import SharedTranscriptionsService

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/transcriptions/speakers", tags=["transcriptions"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)
AUTH_DEP = Depends(require_user_auth)


def _service(
    session: AsyncSession,
    ctx: OrganizationContext,
) -> SpeakerLearningService:
    registry_base = SharedTranscriptionsService()._speaker_registry_root()
    return SpeakerLearningService(session, ctx.organization.id, registry_base)


def _profile_read(
    profile: SpeakerProfile,
    pending_counts: dict[UUID, int] | None = None,
) -> SpeakerProfileRead:
    return SpeakerProfileRead(
        **profile.model_dump(),
        pending_sample_count=(pending_counts or {}).get(profile.id, 0),
    )


@router.get("", response_model=SpeakerDirectoryRead)
async def get_speaker_directory(
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> SpeakerDirectoryRead:
    service = _service(session, ctx)
    await service.reconcile_observation_files(SharedTranscriptionsService()._transcriptions_root())
    profiles = await service.profiles()
    pending = await service.samples(status_value="pending")
    profile_names = {profile.id: profile.display_name for profile in profiles}
    pending_counts: dict[UUID, int] = {}
    for sample in pending:
        if sample.candidate_profile_id:
            pending_counts[sample.candidate_profile_id] = (
                pending_counts.get(sample.candidate_profile_id, 0) + 1
            )
    return SpeakerDirectoryRead(
        profiles=[_profile_read(profile, pending_counts) for profile in profiles],
        pending_samples=[
            SpeakerVoiceSampleRead(
                **sample.model_dump(),
                candidate_name=(
                    profile_names.get(sample.candidate_profile_id)
                    if sample.candidate_profile_id is not None
                    else None
                ),
            )
            for sample in pending
        ],
    )


@router.post("/import-legacy", response_model=SpeakerDirectoryRead)
async def import_legacy_speakers(
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> SpeakerDirectoryRead:
    await _service(session, ctx).import_legacy_registry()
    return await get_speaker_directory(session=session, ctx=ctx)


@router.post("/samples/{sample_id}/confirm", response_model=SpeakerProfileRead)
async def confirm_speaker_sample(
    sample_id: UUID,
    payload: SpeakerSampleConfirmRequest,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    auth: AuthContext = AUTH_DEP,
) -> SpeakerProfileRead:
    profile = await _service(session, ctx).confirm_sample(
        sample_id,
        profile_id=payload.profile_id,
        new_name=payload.new_name,
        reviewed_by_user_id=auth.user.id if auth.user else None,
    )
    return _profile_read(profile)


@router.post("/samples/{sample_id}/reject", response_model=OkResponse)
async def reject_speaker_sample(
    sample_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    auth: AuthContext = AUTH_DEP,
) -> OkResponse:
    await _service(session, ctx).reject_sample(
        sample_id,
        reviewed_by_user_id=auth.user.id if auth.user else None,
    )
    return OkResponse()


@router.patch("/{profile_id}", response_model=SpeakerProfileRead)
async def rename_speaker_profile(
    profile_id: UUID,
    payload: SpeakerProfileRenameRequest,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> SpeakerProfileRead:
    profile = await _service(session, ctx).rename_profile(profile_id, payload.display_name)
    return _profile_read(profile)


@router.post("/{profile_id}/merge", response_model=SpeakerProfileRead)
async def merge_speaker_profiles(
    profile_id: UUID,
    payload: SpeakerProfileMergeRequest,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> SpeakerProfileRead:
    profile = await _service(session, ctx).merge_profiles(
        profile_id,
        payload.target_profile_id,
    )
    return _profile_read(profile)


@router.delete("/{profile_id}", response_model=OkResponse, status_code=status.HTTP_200_OK)
async def delete_speaker_profile(
    profile_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> OkResponse:
    await _service(session, ctx).delete_profile(profile_id)
    return OkResponse()
