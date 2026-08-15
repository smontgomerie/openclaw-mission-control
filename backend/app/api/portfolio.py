"""Admin-only shared-workspace portfolio endpoints."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlmodel import col

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.models.gateways import Gateway
from app.schemas.portfolio import (
    PortfolioPositionDetailRead,
    PortfolioPositionRead,
    PortfolioRationaleUpdate,
    PortfolioReviewRead,
    PortfolioReviewRunRequest,
    PortfolioReviewRunResult,
    PortfolioRollEventRead,
    PortfolioSyncRead,
)
from app.services.openclaw.error_messages import normalize_gateway_error_message
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call
from app.services.organizations import OrganizationContext
from app.services.portfolio import SharedPortfolioService
from app.services.portfolio.review_engine import (
    list_roll_events_read,
    run_portfolio_review,
    undo_roll_event,
)

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/portfolio", tags=["portfolio"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)
PORTFOLIO_SYNC_JOB_ID = "morning-portfolio-review"


async def _latest_gateway_for_org(
    session: AsyncSession,
    organization_id: UUID,
) -> Gateway | None:
    gateways = await (
        Gateway.objects.filter_by(organization_id=organization_id)
        .order_by(col(Gateway.created_at).desc())
        .all(session)
    )
    return gateways[0] if gateways else None


async def _enqueue_portfolio_sync(gateway: Gateway) -> PortfolioSyncRead:
    config = gateway_client_config(gateway)
    errors: list[str] = []
    payload: object | None = None

    for params in ({"id": PORTFOLIO_SYNC_JOB_ID}, {"jobId": PORTFOLIO_SYNC_JOB_ID}):
        try:
            payload = await openclaw_call("cron.run", params, config=config)
            break
        except OpenClawGatewayError as exc:
            errors.append(str(exc))

    if payload is None:
        detail = normalize_gateway_error_message(errors[-1] if errors else "")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Portfolio sync could not be started: {detail}",
        )

    if not isinstance(payload, dict):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Portfolio sync returned an invalid gateway response.",
        )

    ok = bool(payload.get("ok", True))
    enqueued = bool(payload.get("enqueued", payload.get("ok", True)))
    if not ok or not enqueued:
        detail_candidates = (
            payload.get("error"),
            payload.get("message"),
            payload.get("detail"),
        )
        raw_detail = next(
            (
                str(candidate).strip()
                for candidate in detail_candidates
                if isinstance(candidate, str) and str(candidate).strip()
            ),
            "",
        )
        detail = normalize_gateway_error_message(raw_detail)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Portfolio sync could not be started: {detail}",
        )

    run_id = payload.get("runId")
    return PortfolioSyncRead(
        ok=ok,
        enqueued=enqueued,
        job_id=PORTFOLIO_SYNC_JOB_ID,
        run_id=str(run_id).strip() if isinstance(run_id, str) and str(run_id).strip() else None,
    )


@router.get("/positions", response_model=list[PortfolioPositionRead])
async def list_portfolio_positions(
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> list[PortfolioPositionRead]:
    """List normalized portfolio positions from the shared workspace."""
    return await SharedPortfolioService(session, ctx.organization.id).list_positions()


@router.get("/positions/{position_key}", response_model=PortfolioPositionDetailRead)
async def get_portfolio_position(
    position_key: str,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PortfolioPositionDetailRead:
    """Get one normalized portfolio position and rationale details."""
    return await SharedPortfolioService(session, ctx.organization.id).get_position(position_key)


@router.put("/positions/{position_key}/rationale", response_model=PortfolioPositionDetailRead)
async def update_portfolio_rationale(
    position_key: str,
    payload: PortfolioRationaleUpdate,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PortfolioPositionDetailRead:
    """Create or update the rationale record for one position."""
    return await SharedPortfolioService(session, ctx.organization.id).upsert_rationale(
        position_key,
        payload,
    )


@router.get("/reviews", response_model=list[PortfolioReviewRead])
async def list_portfolio_reviews(
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> list[PortfolioReviewRead]:
    """List daily portfolio review artifacts from the shared workspace."""
    return await SharedPortfolioService(session, ctx.organization.id).list_reviews()


@router.get("/reviews/{review_id}", response_model=PortfolioReviewRead)
async def get_portfolio_review(
    review_id: str,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PortfolioReviewRead:
    """Get one daily portfolio review artifact."""
    return await SharedPortfolioService(session, ctx.organization.id).get_review(review_id)


@router.post("/review/run", response_model=PortfolioReviewRunResult)
async def run_portfolio_review_endpoint(
    body: PortfolioReviewRunRequest,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PortfolioReviewRunResult:
    """Run the portfolio review engine (sheet rows → snapshot + review artifacts)."""
    from app.core.time import utcnow

    gen = None
    if body.generated_at and str(body.generated_at).strip():
        raw = str(body.generated_at).strip()
        try:
            gen = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            gen = None
    if gen is None:
        gen = utcnow()
    try:
        return await run_portfolio_review(
            session,
            ctx.organization.id,
            positions_rows=body.positions_rows,
            trades_rows=body.trades_rows,
            generated_at=gen,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.get("/roll-events", response_model=list[PortfolioRollEventRead])
async def list_portfolio_roll_events(
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
    days: int = Query(default=7, ge=1, le=90),
) -> list[PortfolioRollEventRead]:
    """List recent portfolio roll events (auto-carry / manual)."""
    raw = await list_roll_events_read(session, ctx.organization.id, days=days)
    return [
        PortfolioRollEventRead(
            id=item["id"],
            rolled_from_position_key=item["rolled_from_position_key"],
            rolled_to_position_key=item["rolled_to_position_key"],
            rolled_at=item["rolled_at"],
            net_credit_cents=int(item["net_credit_cents"]),
            source_trade_ids=list(item.get("source_trade_ids") or []),
            status=str(item.get("status") or "auto_carried"),
            confidence=item.get("confidence"),
        )
        for item in raw
    ]


@router.post("/roll-events/{event_id}/undo", status_code=status.HTTP_204_NO_CONTENT)
async def undo_portfolio_roll_event(
    event_id: UUID,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> None:
    """Dismiss a roll detection and remove auto-carried rationale on the target key."""
    await undo_roll_event(session, ctx.organization.id, event_id)


@router.post("/sync", response_model=PortfolioSyncRead)
async def sync_portfolio_now(
    ctx: OrganizationContext = ORG_ADMIN_DEP,
    session: AsyncSession = SESSION_DEP,
) -> PortfolioSyncRead:
    """Enqueue the configured morning portfolio review job immediately."""
    gateway = await _latest_gateway_for_org(session, ctx.organization.id)
    if gateway is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="An OpenClaw gateway is required before the portfolio can sync.",
        )
    return await _enqueue_portfolio_sync(gateway)
