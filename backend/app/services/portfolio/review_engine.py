"""Orchestrate sheet parse, enrichment, roll detection, rationale carry, and artifact write."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any
from zoneinfo import ZoneInfo

from sqlmodel import select

from app.core.config import settings
from app.core.time import utcnow
from app.models.portfolio_rationales import PortfolioRationale
from app.models.portfolio_roll_events import PortfolioRollEvent
from app.schemas.portfolio import PortfolioRationaleRead, PortfolioReviewRunResult
from app.services.portfolio.price_enrichment import enrich_positions
from app.services.portfolio.roll_detector import RollEvent, detect_rolls
from app.services.portfolio.rules import apply_rules
from app.services.portfolio.shared import (
    SharedPortfolioService,
    portfolio_review_read_from_dict,
)
from app.services.portfolio.sheet_parser import extract_records, parse_positions_sheet
from app.services.portfolio.writer import build_review_markdown, write_artifacts

if TYPE_CHECKING:
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession


def _review_date_id(generated_at: datetime) -> str:
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=UTC)
    return generated_at.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d")


def _workspace_relative(workspace_root: Path, artifact: Path) -> str:
    """Path under the shared workspace root (POSIX-style), never an absolute host path."""
    root = workspace_root.resolve()
    try:
        rel = artifact.resolve().relative_to(root)
    except ValueError:
        return str(artifact).replace("\\", "/")
    return rel.as_posix()


def _portfolio_paths() -> tuple[Path, Path]:
    raw = settings.openclaw_shared_workspace_root.strip()
    if not raw:
        raise ValueError("Shared OpenClaw workspace is not configured.")
    root = Path(raw)
    portfolio = root / "portfolio"
    portfolio.mkdir(parents=True, exist_ok=True)
    (portfolio / "snapshots").mkdir(parents=True, exist_ok=True)
    (portfolio / "reviews").mkdir(parents=True, exist_ok=True)
    (portfolio / "rationales").mkdir(parents=True, exist_ok=True)
    return root, portfolio


def _previous_positions(portfolio_root: Path) -> list[dict[str, Any]]:
    latest = portfolio_root / "latest.json"
    if not latest.is_file():
        return []
    try:
        payload = json.loads(latest.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return []
    pos = payload.get("positions") if isinstance(payload, dict) else None
    if not isinstance(pos, list):
        return []
    return [p for p in pos if isinstance(p, dict)]


async def _rationale_key_set(
    session: AsyncSession, organization_id: UUID, portfolio_root: Path
) -> set[str]:
    stmt = select(PortfolioRationale).where(PortfolioRationale.organization_id == organization_id)
    recs = (await session.exec(stmt)).all()
    db_keys = {r.position_key for r in recs}
    disk_dir = portfolio_root / "rationales"
    disk_keys: set[str] = set()
    if disk_dir.is_dir():
        disk_keys = {p.stem for p in disk_dir.glob("*.json")}
    return db_keys | disk_keys


async def _roll_event_exists(
    session: AsyncSession,
    organization_id: UUID,
    rolled_from: str,
    rolled_to: str,
) -> bool:
    stmt = select(PortfolioRollEvent.id).where(
        PortfolioRollEvent.organization_id == organization_id,
        PortfolioRollEvent.rolled_from_position_key == rolled_from,
        PortfolioRollEvent.rolled_to_position_key == rolled_to,
    )
    return (await session.exec(stmt)).first() is not None


async def _rationale_record(
    session: AsyncSession,
    organization_id: UUID,
    position_key: str,
) -> PortfolioRationale | None:
    return await PortfolioRationale.objects.filter_by(
        organization_id=organization_id,
        position_key=position_key,
    ).first(session)


def _rationale_from_file(portfolio_root: Path, position_key: str) -> dict[str, Any] | None:
    path = portfolio_root / "rationales" / f"{position_key}.json"
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    return raw if isinstance(raw, dict) else None


def _parse_optional_iso_datetime(value: object) -> datetime | None:
    if isinstance(value, datetime):
        return value
    if not isinstance(value, str) or not value.strip():
        return None
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


def _isoformat_utc_z(dt: datetime) -> str:
    aware = dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)
    return aware.astimezone(UTC).isoformat().replace("+00:00", "Z")


async def _rationale_updated_at_by_position_key(
    session: AsyncSession,
    organization_id: UUID,
    portfolio_root: Path,
) -> dict[str, datetime | None]:
    """Prefer Postgres rationale timestamps; fall back to workspace mirror JSON."""
    stmt = select(PortfolioRationale).where(PortfolioRationale.organization_id == organization_id)
    recs = (await session.exec(stmt)).all()
    out: dict[str, datetime | None] = {r.position_key: r.updated_at for r in recs}
    disk_dir = portfolio_root / "rationales"
    if not disk_dir.is_dir():
        return out
    for path in disk_dir.glob("*.json"):
        key = path.stem
        if key in out:
            continue
        raw = _rationale_from_file(portfolio_root, key)
        if raw is None:
            continue
        parsed = _parse_optional_iso_datetime(raw.get("updated_at"))
        if parsed is not None:
            out[key] = parsed
    return out


async def _hydrate_rationale_snapshot_fields(
    session: AsyncSession,
    organization_id: UUID,
    portfolio_root: Path,
    positions: list[dict[str, Any]],
) -> None:
    """Attach rationale_updated_at to snapshot rows (latest.json / reviews)."""
    ts_map = await _rationale_updated_at_by_position_key(
        session, organization_id, portfolio_root
    )
    for pos in positions:
        pk = pos.get("position_key")
        if not isinstance(pk, str) or not pk:
            continue
        ts = ts_map.get(pk)
        if ts is None:
            continue
        pos["rationale_updated_at"] = _isoformat_utc_z(ts)


async def _carry_roll(
    session: AsyncSession,
    organization_id: UUID,
    portfolio_root: Path,
    roll: RollEvent,
    svc: SharedPortfolioService,
) -> str | None:
    """Persist a detected roll and, when possible, carry the rationale forward.

    Two concerns are recorded independently so historical rolls are never lost
    just because the source rationale is missing or the destination rationale
    was already captured:

    1. ``PortfolioRollEvent`` — always inserted for newly-detected pairs, regardless
       of whether the rationale can be carried. This gives the UI and downstream
       consumers a truthful record of what happened in the trade log.
    2. ``PortfolioRationale`` clone — inserted only when (a) the destination key
       has no rationale yet and (b) a source rationale exists (in DB or disk
       mirror) to copy from.

    Returns a human-readable markdown line for the review, or ``None`` when
    nothing was written (typically because the pair was already recorded).
    """
    if await _roll_event_exists(
        session, organization_id, roll.rolled_from_position_key, roll.rolled_to_position_key
    ):
        return None

    now = utcnow()

    # Concern 1: always record the event.
    ev = PortfolioRollEvent(
        organization_id=organization_id,
        rolled_from_position_key=roll.rolled_from_position_key,
        rolled_to_position_key=roll.rolled_to_position_key,
        rolled_at=roll.rolled_at,
        net_credit_cents=roll.net_credit_cents,
        source_trade_ids=list(roll.source_trade_ids),
        status="detected",
        confidence=roll.confidence,
        created_at=now,
        updated_at=now,
    )
    session.add(ev)

    # Concern 2: attempt rationale carry-forward.
    carried = False
    dest_existing = await _rationale_record(session, organization_id, roll.rolled_to_position_key)
    if dest_existing is None:
        src_rec = await _rationale_record(
            session, organization_id, roll.rolled_from_position_key
        )
        src_dict = _rationale_from_file(portfolio_root, roll.rolled_from_position_key)
        strategy = why = entry_plan = profit_take_plan = risk_plan = roll_or_reopen_plan = None
        tags: list[str] = []
        hist: list[dict[str, Any]] = []
        have_source = False
        if src_rec is not None:
            have_source = True
            strategy = src_rec.strategy
            why = src_rec.why
            entry_plan = src_rec.entry_plan
            profit_take_plan = src_rec.profit_take_plan
            risk_plan = src_rec.risk_plan
            roll_or_reopen_plan = src_rec.roll_or_reopen_plan
            tags = list(src_rec.tags or [])
            hist = [h for h in (src_rec.history or []) if isinstance(h, dict)]
        elif src_dict:
            have_source = True
            strategy = (
                src_dict.get("strategy") if isinstance(src_dict.get("strategy"), str) else None
            )
            why = src_dict.get("why") if isinstance(src_dict.get("why"), str) else None
            entry_plan = (
                src_dict.get("entry_plan")
                if isinstance(src_dict.get("entry_plan"), str)
                else None
            )
            profit_take_plan = (
                src_dict.get("profit_take_plan")
                if isinstance(src_dict.get("profit_take_plan"), str)
                else None
            )
            risk_plan = (
                src_dict.get("risk_plan")
                if isinstance(src_dict.get("risk_plan"), str)
                else None
            )
            roll_or_reopen_plan = (
                src_dict.get("roll_or_reopen_plan")
                if isinstance(src_dict.get("roll_or_reopen_plan"), str)
                else None
            )
            tags = [str(t) for t in (src_dict.get("tags") or []) if str(t).strip()]
            hist = [h for h in (src_dict.get("history") or []) if isinstance(h, dict)]

        if have_source:
            roll_note: dict[str, Any] = {
                "type": "rolled",
                "from": roll.rolled_from_position_key,
                "net_credit_cents": roll.net_credit_cents,
                "rolled_at": roll.rolled_at.isoformat(),
                "trade_ids": list(roll.source_trade_ids),
                "position_key": roll.rolled_to_position_key,
            }
            hist_out: list[dict[str, Any]] = [roll_note]
            for h in hist:
                if isinstance(h, dict) and h.get("type") != "rolled":
                    hist_out.append(h)
            new_rec = PortfolioRationale(
                organization_id=organization_id,
                position_key=roll.rolled_to_position_key,
                strategy=strategy,
                why=why,
                entry_plan=entry_plan,
                profit_take_plan=profit_take_plan,
                risk_plan=risk_plan,
                roll_or_reopen_plan=roll_or_reopen_plan,
                rolled_from_position_key=roll.rolled_from_position_key,
                tags=tags,
                history=hist_out,
                created_at=now,
                updated_at=now,
            )
            session.add(new_rec)
            ev.status = "auto_carried"
            carried = True

    await session.commit()
    await session.refresh(ev)

    if carried:
        # ``new_rec`` is only defined in the carry branch; refresh to pick up defaults.
        await session.refresh(new_rec)  # type: ignore[has-type]
        rationale_read = PortfolioRationaleRead(
            position_key=new_rec.position_key,  # type: ignore[has-type]
            strategy=new_rec.strategy,  # type: ignore[has-type]
            why=new_rec.why,  # type: ignore[has-type]
            entry_plan=new_rec.entry_plan,  # type: ignore[has-type]
            profit_take_plan=new_rec.profit_take_plan,  # type: ignore[has-type]
            risk_plan=new_rec.risk_plan,  # type: ignore[has-type]
            roll_or_reopen_plan=new_rec.roll_or_reopen_plan,  # type: ignore[has-type]
            tags=list(new_rec.tags or []),  # type: ignore[has-type]
            updated_at=new_rec.updated_at,  # type: ignore[has-type]
            rolled_from_position_key=new_rec.rolled_from_position_key,  # type: ignore[has-type]
        )
        svc._write_rationale_mirror(
            position_key=roll.rolled_to_position_key,
            payload=rationale_read,
            history=hist_out,  # type: ignore[has-type]
        )

    credit_usd = roll.net_credit_cents / 100.0
    suffix = "Rationale carried forward." if carried else "No source rationale to carry."
    return (
        f"- Rolled {roll.rolled_from_position_key} → {roll.rolled_to_position_key} "
        f"(net credit ~${credit_usd:.2f}). {suffix}"
    )


async def run_portfolio_review(
    session: AsyncSession,
    organization_id: UUID,
    *,
    positions_rows: list[list[object]],
    trades_rows: list[list[object]],
    generated_at: datetime | None = None,
) -> PortfolioReviewRunResult:
    """Parse sheets, enrich, detect rolls, carry rationale, write snapshot + review."""
    workspace_root, portfolio_root = _portfolio_paths()
    generated = generated_at or utcnow()
    if generated.tzinfo is None:
        generated = generated.replace(tzinfo=UTC)
    generated_iso = generated.isoformat().replace("+00:00", "Z")

    prev = _previous_positions(portfolio_root)
    rationale_keys = await _rationale_key_set(session, organization_id, portfolio_root)
    rationale_exists = {k: True for k in rationale_keys}

    positions = parse_positions_sheet(
        positions_rows,
        generated_at_iso=generated_iso,
        previous_positions=prev,
        rationale_exists=rationale_exists,
    )
    await _hydrate_rationale_snapshot_fields(session, organization_id, portfolio_root, positions)

    bundle = enrich_positions(positions, workspace_portfolio_root=portfolio_root)
    apply_rules(positions, bundle, workspace_root=workspace_root)

    trade_dicts = extract_records(trades_rows) if trades_rows else []
    rolls = detect_rolls(trade_dicts)
    svc = SharedPortfolioService(session, organization_id)
    roll_lines: list[str] = []
    for roll in rolls:
        line = await _carry_roll(session, organization_id, portfolio_root, roll, svc)
        if line:
            roll_lines.append(line)

    summary_md, actions = build_review_markdown(positions, roll_lines)
    review_id = _review_date_id(generated)
    review = {
        "id": review_id,
        "date": review_id,
        "generated_at": generated_iso,
        "summary_markdown": summary_md,
        "actions": actions,
        "position_keys": [str(p.get("position_key")) for p in positions if p.get("position_key")],
    }
    snapshot = {"generated_at": generated_iso, "positions": positions}
    snap_path, rev_json, rev_md = write_artifacts(portfolio_root, snapshot, review)

    flagged = sum(1 for p in positions if (p.get("latest_flags") or []))
    missing = sum(1 for p in positions if p.get("needs_rationale"))

    review_read = portfolio_review_read_from_dict(
        review,
        summary_markdown=str(review.get("summary_markdown") or ""),
        default_review_id=review_id,
    )

    return PortfolioReviewRunResult(
        ok=True,
        generated_at=generated_iso,
        position_count=len(positions),
        flagged_count=flagged,
        missing_rationale_count=missing,
        rolls_detected_count=len(rolls),
        review_id=review_id,
        snapshot_path=_workspace_relative(workspace_root, snap_path),
        review_json_path=_workspace_relative(workspace_root, rev_json),
        review_markdown_path=_workspace_relative(workspace_root, rev_md),
        review=review_read,
    )


async def undo_roll_event(
    session: AsyncSession,
    organization_id: UUID,
    event_id: UUID,
) -> None:
    """Dismiss roll event and remove auto-carried rationale on the target key."""
    ev = await session.get(PortfolioRollEvent, event_id)
    if ev is None or ev.organization_id != organization_id:
        from fastapi import HTTPException, status

        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Roll event was not found."
        )
    if ev.status == "dismissed":
        return
    rec = await _rationale_record(session, organization_id, ev.rolled_to_position_key)
    if rec is not None and rec.rolled_from_position_key == ev.rolled_from_position_key:
        await session.delete(rec)
    ev.status = "dismissed"
    ev.updated_at = utcnow()
    session.add(ev)
    await session.commit()

    _, portfolio_root = _portfolio_paths()
    path = portfolio_root / "rationales" / f"{ev.rolled_to_position_key}.json"
    if path.is_file():
        try:
            path.unlink()
        except OSError:
            pass


async def list_roll_events_read(
    session: AsyncSession,
    organization_id: UUID,
    *,
    days: int = 7,
) -> list[dict[str, Any]]:
    from datetime import timedelta

    from sqlmodel import col

    cutoff = utcnow() - timedelta(days=days)
    stmt = (
        select(PortfolioRollEvent)
        .where(PortfolioRollEvent.organization_id == organization_id)
        .where(col(PortfolioRollEvent.rolled_at) >= cutoff)
        .order_by(col(PortfolioRollEvent.rolled_at).desc())
    )
    events = (await session.exec(stmt)).all()
    out = []
    for ev in events:
        out.append(
            {
                "id": str(ev.id),
                "rolled_from_position_key": ev.rolled_from_position_key,
                "rolled_to_position_key": ev.rolled_to_position_key,
                "rolled_at": ev.rolled_at,
                "net_credit_cents": ev.net_credit_cents,
                "source_trade_ids": list(ev.source_trade_ids or []),
                "status": ev.status,
                "confidence": ev.confidence,
            }
        )
    return out
