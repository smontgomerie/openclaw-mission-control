"""Database-backed speaker learning with filesystem registry materialization."""

from __future__ import annotations

import hashlib
import json
import math
import shutil
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import HTTPException, status
from sqlmodel import col, select

from app.core.time import utcnow
from app.models.speaker_profiles import SpeakerProfile, SpeakerVoiceSample

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

CONFIRMED_STATUSES = ("confirmed", "legacy")
MIN_CONFIRMED_SPEECH_SECONDS = 3.0


def normalize_speaker_name(value: str) -> tuple[str, str]:
    display_name = " ".join(value.strip().split())
    if not display_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Speaker name cannot be empty.",
        )
    return display_name, display_name.casefold()


def normalize_embedding(values: list[float]) -> list[float]:
    vector = [float(value) for value in values]
    norm = math.sqrt(sum(value * value for value in vector))
    if not vector or norm <= 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Speaker embedding is empty or invalid.",
        )
    return [value / norm for value in vector]


def embedding_fingerprint(entry_id: str, speaker_label: str, encoder: str) -> str:
    material = f"{entry_id}\0{speaker_label}\0{encoder}".encode()
    return hashlib.sha256(material).hexdigest()


class SpeakerLearningService:
    """Manage confirmed evidence and publish snapshots for the workspace annotator."""

    def __init__(
        self,
        session: AsyncSession,
        organization_id: UUID,
        registry_base: Path,
    ) -> None:
        self.session = session
        self.organization_id = organization_id
        self.registry_base = registry_base

    async def profiles(self) -> list[SpeakerProfile]:
        result = await self.session.exec(
            select(SpeakerProfile)
            .where(SpeakerProfile.organization_id == self.organization_id)
            .order_by(col(SpeakerProfile.display_name).asc())
        )
        return list(result.all())

    async def samples(
        self,
        *,
        status_value: str | None = None,
    ) -> list[SpeakerVoiceSample]:
        query = select(SpeakerVoiceSample).where(
            SpeakerVoiceSample.organization_id == self.organization_id
        )
        if status_value is not None:
            query = query.where(SpeakerVoiceSample.status == status_value)
        result = await self.session.exec(query.order_by(col(SpeakerVoiceSample.created_at).desc()))
        return list(result.all())

    async def require_profile(self, profile_id: UUID) -> SpeakerProfile:
        profile = (
            await SpeakerProfile.objects.by_id(profile_id)
            .filter_by(organization_id=self.organization_id)
            .first(self.session)
        )
        if profile is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Speaker profile not found.",
            )
        return profile

    async def require_sample(self, sample_id: UUID) -> SpeakerVoiceSample:
        sample = (
            await SpeakerVoiceSample.objects.by_id(sample_id)
            .filter_by(organization_id=self.organization_id)
            .first(self.session)
        )
        if sample is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Speaker sample not found.",
            )
        return sample

    async def find_or_create_profile(
        self,
        name: str,
        *,
        encoder: str = "ecapa",
    ) -> SpeakerProfile:
        display_name, normalized_name = normalize_speaker_name(name)
        profile = await SpeakerProfile.objects.filter_by(
            organization_id=self.organization_id,
            normalized_name=normalized_name,
        ).first(self.session)
        if profile is not None:
            return profile
        profile = SpeakerProfile(
            organization_id=self.organization_id,
            display_name=display_name,
            normalized_name=normalized_name,
            encoder=encoder,
        )
        self.session.add(profile)
        await self.session.flush()
        return profile

    async def add_confirmed_embedding(
        self,
        *,
        name: str,
        entry_id: str,
        speaker_label: str,
        source_audio_path: str,
        embedding: list[float],
        encoder: str = "ecapa",
        speech_duration_seconds: float | None = None,
        segment_count: int | None = None,
        reviewed_by_user_id: UUID | None = None,
    ) -> SpeakerProfile:
        if (
            speech_duration_seconds is not None
            and speech_duration_seconds < MIN_CONFIRMED_SPEECH_SECONDS
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "At least three seconds of usable speech are required to train "
                    "a speaker profile."
                ),
            )
        fingerprint = embedding_fingerprint(entry_id, speaker_label, encoder)
        sample = await SpeakerVoiceSample.objects.filter_by(
            organization_id=self.organization_id,
            fingerprint=fingerprint,
        ).first(self.session)
        previous_profile_id = sample.profile_id if sample is not None else None
        profile = await self.find_or_create_profile(name, encoder=encoder)
        if profile.encoder != encoder and profile.confirmed_sample_count:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Speaker encoder version does not match the existing profile.",
            )
        now = utcnow()
        if sample is None:
            sample = SpeakerVoiceSample(
                organization_id=self.organization_id,
                profile_id=profile.id,
                transcription_entry_id=entry_id,
                speaker_label=speaker_label,
                source_audio_path=source_audio_path,
                fingerprint=fingerprint,
                embedding=normalize_embedding(embedding),
                encoder=encoder,
                speech_duration_seconds=speech_duration_seconds,
                segment_count=segment_count,
                status="confirmed",
                source_type="manual_confirmation",
                reviewed_by_user_id=reviewed_by_user_id,
                reviewed_at=now,
            )
        else:
            sample.profile_id = profile.id
            sample.candidate_profile_id = None
            sample.status = "confirmed"
            sample.embedding = normalize_embedding(embedding)
            sample.reviewed_by_user_id = reviewed_by_user_id
            sample.reviewed_at = now
            sample.updated_at = now
        self.session.add(sample)
        await self.session.flush()
        await self._refresh_profile(profile)
        if previous_profile_id is not None and previous_profile_id != profile.id:
            previous_profile = await self.require_profile(previous_profile_id)
            await self._refresh_profile(previous_profile)
        await self.session.commit()
        await self.export_registry()
        return profile

    async def add_pending_observation(
        self,
        *,
        entry_id: str,
        speaker_label: str,
        source_audio_path: str,
        embedding: list[float],
        encoder: str,
        speech_duration_seconds: float | None,
        segment_count: int | None,
    ) -> SpeakerVoiceSample:
        fingerprint = embedding_fingerprint(entry_id, speaker_label, encoder)
        existing = await SpeakerVoiceSample.objects.filter_by(
            organization_id=self.organization_id,
            fingerprint=fingerprint,
        ).first(self.session)
        if existing is not None:
            return existing
        ranked = []
        observation = normalize_embedding(embedding)
        for profile in await self.profiles():
            if profile.encoder != encoder or not profile.centroid_embedding:
                continue
            score = sum(
                left * right
                for left, right in zip(observation, profile.centroid_embedding, strict=False)
            )
            ranked.append((profile, score))
        ranked.sort(key=lambda item: item[1], reverse=True)
        candidate, similarity = ranked[0] if ranked else (None, None)
        second_similarity = ranked[1][1] if len(ranked) > 1 else None
        sample = SpeakerVoiceSample(
            organization_id=self.organization_id,
            candidate_profile_id=candidate.id if candidate else None,
            transcription_entry_id=entry_id,
            speaker_label=speaker_label,
            source_audio_path=source_audio_path,
            fingerprint=fingerprint,
            embedding=observation,
            encoder=encoder,
            speech_duration_seconds=speech_duration_seconds,
            segment_count=segment_count,
            similarity=similarity,
            second_similarity=second_similarity,
        )
        self.session.add(sample)
        await self.session.commit()
        return sample

    async def confirm_sample(
        self,
        sample_id: UUID,
        *,
        profile_id: UUID | None,
        new_name: str | None,
        reviewed_by_user_id: UUID | None,
    ) -> SpeakerProfile:
        sample = await self.require_sample(sample_id)
        previous_profile_id = sample.profile_id
        if profile_id is None and not (new_name or "").strip():
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Choose a profile or provide a new speaker name.",
            )
        profile = (
            await self.require_profile(profile_id)
            if profile_id
            else await self.find_or_create_profile(new_name or "", encoder=sample.encoder)
        )
        if (
            sample.speech_duration_seconds is not None
            and sample.speech_duration_seconds < MIN_CONFIRMED_SPEECH_SECONDS
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="At least three seconds of usable speech are required.",
            )
        now = utcnow()
        sample.profile_id = profile.id
        sample.candidate_profile_id = None
        sample.status = "confirmed"
        sample.reviewed_by_user_id = reviewed_by_user_id
        sample.reviewed_at = now
        sample.updated_at = now
        self.session.add(sample)
        await self._refresh_profile(profile)
        if previous_profile_id is not None and previous_profile_id != profile.id:
            previous_profile = await self.require_profile(previous_profile_id)
            await self._refresh_profile(previous_profile)
        await self.session.commit()
        await self.export_registry()
        return profile

    async def reject_sample(
        self,
        sample_id: UUID,
        *,
        reviewed_by_user_id: UUID | None,
    ) -> None:
        sample = await self.require_sample(sample_id)
        sample.status = "rejected"
        sample.profile_id = None
        sample.candidate_profile_id = None
        sample.reviewed_by_user_id = reviewed_by_user_id
        sample.reviewed_at = utcnow()
        sample.updated_at = utcnow()
        self.session.add(sample)
        await self.session.commit()

    async def rename_profile(
        self,
        profile_id: UUID,
        display_name: str,
    ) -> SpeakerProfile:
        profile = await self.require_profile(profile_id)
        next_display, next_normalized = normalize_speaker_name(display_name)
        collision = await SpeakerProfile.objects.filter_by(
            organization_id=self.organization_id,
            normalized_name=next_normalized,
        ).first(self.session)
        if collision is not None and collision.id != profile.id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A speaker profile with that name already exists.",
            )
        if profile.display_name.casefold() != next_display.casefold():
            profile.aliases = [*profile.aliases, profile.display_name]
        profile.display_name = next_display
        profile.normalized_name = next_normalized
        profile.updated_at = utcnow()
        self.session.add(profile)
        await self.session.commit()
        await self.export_registry()
        return profile

    async def merge_profiles(
        self,
        source_id: UUID,
        target_id: UUID,
    ) -> SpeakerProfile:
        if source_id == target_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Source and target profiles must differ.",
            )
        source = await self.require_profile(source_id)
        target = await self.require_profile(target_id)
        source_samples = await SpeakerVoiceSample.objects.filter_by(profile_id=source.id).all(
            self.session
        )
        candidates = await SpeakerVoiceSample.objects.filter_by(candidate_profile_id=source.id).all(
            self.session
        )
        for sample in source_samples:
            sample.profile_id = target.id
            self.session.add(sample)
        for sample in candidates:
            sample.candidate_profile_id = target.id
            self.session.add(sample)
        target.aliases = sorted(
            set([*target.aliases, source.display_name, *source.aliases]),
            key=str.casefold,
        )
        await self.session.delete(source)
        await self.session.flush()
        await self._refresh_profile(target)
        await self.session.commit()
        await self.export_registry()
        return target

    async def delete_profile(self, profile_id: UUID) -> None:
        profile = await self.require_profile(profile_id)
        samples = await SpeakerVoiceSample.objects.filter_by(profile_id=profile.id).all(
            self.session
        )
        candidates = await SpeakerVoiceSample.objects.filter_by(
            candidate_profile_id=profile.id
        ).all(self.session)
        for sample in samples:
            await self.session.delete(sample)
        for sample in candidates:
            sample.candidate_profile_id = None
            self.session.add(sample)
        await self.session.delete(profile)
        await self.session.commit()
        await self.export_registry()

    async def _refresh_profile(self, profile: SpeakerProfile) -> None:
        result = await self.session.exec(
            select(SpeakerVoiceSample).where(
                SpeakerVoiceSample.organization_id == self.organization_id,
                SpeakerVoiceSample.profile_id == profile.id,
                col(SpeakerVoiceSample.status).in_(CONFIRMED_STATUSES),
            )
        )
        samples = list(result.all())
        embeddings = [
            normalize_embedding(sample.embedding) for sample in samples if sample.embedding
        ]
        if embeddings:
            dimensions = len(embeddings[0])
            compatible = [embedding for embedding in embeddings if len(embedding) == dimensions]
            profile.centroid_embedding = normalize_embedding(
                [sum(embedding[index] for embedding in compatible) for index in range(dimensions)]
            )
        else:
            profile.centroid_embedding = []
        profile.confirmed_sample_count = len(samples)
        profile.represented_sample_count = sum(
            sample.represented_sample_count for sample in samples
        )
        profile.updated_at = utcnow()
        self.session.add(profile)

    async def import_legacy_registry(self) -> int:
        if await self.profiles():
            return 0
        registry_path = self.registry_base / ".speaker_registry" / "registry.json"
        if not registry_path.is_file():
            return 0
        payload = json.loads(registry_path.read_text(encoding="utf-8"))
        speakers = payload.get("speakers") if isinstance(payload, dict) else None
        if not isinstance(speakers, list):
            return 0
        backup = registry_path.with_name("registry.legacy-v1.json")
        if not backup.exists():
            shutil.copy2(registry_path, backup)
        imported = 0
        for row in speakers:
            if not isinstance(row, dict) or not isinstance(row.get("embedding"), list):
                continue
            name = str(row.get("name") or "").strip()
            if not name:
                continue
            profile = await self.find_or_create_profile(name)
            sources = row.get("sources")
            first_source = sources[0] if isinstance(sources, list) and sources else None
            sample = SpeakerVoiceSample(
                organization_id=self.organization_id,
                profile_id=profile.id,
                fingerprint=f"legacy:{profile.normalized_name}",
                embedding=normalize_embedding(row["embedding"]),
                status="legacy",
                source_type="legacy_centroid",
                source_audio_path=str(first_source) if first_source else None,
                represented_sample_count=max(int(row.get("sample_count") or 1), 1),
                reviewed_at=utcnow(),
            )
            self.session.add(sample)
            await self.session.flush()
            await self._refresh_profile(profile)
            imported += 1
        await self.session.commit()
        await self.export_registry()
        return imported

    async def export_registry(self) -> None:
        speakers: list[dict[str, object]] = []
        for profile in await self.profiles():
            if not profile.centroid_embedding:
                continue
            result = await self.session.exec(
                select(SpeakerVoiceSample).where(
                    SpeakerVoiceSample.profile_id == profile.id,
                    col(SpeakerVoiceSample.status).in_(CONFIRMED_STATUSES),
                )
            )
            samples = list(result.all())
            speakers.append(
                {
                    "id": str(profile.id),
                    "name": profile.display_name,
                    "embedding": profile.centroid_embedding,
                    "sample_count": profile.represented_sample_count,
                    "created_at": profile.created_at.isoformat(),
                    "updated_at": profile.updated_at.isoformat(),
                    "sources": sorted(
                        {sample.source_audio_path for sample in samples if sample.source_audio_path}
                    ),
                    "examples": [
                        {
                            "id": str(sample.id),
                            "embedding": sample.embedding,
                            "source": sample.source_audio_path,
                            "speech_duration_seconds": sample.speech_duration_seconds,
                        }
                        for sample in samples
                    ],
                }
            )
        registry_path = self.registry_base / ".speaker_registry" / "registry.json"
        registry_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = registry_path.with_suffix(".json.tmp")
        temp_path.write_text(
            json.dumps({"version": 2, "speakers": speakers}, indent=2) + "\n",
            encoding="utf-8",
        )
        temp_path.replace(registry_path)

    async def reconcile_observation_files(self, transcriptions_root: Path) -> int:
        """Import workspace observation manifests without promoting their predictions."""
        processed_root = transcriptions_root / "processed"
        if not processed_root.is_dir():
            return 0
        imported = 0
        for manifest_path in sorted(processed_root.glob("*/speaker-observations.json")):
            try:
                payload = json.loads(manifest_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            if not isinstance(payload, dict):
                continue
            entry_id = str(payload.get("entry_id") or manifest_path.parent.name)
            audio_path = str(payload.get("audio_path") or "")
            encoder = str(payload.get("encoder") or "ecapa")
            observations = payload.get("observations")
            if not isinstance(observations, list):
                continue
            for observation in observations:
                if not isinstance(observation, dict):
                    continue
                label = str(observation.get("speaker_label") or "").strip()
                embedding = observation.get("embedding")
                if not label or not isinstance(embedding, list):
                    continue
                before = await SpeakerVoiceSample.objects.filter_by(
                    organization_id=self.organization_id,
                    fingerprint=embedding_fingerprint(entry_id, label, encoder),
                ).first(self.session)
                await self.add_pending_observation(
                    entry_id=entry_id,
                    speaker_label=label,
                    source_audio_path=audio_path,
                    embedding=[float(value) for value in embedding],
                    encoder=encoder,
                    speech_duration_seconds=observation.get("speech_duration_seconds"),
                    segment_count=observation.get("segment_count"),
                )
                if before is None:
                    imported += 1
        return imported
