"""Admin-only shared-workspace portfolio endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import col

from app.api.deps import require_org_admin
from app.db.session import get_session
from app.models.gateways import Gateway
from app.schemas.portfolio import (
    PortfolioPositionDetailRead,
    PortfolioPositionRead,
    PortfolioRationaleUpdate,
    PortfolioReviewRead,
    PortfolioSyncRead,
)
from app.services.openclaw.error_messages import normalize_gateway_error_message
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call
from app.services.portfolio import SharedPortfolioService

if TYPE_CHECKING:
    from uuid import UUID

    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.services.organizations import OrganizationContext

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

    run_id = payload.get("runId")
    return PortfolioSyncRead(
        ok=bool(payload.get("ok", True)),
        enqueued=bool(payload.get("enqueued", payload.get("ok", True))),
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
