"""Admin APIs for organization-scoped speaker learning.

Speaker profile rows are isolated by organization_id. The transcriptions
mount itself is single-tenant: mutating APIs refuse another organization's
IDs (404, no filesystem or database writes) rather than pretending files are
per-org.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.deps import require_org_admin, require_user_auth
from app.core.auth import AuthContext
from app.db.session import get_session
from app.models.speaker_profiles import SpeakerBackfillRun, SpeakerProfile
from app.schemas.common import OkResponse
from app.schemas.speaker_profiles import (
    SpeakerBackfillPreviewRead,
    SpeakerBackfillRunRead,
    SpeakerBackfillStartRequest,
    SpeakerDirectoryRead,
    SpeakerProfileMergeRequest,
    SpeakerProfileRead,
    SpeakerProfileRenameRequest,
    SpeakerSampleConfirmRequest,
    SpeakerVoiceSampleRead,
)
from app.services.organizations import OrganizationContext
from app.services.speaker_backfill import enqueue_backfill, preview_annotation_backfill
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


@router.get("/annotation-import/preview", response_model=SpeakerBackfillPreviewRead)
async def preview_speaker_annotation_import(
    _session: AsyncSession = SESSION_DEP,
    _ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> SpeakerBackfillPreviewRead:
    root = SharedTranscriptionsService()._transcriptions_root()
    return SpeakerBackfillPreviewRead.model_validate(preview_annotation_backfill(root))


@router.post(
    "/annotation-imports",
    response_model=SpeakerBackfillRunRead,
    status_code=status.HTTP_202_ACCEPTED,
)
async def start_speaker_annotation_import(
    payload: SpeakerBackfillStartRequest,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> SpeakerBackfillRunRead:
    root = SharedTranscriptionsService()._transcriptions_root()
    preview = preview_annotation_backfill(root)
    if preview["snapshot_hash"] != payload.snapshot_hash:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Transcripts changed after preview; preview the import again.",
        )
    run = SpeakerBackfillRun(
        organization_id=ctx.organization.id,
        snapshot_hash=payload.snapshot_hash,
        total_recordings=cast(int, preview["transcript_count"]),
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)
    if not enqueue_backfill(run):
        run.status = "failed"
        run.errors = [{"reason": "Unable to enqueue speaker annotation import."}]
        session.add(run)
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Unable to enqueue speaker annotation import.",
        )
    return SpeakerBackfillRunRead.model_validate(run)


@router.get("/annotation-imports/{run_id}", response_model=SpeakerBackfillRunRead)
async def get_speaker_annotation_import(
    run_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> SpeakerBackfillRunRead:
    run = (
        await SpeakerBackfillRun.objects.by_id(run_id)
        .filter_by(organization_id=ctx.organization.id)
        .first(session)
    )
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Import run not found.")
    return SpeakerBackfillRunRead.model_validate(run)


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
    learning_service = _service(session, ctx)
    profile = await learning_service.confirm_sample(
        sample_id,
        profile_id=payload.profile_id,
        new_name=payload.new_name,
        reviewed_by_user_id=auth.user.id if auth.user else None,
        excluded_segment_ids=payload.excluded_segment_ids,
    )
    sample = await learning_service.require_sample(sample_id)
    if sample.transcription_entry_id and sample.speaker_label:
        SharedTranscriptionsService().apply_confirmed_speaker_name(
            sample.transcription_entry_id,
            speaker_label=sample.speaker_label,
            display_name=profile.display_name,
            segment_evidence=sample.segment_evidence,
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
