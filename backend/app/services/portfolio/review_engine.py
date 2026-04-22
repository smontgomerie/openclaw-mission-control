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
from app.services.portfolio.shared import SharedPortfolioService
from app.services.portfolio.sheet_parser import extract_records, parse_positions_sheet
from app.services.portfolio.writer import build_review_markdown, write_artifacts

if TYPE_CHECKING:
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession


def _review_date_id(generated_at: datetime) -> str:
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=UTC)
    return generated_at.astimezone(ZoneInfo("America/Los_Angeles")).strftime("%Y-%m-%d")


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


async def _carry_roll(
    session: AsyncSession,
    organization_id: UUID,
    portfolio_root: Path,
    roll: RollEvent,
    svc: SharedPortfolioService,
) -> str | None:
    """Clone rationale from -> to; insert roll event. Returns markdown line or None."""
    if await _roll_event_exists(
        session, organization_id, roll.rolled_from_position_key, roll.rolled_to_position_key
    ):
        return None
    if await _rationale_record(session, organization_id, roll.rolled_to_position_key):
        return None
    src_rec = await _rationale_record(session, organization_id, roll.rolled_from_position_key)
    src_dict = _rationale_from_file(portfolio_root, roll.rolled_from_position_key)
    strategy = why = entry_plan = profit_take_plan = risk_plan = roll_or_reopen_plan = None
    tags: list[str] = []
    hist: list[dict[str, Any]] = []
    if src_rec is not None:
        strategy = src_rec.strategy
        why = src_rec.why
        entry_plan = src_rec.entry_plan
        profit_take_plan = src_rec.profit_take_plan
        risk_plan = src_rec.risk_plan
        roll_or_reopen_plan = src_rec.roll_or_reopen_plan
        tags = list(src_rec.tags or [])
        hist = [h for h in (src_rec.history or []) if isinstance(h, dict)]
    elif src_dict:
        strategy = src_dict.get("strategy") if isinstance(src_dict.get("strategy"), str) else None
        why = src_dict.get("why") if isinstance(src_dict.get("why"), str) else None
        entry_plan = (
            src_dict.get("entry_plan") if isinstance(src_dict.get("entry_plan"), str) else None
        )
        profit_take_plan = (
            src_dict.get("profit_take_plan")
            if isinstance(src_dict.get("profit_take_plan"), str)
            else None
        )
        risk_plan = (
            src_dict.get("risk_plan") if isinstance(src_dict.get("risk_plan"), str) else None
        )
        roll_or_reopen_plan = (
            src_dict.get("roll_or_reopen_plan")
            if isinstance(src_dict.get("roll_or_reopen_plan"), str)
            else None
        )
        tags = [str(t) for t in (src_dict.get("tags") or []) if str(t).strip()]
        hist = [h for h in (src_dict.get("history") or []) if isinstance(h, dict)]
    else:
        return None

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
    now = utcnow()
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
    ev = PortfolioRollEvent(
        organization_id=organization_id,
        rolled_from_position_key=roll.rolled_from_position_key,
        rolled_to_position_key=roll.rolled_to_position_key,
        rolled_at=roll.rolled_at,
        net_credit_cents=roll.net_credit_cents,
        source_trade_ids=list(roll.source_trade_ids),
        status="auto_carried",
        confidence=roll.confidence,
        created_at=now,
        updated_at=now,
    )
    session.add(new_rec)
    session.add(ev)
    await session.commit()
    await session.refresh(new_rec)

    rationale_read = PortfolioRationaleRead(
        position_key=new_rec.position_key,
        strategy=new_rec.strategy,
        why=new_rec.why,
        entry_plan=new_rec.entry_plan,
        profit_take_plan=new_rec.profit_take_plan,
        risk_plan=new_rec.risk_plan,
        roll_or_reopen_plan=new_rec.roll_or_reopen_plan,
        tags=list(new_rec.tags or []),
        updated_at=new_rec.updated_at,
        rolled_from_position_key=new_rec.rolled_from_position_key,
    )
    svc._write_rationale_mirror(
        position_key=roll.rolled_to_position_key,
        payload=rationale_read,
        history=hist_out,
    )
    credit_usd = roll.net_credit_cents / 100.0
    return (
        f"- Rolled {roll.rolled_from_position_key} → {roll.rolled_to_position_key} "
        f"(net credit ~${credit_usd:.2f}). Rationale carried forward."
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
    _workspace_root, portfolio_root = _portfolio_paths()
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

    bundle = enrich_positions(positions, workspace_portfolio_root=portfolio_root)
    apply_rules(positions, bundle, workspace_root=_workspace_root)

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

    return PortfolioReviewRunResult(
        ok=True,
        generated_at=generated_iso,
        position_count=len(positions),
        flagged_count=flagged,
        missing_rationale_count=missing,
        rolls_detected_count=len(rolls),
        review_id=review_id,
        snapshot_path=str(snap_path),
        review_json_path=str(rev_json),
        review_markdown_path=str(rev_md),
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
