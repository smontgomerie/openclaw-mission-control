# ruff: noqa: INP001, S101
"""Persistence coverage for confirmed-only speaker learning."""

from __future__ import annotations

import json

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession

from app import models as _models
from app.models.organizations import Organization
from app.services.speaker_learning import SpeakerLearningService

MODEL_REGISTRY = _models


@pytest_asyncio.fixture
async def speaker_service(tmp_path):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(SQLModel.metadata.create_all)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with session_factory() as session:
        organization = Organization(name="Speaker Test")
        session.add(organization)
        await session.commit()
        yield SpeakerLearningService(session, organization.id, tmp_path), session
    await engine.dispose()


@pytest.mark.asyncio
async def test_confirmed_embeddings_accumulate_and_export(speaker_service) -> None:
    service, _session = speaker_service
    await service.add_confirmed_embedding(
        name="Scott",
        entry_id="meeting-1",
        speaker_label="SPEAKER_00",
        source_audio_path="meeting-1.m4a",
        embedding=[1.0, 0.0, 0.0],
        speech_duration_seconds=8.0,
        segment_count=2,
    )
    profile = await service.add_confirmed_embedding(
        name="Scott",
        entry_id="meeting-2",
        speaker_label="SPEAKER_01",
        source_audio_path="meeting-2.m4a",
        embedding=[0.8, 0.2, 0.0],
        speech_duration_seconds=12.0,
        segment_count=4,
    )

    assert profile.confirmed_sample_count == 2
    assert profile.represented_sample_count == 2
    assert len(await service.samples(status_value="confirmed")) == 2
    registry = json.loads(
        (service.registry_base / ".speaker_registry" / "registry.json").read_text()
    )
    assert registry["version"] == 2
    assert registry["speakers"][0]["name"] == "Scott"
    assert len(registry["speakers"][0]["examples"]) == 2


@pytest.mark.asyncio
async def test_duplicate_transcript_label_does_not_add_evidence(
    speaker_service,
) -> None:
    service, _session = speaker_service
    for _ in range(2):
        profile = await service.add_confirmed_embedding(
            name="Scott",
            entry_id="meeting-1",
            speaker_label="SPEAKER_00",
            source_audio_path="meeting-1.m4a",
            embedding=[1.0, 0.0],
            speech_duration_seconds=5.0,
        )
    assert profile.confirmed_sample_count == 1
    assert len(await service.samples(status_value="confirmed")) == 1


@pytest.mark.asyncio
async def test_pending_observation_only_trains_after_confirmation(
    speaker_service,
) -> None:
    service, _session = speaker_service
    sample = await service.add_pending_observation(
        entry_id="meeting-1",
        speaker_label="SPEAKER_00",
        source_audio_path="meeting-1.m4a",
        embedding=[1.0, 0.0],
        encoder="ecapa",
        speech_duration_seconds=6.0,
        segment_count=2,
        clip_start_seconds=1.25,
        clip_end_seconds=8.5,
    )
    assert sample.clip_start_seconds == 1.25
    assert sample.clip_end_seconds == 8.5
    assert await service.profiles() == []

    profile = await service.confirm_sample(
        sample.id,
        profile_id=None,
        new_name="Scott",
        reviewed_by_user_id=None,
    )
    assert profile.confirmed_sample_count == 1
    assert (await service.require_sample(sample.id)).status == "confirmed"


@pytest.mark.asyncio
async def test_confirmation_recomputes_after_segment_exclusion(
    speaker_service, monkeypatch
) -> None:
    service, _session = speaker_service
    sample = await service.add_pending_observation(
        entry_id="meeting-exclusions",
        speaker_label="SPEAKER_00",
        source_audio_path="meeting.m4a",
        embedding=[1.0, 0.0],
        encoder="ecapa",
        speech_duration_seconds=8.0,
        segment_count=2,
        segment_evidence=[
            {"id": "keep", "start": 0.0, "end": 4.0, "text": "Keep"},
            {"id": "drop", "start": 4.0, "end": 8.0, "text": "Drop"},
        ],
    )
    monkeypatch.setattr(
        "app.services.speaker_learning._encode_segment_evidence",
        lambda *_args: [0.0, 1.0],
    )

    profile = await service.confirm_sample(
        sample.id,
        profile_id=None,
        new_name="Scott",
        reviewed_by_user_id=None,
        excluded_segment_ids=["drop"],
    )

    stored = await service.require_sample(sample.id)
    assert profile.confirmed_sample_count == 1
    assert stored.embedding == [0.0, 1.0]
    assert stored.segment_count == 1
    assert [item["id"] for item in stored.segment_evidence] == ["keep"]


@pytest.mark.asyncio
async def test_legacy_registry_import_is_idempotent(speaker_service) -> None:
    service, _session = speaker_service
    registry_path = service.registry_base / ".speaker_registry" / "registry.json"
    registry_path.parent.mkdir(parents=True)
    registry_path.write_text(
        json.dumps(
            {
                "version": 1,
                "speakers": [
                    {
                        "name": "Scott",
                        "embedding": [1.0, 0.0],
                        "sample_count": 5,
                        "sources": ["old.m4a::SPEAKER_00"],
                    }
                ],
            }
        )
    )

    assert await service.import_legacy_registry() == 1
    assert await service.import_legacy_registry() == 0
    profile = (await service.profiles())[0]
    assert profile.confirmed_sample_count == 1
    assert profile.represented_sample_count == 5
    assert (registry_path.parent / "registry.legacy-v1.json").is_file()
