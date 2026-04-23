"""Read and update shared-workspace portfolio artifacts."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

from fastapi import HTTPException, status

from app.core.config import settings
from app.core.time import utcnow
from app.models.portfolio_rationales import PortfolioRationale
from app.schemas.portfolio import (
    PortfolioPositionDetailRead,
    PortfolioPositionRead,
    PortfolioRationaleHistoryRead,
    PortfolioRationaleRead,
    PortfolioRationaleUpdate,
    PortfolioReviewActionRead,
    PortfolioReviewRead,
)

PORTFOLIO_DIRNAME = "portfolio"
LATEST_SNAPSHOT_NAME = "latest.json"
REVIEWS_DIRNAME = "reviews"
RATIONALES_DIRNAME = "rationales"

if TYPE_CHECKING:
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession


def _read_json(path: Path) -> Any:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Portfolio artifact was not found.",
        ) from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Portfolio artifact is invalid JSON: {path.name}",
        ) from exc


def _read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None


def _coerce_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value.strip():
        normalized = value.strip()
        if normalized.endswith("Z"):
            normalized = normalized[:-1] + "+00:00"
        try:
            parsed = datetime.fromisoformat(normalized)
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=UTC)
        return parsed
    return None


def _coerce_float(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str) and value.strip():
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def _coerce_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip():
        try:
            return int(float(value.strip()))
        except ValueError:
            return None
    return None


def _coerce_tags(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str) and value.strip():
        return [part.strip() for part in value.split(",") if part.strip()]
    return []


def _action_read(raw: object) -> PortfolioReviewActionRead | None:
    if not isinstance(raw, dict):
        return None
    code = str(raw.get("code", "")).strip()
    headline = str(raw.get("headline", "")).strip()
    if not code or not headline:
        return None
    summary = raw.get("summary")
    recommendation = raw.get("recommendation")
    return PortfolioReviewActionRead(
        code=code,
        severity=str(raw.get("severity", "info")).strip() or "info",
        headline=headline,
        summary=str(summary).strip() if isinstance(summary, str) and summary.strip() else None,
        recommendation=(
            str(recommendation).strip()
            if isinstance(recommendation, str) and recommendation.strip()
            else None
        ),
    )


def portfolio_review_read_from_dict(
    payload: dict[str, Any],
    *,
    summary_markdown: str | None = None,
    default_review_id: str = "",
) -> PortfolioReviewRead:
    """Build ``PortfolioReviewRead`` from persisted review JSON or an in-memory dict."""
    review_id = str(payload.get("id", default_review_id)).strip() or default_review_id
    actions = payload.get("actions")
    review_actions: list[PortfolioReviewActionRead] = []
    if isinstance(actions, list):
        review_actions = [
            item for item in (_action_read(action) for action in actions) if item is not None
        ]
    sm = summary_markdown
    if not sm:
        raw_summary = payload.get("summary_markdown")
        if isinstance(raw_summary, str) and raw_summary.strip():
            sm = raw_summary
    raw_position_keys = payload.get("position_keys")
    position_keys: list[str] = []
    if isinstance(raw_position_keys, list):
        position_keys = [str(item).strip() for item in raw_position_keys if str(item).strip()]
    return PortfolioReviewRead(
        id=review_id,
        date=str(payload.get("date")).strip() if isinstance(payload.get("date"), str) else None,
        generated_at=_coerce_datetime(payload.get("generated_at")),
        summary_markdown=sm,
        actions=review_actions,
        position_keys=position_keys,
    )


def _rationale_read(raw: object) -> PortfolioRationaleRead | None:
    if not isinstance(raw, dict):
        return None
    rolled_from = raw.get("rolled_from_position_key")
    return PortfolioRationaleRead(
        position_key=(
            str(raw.get("position_key")).strip()
            if isinstance(raw.get("position_key"), str) and str(raw.get("position_key")).strip()
            else None
        ),
        strategy=str(raw.get("strategy")).strip() if isinstance(raw.get("strategy"), str) else None,
        why=str(raw.get("why")).strip() if isinstance(raw.get("why"), str) else None,
        entry_plan=(
            str(raw.get("entry_plan")).strip() if isinstance(raw.get("entry_plan"), str) else None
        ),
        profit_take_plan=(
            str(raw.get("profit_take_plan")).strip()
            if isinstance(raw.get("profit_take_plan"), str)
            else None
        ),
        risk_plan=(
            str(raw.get("risk_plan")).strip() if isinstance(raw.get("risk_plan"), str) else None
        ),
        roll_or_reopen_plan=(
            str(raw.get("roll_or_reopen_plan")).strip()
            if isinstance(raw.get("roll_or_reopen_plan"), str)
            else None
        ),
        tags=_coerce_tags(raw.get("tags")),
        updated_at=_coerce_datetime(raw.get("updated_at")),
        rolled_from_position_key=(
            str(rolled_from).strip()
            if isinstance(rolled_from, str) and str(rolled_from).strip()
            else None
        ),
    )


def _history_reads(raw: object) -> list[PortfolioRationaleHistoryRead]:
    if not isinstance(raw, list):
        return []
    items: list[PortfolioRationaleHistoryRead] = []
    for item in raw:
        parsed = _rationale_read(item)
        if parsed is None:
            continue
        items.append(PortfolioRationaleHistoryRead(**parsed.model_dump()))
    return items


def _position_read(raw: object) -> PortfolioPositionRead | None:
    if not isinstance(raw, dict):
        return None
    position_key = str(raw.get("position_key", "")).strip()
    ticker = str(raw.get("ticker", "")).strip().upper()
    if not position_key or not ticker:
        return None
    actions = raw.get("latest_flags")
    latest_flags = []
    if isinstance(actions, list):
        latest_flags = [
            item for item in (_action_read(action) for action in actions) if item is not None
        ]

    return PortfolioPositionRead(
        position_key=position_key,
        as_of=_coerce_datetime(raw.get("as_of")),
        source_row_ref=(
            str(raw.get("source_row_ref")).strip()
            if isinstance(raw.get("source_row_ref"), str) and str(raw.get("source_row_ref")).strip()
            else None
        ),
        ticker=ticker,
        instrument_type=(
            str(raw.get("instrument_type")).strip()
            if isinstance(raw.get("instrument_type"), str)
            else None
        ),
        strategy=str(raw.get("strategy")).strip() if isinstance(raw.get("strategy"), str) else None,
        option_side=(
            str(raw.get("option_side")).strip() if isinstance(raw.get("option_side"), str) else None
        ),
        quantity=_coerce_float(raw.get("quantity")),
        expiration=(
            str(raw.get("expiration")).strip() if isinstance(raw.get("expiration"), str) else None
        ),
        strike=_coerce_float(raw.get("strike")),
        cost_basis=_coerce_float(raw.get("cost_basis")),
        mark=_coerce_float(raw.get("mark")),
        unrealized_pnl=_coerce_float(raw.get("unrealized_pnl")),
        unrealized_pnl_pct=_coerce_float(raw.get("unrealized_pnl_pct")),
        dte=_coerce_int(raw.get("dte")),
        status=str(raw.get("status")).strip() if isinstance(raw.get("status"), str) else None,
        latest_flags=latest_flags,
        needs_rationale=bool(raw.get("needs_rationale")),
        rationale_updated_at=_coerce_datetime(raw.get("rationale_updated_at")),
    )


def _clear_missing_rationale_flag(position: PortfolioPositionRead) -> PortfolioPositionRead:
    latest_flags = [flag for flag in position.latest_flags if flag.code != "missing_rationale"]
    if len(latest_flags) == len(position.latest_flags):
        return position
    return position.model_copy(update={"latest_flags": latest_flags})


class SharedPortfolioService:
    """Read and write portfolio artifacts from the mounted shared workspace."""

    def __init__(self, session: AsyncSession, organization_id: UUID) -> None:
        self._session = session
        self._organization_id = organization_id

    def _workspace_root(self) -> Path:
        raw = settings.openclaw_shared_workspace_root.strip()
        if not raw:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Shared OpenClaw workspace is not configured.",
            )
        root = Path(raw)
        if not root.exists() or not root.is_dir():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Shared OpenClaw workspace mount is unavailable.",
            )
        return root

    def _portfolio_root(self) -> Path:
        root = self._workspace_root() / PORTFOLIO_DIRNAME
        if not root.exists() or not root.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Shared portfolio directory was not found.",
            )
        return root

    def _portfolio_root_if_present(self) -> Path | None:
        root = self._workspace_root() / PORTFOLIO_DIRNAME
        if not root.exists() or not root.is_dir():
            return None
        return root

    def _latest_snapshot_path(self) -> Path:
        path = self._portfolio_root() / LATEST_SNAPSHOT_NAME
        if not path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Latest portfolio snapshot was not found.",
            )
        return path

    def _latest_snapshot_path_if_present(self) -> Path | None:
        root = self._portfolio_root_if_present()
        if root is None:
            return None
        path = root / LATEST_SNAPSHOT_NAME
        if not path.is_file():
            return None
        return path

    def _reviews_root(self) -> Path:
        root = self._portfolio_root() / REVIEWS_DIRNAME
        if not root.exists() or not root.is_dir():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio reviews directory was not found.",
            )
        return root

    def _reviews_root_if_present(self) -> Path | None:
        root = self._portfolio_root_if_present()
        if root is None:
            return None
        reviews_root = root / REVIEWS_DIRNAME
        if not reviews_root.exists() or not reviews_root.is_dir():
            return None
        return reviews_root

    def _rationales_root(self) -> Path:
        root = self._portfolio_root() / RATIONALES_DIRNAME
        root.mkdir(parents=True, exist_ok=True)
        return root

    def _validate_position_key(self, position_key: str) -> None:
        if (
            not position_key
            or "/" in position_key
            or "\\" in position_key
            or position_key in {".", ".."}
        ):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio position was not found.",
            )

    def _rationale_path(self, position_key: str) -> Path:
        self._validate_position_key(position_key)
        root = self._rationales_root().resolve()
        path = (root / f"{position_key}.json").resolve()
        try:
            path.relative_to(root)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio position was not found.",
            ) from exc
        return path

    def _snapshot_positions(self) -> list[PortfolioPositionRead]:
        snapshot_path = self._latest_snapshot_path_if_present()
        if snapshot_path is None:
            return []
        payload = _read_json(snapshot_path)
        raw_positions: object
        if isinstance(payload, dict):
            raw_positions = payload.get("positions", [])
        else:
            raw_positions = payload
        if not isinstance(raw_positions, list):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Latest portfolio snapshot is missing a positions list.",
            )
        return [item for item in (_position_read(raw) for raw in raw_positions) if item is not None]

    def _read_rationale_file(
        self,
        position_key: str,
    ) -> tuple[PortfolioRationaleRead | None, list[PortfolioRationaleHistoryRead]]:
        path = self._rationale_path(position_key)
        if not path.is_file():
            return None, []
        payload = _read_json(path)
        if not isinstance(payload, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Portfolio rationale is invalid JSON: {path.name}",
            )
        rationale = _rationale_read(payload)
        history = _history_reads(payload.get("history"))
        return rationale, history

    def _rationale_from_record(self, record: PortfolioRationale) -> PortfolioRationaleRead:
        return PortfolioRationaleRead(
            position_key=record.position_key,
            strategy=record.strategy,
            why=record.why,
            entry_plan=record.entry_plan,
            profit_take_plan=record.profit_take_plan,
            risk_plan=record.risk_plan,
            roll_or_reopen_plan=record.roll_or_reopen_plan,
            tags=_coerce_tags(record.tags),
            updated_at=record.updated_at,
            rolled_from_position_key=record.rolled_from_position_key,
        )

    def _history_from_record(
        self, record: PortfolioRationale
    ) -> list[PortfolioRationaleHistoryRead]:
        return _history_reads(record.history)

    async def _rationale_record(self, position_key: str) -> PortfolioRationale | None:
        return await PortfolioRationale.objects.filter_by(
            organization_id=self._organization_id,
            position_key=position_key,
        ).first(self._session)

    async def _read_rationale(
        self,
        position_key: str,
    ) -> tuple[PortfolioRationaleRead | None, list[PortfolioRationaleHistoryRead]]:
        record = await self._rationale_record(position_key)
        if record is not None:
            return self._rationale_from_record(record), self._history_from_record(record)
        return self._read_rationale_file(position_key)

    def _overlay_rationale_state(
        self,
        position: PortfolioPositionRead,
        rationale: PortfolioRationaleRead | None,
    ) -> PortfolioPositionRead:
        if rationale is None:
            return position
        updated = position.model_copy(
            update={
                "needs_rationale": False,
                "rationale_updated_at": rationale.updated_at,
            }
        )
        return _clear_missing_rationale_flag(updated)

    def _write_rationale_mirror(
        self,
        *,
        position_key: str,
        payload: PortfolioRationaleRead,
        history: list[PortfolioRationaleHistoryRead] | list[dict[str, Any]],
    ) -> None:
        path = self._rationale_path(position_key)
        hist_out: list[dict[str, Any]] = []
        for item in history:
            if isinstance(item, PortfolioRationaleHistoryRead):
                hist_out.append(item.model_dump(mode="json"))
            elif isinstance(item, dict):
                hist_out.append(item)
        document = {
            "position_key": position_key,
            "strategy": payload.strategy,
            "why": payload.why,
            "entry_plan": payload.entry_plan,
            "profit_take_plan": payload.profit_take_plan,
            "risk_plan": payload.risk_plan,
            "roll_or_reopen_plan": payload.roll_or_reopen_plan,
            "tags": payload.tags,
            "updated_at": (
                payload.updated_at.isoformat() if payload.updated_at is not None else None
            ),
            "rolled_from_position_key": payload.rolled_from_position_key,
            "history": hist_out,
        }
        path.write_text(json.dumps(document, indent=2, sort_keys=True), encoding="utf-8")

    def _review_json_path(self, review_id: str) -> Path:
        if not review_id or "/" in review_id or "\\" in review_id:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio review was not found.",
            )
        path = self._reviews_root() / f"{review_id}.json"
        if not path.is_file():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio review was not found.",
            )
        return path

    def _review_read(self, review_id: str) -> PortfolioReviewRead:
        json_path = self._review_json_path(review_id)
        payload = _read_json(json_path)
        if not isinstance(payload, dict):
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Portfolio review is invalid JSON: {json_path.name}",
            )
        summary_markdown = _read_text(json_path.with_suffix(".md"))
        return portfolio_review_read_from_dict(
            payload, summary_markdown=summary_markdown, default_review_id=review_id
        )

    async def list_positions(self) -> list[PortfolioPositionRead]:
        positions = []
        for position in self._snapshot_positions():
            rationale, _ = await self._read_rationale(position.position_key)
            positions.append(self._overlay_rationale_state(position, rationale))
        positions.sort(
            key=lambda item: (
                not item.needs_rationale,
                0 if item.latest_flags else 1,
                item.ticker,
                item.position_key,
            ),
        )
        return positions

    async def get_position(self, position_key: str) -> PortfolioPositionDetailRead:
        position = next(
            (item for item in self._snapshot_positions() if item.position_key == position_key), None
        )
        if position is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio position was not found.",
            )
        rationale, history = await self._read_rationale(position_key)
        position = self._overlay_rationale_state(position, rationale)
        latest_review = await self._latest_review_for_position(position_key)
        return PortfolioPositionDetailRead(
            **position.model_dump(),
            rationale=rationale,
            rationale_history=history,
            latest_review_id=latest_review.id if latest_review is not None else None,
            latest_review_summary_markdown=(
                latest_review.summary_markdown if latest_review is not None else None
            ),
        )

    async def _latest_review_for_position(self, position_key: str) -> PortfolioReviewRead | None:
        for review in await self.list_reviews():
            if position_key in review.position_keys:
                return review
        return None

    async def list_reviews(self) -> list[PortfolioReviewRead]:
        root = self._reviews_root_if_present()
        if root is None:
            return []
        reviews: list[PortfolioReviewRead] = []
        for path in sorted(root.glob("*.json"), key=lambda item: item.name, reverse=True):
            review_id = path.stem
            reviews.append(self._review_read(review_id))
        return reviews

    async def get_review(self, review_id: str) -> PortfolioReviewRead:
        return self._review_read(review_id)

    async def upsert_rationale(
        self,
        position_key: str,
        payload: PortfolioRationaleUpdate,
    ) -> PortfolioPositionDetailRead:
        position = next(
            (item for item in self._snapshot_positions() if item.position_key == position_key), None
        )
        if position is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Portfolio position was not found.",
            )
        record = await self._rationale_record(position_key)
        current_rationale, history = await self._read_rationale(position_key)
        now = utcnow()

        history_payload = [item.model_dump(mode="json") for item in history]
        if current_rationale is not None:
            prior = current_rationale.model_dump(mode="json")
            if prior.get("updated_at") is None:
                prior["updated_at"] = now.isoformat()
            history_payload.insert(0, prior)

        if record is None:
            record = PortfolioRationale(
                organization_id=self._organization_id,
                position_key=position_key,
                created_at=now,
            )

        record.strategy = payload.strategy
        record.why = payload.why
        record.entry_plan = payload.entry_plan
        record.profit_take_plan = payload.profit_take_plan
        record.risk_plan = payload.risk_plan
        record.roll_or_reopen_plan = payload.roll_or_reopen_plan
        record.tags = payload.tags
        record.history = history_payload
        record.updated_at = now
        if record.rolled_from_position_key is None and current_rationale is not None:
            rf = getattr(current_rationale, "rolled_from_position_key", None)
            if isinstance(rf, str) and rf.strip():
                record.rolled_from_position_key = rf.strip()

        self._session.add(record)
        await self._session.commit()
        await self._session.refresh(record)

        mirrored_rationale = self._rationale_from_record(record)
        mirrored_history = self._history_from_record(record)
        self._write_rationale_mirror(
            position_key=position_key,
            payload=mirrored_rationale,
            history=mirrored_history,
        )

        return await self.get_position(position_key)
