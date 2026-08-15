# ruff: noqa: INP001, S101
"""HTTP coverage for mutating speaker-learning APIs, including refused orgs."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app import models as _models
from app.api.deps import require_org_admin, require_user_auth
from app.api.speaker_profiles import router as speaker_profiles_router
from app.core.auth import AuthContext
from app.core.config import settings
from app.db.session import get_session
from app.models.organizations import Organization
from app.models.speaker_profiles import SpeakerProfile, SpeakerVoiceSample
from app.models.users import User
from app.services.organizations import OrganizationContext
from app.services.speaker_learning import SpeakerLearningService

MODEL_REGISTRY = _models


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


async def _build_app(
    *,
    session_maker: async_sessionmaker[AsyncSession],
    ctx: OrganizationContext,
    user: User,
) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(speaker_profiles_router)
    app.include_router(api_v1)

    async def _override_require_org_admin() -> OrganizationContext:
        return ctx

    async def _override_require_user_auth() -> AuthContext:
        return AuthContext(actor_type="user", user=user)

    async def _override_get_session():
        async with session_maker() as session:
            yield session

    app.dependency_overrides[require_org_admin] = _override_require_org_admin
    app.dependency_overrides[require_user_auth] = _override_require_user_auth
    app.dependency_overrides[get_session] = _override_get_session
    return app


@pytest.mark.asyncio
async def test_speaker_mutating_apis_and_refused_other_org_actor(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    workspace = tmp_path / "workspace"
    root = workspace / "transcriptions"
    processed = root / "processed" / "meeting-1"
    _write(
        processed / "transcript.json",
        (
            '{"segments":[{"speaker":"SPEAKER_00","speaker_name":"Guess",'
            '"speaker_name_tentative":true,"start":0,"end":4,"text":"hello"}]}'
        ),
    )
    monkeypatch.setattr(settings, "openclaw_shared_workspace_root", str(workspace))
    monkeypatch.setattr(settings, "openclaw_transcriptions_speaker_registry_root", str(root))

    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'speakers.db'}")
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with session_maker() as session:
        owner_org = Organization(name="Owner Org")
        other_org = Organization(name="Other Org")
        owner = User(clerk_user_id="owner", email="owner@example.com", name="Owner")
        stranger = User(clerk_user_id="stranger", email="other@example.com", name="Other")
        session.add(owner_org)
        session.add(other_org)
        session.add(owner)
        session.add(stranger)
        await session.commit()
        await session.refresh(owner_org)
        await session.refresh(other_org)
        await session.refresh(owner)
        await session.refresh(stranger)

        learning = SpeakerLearningService(session, owner_org.id, root)
        sample = await learning.add_pending_observation(
            entry_id="meeting-1",
            speaker_label="SPEAKER_00",
            source_audio_path="meeting-1.m4a",
            embedding=[1.0, 0.0],
            encoder="ecapa",
            speech_duration_seconds=6.0,
            segment_count=1,
        )
        extra = await learning.find_or_create_profile("Ada")
        await session.commit()
        sample_id = sample.id
        extra_id = extra.id
        owner_org_id = owner_org.id
        other_org_id = other_org.id
        owner_user = owner
        stranger_user = stranger

    owner_ctx = OrganizationContext(
        organization=Organization(id=owner_org_id, name="Owner Org"),
        member=SimpleNamespace(  # type: ignore[arg-type]
            organization_id=owner_org_id, user_id=owner_user.id, role="admin"
        ),
    )
    other_ctx = OrganizationContext(
        organization=Organization(id=other_org_id, name="Other Org"),
        member=SimpleNamespace(  # type: ignore[arg-type]
            organization_id=other_org_id, user_id=stranger_user.id, role="admin"
        ),
    )

    owner_app = await _build_app(session_maker=session_maker, ctx=owner_ctx, user=owner_user)
    other_app = await _build_app(session_maker=session_maker, ctx=other_ctx, user=stranger_user)

    async with AsyncClient(
        transport=ASGITransport(app=other_app),
        base_url="http://testserver",
    ) as client:
        refused = await client.post(
            f"/api/v1/transcriptions/speakers/samples/{sample_id}/confirm",
            json={"new_name": "Scott"},
        )
        refused_delete = await client.delete(f"/api/v1/transcriptions/speakers/{extra_id}")

    assert refused.status_code == 404
    assert refused_delete.status_code == 404
    original = (processed / "transcript.json").read_text(encoding="utf-8")
    assert "Guess" in original

    async with session_maker() as session:
        stored = await SpeakerVoiceSample.objects.by_id(sample_id).first(session)
        profile = await SpeakerProfile.objects.by_id(extra_id).first(session)
        assert stored is not None
        assert stored.status == "pending"
        assert profile is not None

    async with AsyncClient(
        transport=ASGITransport(app=owner_app),
        base_url="http://testserver",
    ) as client:
        confirm = await client.post(
            f"/api/v1/transcriptions/speakers/samples/{sample_id}/confirm",
            json={"new_name": "Scott"},
        )
        assert confirm.status_code == 200, confirm.text
        collision = await client.patch(
            f"/api/v1/transcriptions/speakers/{extra_id}",
            json={"display_name": "Scott"},
        )
        assert collision.status_code == 409
        merge = await client.post(
            f"/api/v1/transcriptions/speakers/{extra_id}/merge",
            json={"target_profile_id": confirm.json()["id"]},
        )
        assert merge.status_code == 200, merge.text
        reject_missing = await client.post(
            f"/api/v1/transcriptions/speakers/samples/{uuid4()}/reject",
        )
        assert reject_missing.status_code == 404
        deleted = await client.delete(f"/api/v1/transcriptions/speakers/{merge.json()['id']}")
        assert deleted.status_code == 200

    updated = (processed / "transcript.json").read_text(encoding="utf-8")
    assert "Scott" in updated
    assert "speaker_name_tentative" not in updated

    await engine.dispose()
