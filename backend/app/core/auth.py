"""User authentication helpers for local-token and Better Auth JWT modes.

This module resolves an authenticated *user* from inbound HTTP requests.

Auth modes:
- `local`: a single shared bearer token (`LOCAL_AUTH_TOKEN`) for self-hosted
  deployments.
- `betterauth`: Better Auth JWTs (minted by the Next.js app's Better Auth
  instance) verified statelessly against its published JWKS — no network
  call to Google or Better Auth on the request path.

The public surface area is the `get_auth_context*` dependencies, which return an
`AuthContext` used across API routers.

Notes:
- This file documents *why* some choices exist (e.g. claim extraction fallbacks)
  so maintainers can safely modify auth behavior later.
"""

from __future__ import annotations

from dataclasses import dataclass
from hmac import compare_digest
from typing import TYPE_CHECKING, Literal

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.auth_mode import AuthMode
from app.core.betterauth_jwt import (
    BetterAuthJwksUnavailableError,
    BetterAuthTokenError,
    get_better_auth_verifier,
)
from app.core.config import settings
from app.core.logging import get_logger
from app.db import crud
from app.db.session import get_session
from app.models.users import User

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

logger = get_logger(__name__)
security = HTTPBearer(auto_error=False)
SECURITY_DEP = Depends(security)
SESSION_DEP = Depends(get_session)
LOCAL_AUTH_USER_ID = "local-auth-user"
LOCAL_AUTH_EMAIL = "admin@home.local"
LOCAL_AUTH_NAME = "Local User"


@dataclass
class AuthContext:
    """Authenticated user context resolved from inbound auth headers."""

    actor_type: Literal["user"]
    user: User | None = None


def _extract_bearer_token(authorization: str | None) -> str | None:
    """Extract the bearer token from an `Authorization` header.

    Returns `None` for missing/empty headers or non-bearer schemes.

    Note: we do *not* validate the token here; this helper is only responsible for parsing.
    """

    if not authorization:
        return None
    value = authorization.strip()
    if not value:
        return None
    if not value.lower().startswith("bearer "):
        return None
    token = value.split(" ", maxsplit=1)[1].strip()
    return token or None


def _non_empty_str(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    return cleaned or None


def _normalize_email(value: object) -> str | None:
    text = _non_empty_str(value)
    if text is None:
        return None
    return text.lower()


def _extract_claim_email(claims: dict[str, object]) -> str | None:
    """Best-effort extraction of an email address from JWT-like claims.

    Provider payloads vary by token type and SDK version. We try common flat keys first,
    then fall back to an `email_addresses` list (either strings or dict-like entries).

    Returns a normalized lowercase email or `None`.
    """

    for key in ("email", "email_address", "primary_email_address"):
        email = _normalize_email(claims.get(key))
        if email:
            return email

    primary_email_id = _non_empty_str(claims.get("primary_email_address_id"))
    email_addresses = claims.get("email_addresses")
    if not isinstance(email_addresses, list):
        return None

    fallback_email: str | None = None
    for item in email_addresses:
        if isinstance(item, str):
            normalized = _normalize_email(item)
            if normalized and fallback_email is None:
                fallback_email = normalized
            continue
        if not isinstance(item, dict):
            continue
        candidate = _normalize_email(item.get("email_address") or item.get("email"))
        if not candidate:
            continue
        candidate_id = _non_empty_str(item.get("id"))
        if primary_email_id and candidate_id == primary_email_id:
            return candidate
        if fallback_email is None:
            fallback_email = candidate

    return fallback_email


def _extract_claim_name(claims: dict[str, object]) -> str | None:
    """Best-effort extraction of a display name from JWT-like claims."""

    for key in ("name", "full_name"):
        text = _non_empty_str(claims.get(key))
        if text:
            return text

    first = _non_empty_str(claims.get("given_name")) or _non_empty_str(claims.get("first_name"))
    last = _non_empty_str(claims.get("family_name")) or _non_empty_str(claims.get("last_name"))
    parts = [part for part in (first, last) if part]
    if not parts:
        return None
    return " ".join(parts)


async def _get_or_create_local_user(session: AsyncSession) -> User:
    defaults: dict[str, object] = {
        "email": LOCAL_AUTH_EMAIL,
        "name": LOCAL_AUTH_NAME,
    }
    user, _created = await crud.get_or_create(
        session,
        User,
        external_auth_id=LOCAL_AUTH_USER_ID,
        defaults=defaults,
    )
    changed = False
    if not user.email:
        user.email = LOCAL_AUTH_EMAIL
        changed = True
    if not user.name:
        user.name = LOCAL_AUTH_NAME
        changed = True
    if changed:
        session.add(user)
        await session.commit()
        await session.refresh(user)

    from app.services.organizations import ensure_member_for_user

    await ensure_member_for_user(session, user)
    return user


async def _resolve_local_auth_context(
    *,
    request: Request,
    session: AsyncSession,
    required: bool,
) -> AuthContext | None:
    token = _extract_bearer_token(request.headers.get("Authorization"))
    if token is None:
        if required:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return None
    expected = settings.local_auth_token.strip()
    if not expected or not compare_digest(token, expected):
        if required:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return None
    user = await _get_or_create_local_user(session)
    return AuthContext(actor_type="user", user=user)


async def _get_or_create_better_auth_user(
    session: AsyncSession,
    *,
    sub: str,
    claims: dict[str, object],
) -> User:
    """Provision the local user row for a Better Auth identity on first sight.

    Mirrors the local-mode sync: claim-derived email/name fill the row, and
    `ensure_member_for_user` guarantees a membership. The Better Auth JWT
    already carries the user object, so no profile fetch is needed — the
    whole path stays offline.
    """
    sub_log = sub[-6:] if sub else ""
    claim_email = _extract_claim_email(claims)
    claim_name = _extract_claim_name(claims)
    user, created = await crud.get_or_create(
        session,
        User,
        external_auth_id=sub,
        defaults={
            "email": claim_email,
            "name": claim_name,
        },
    )
    changed = False
    if claim_email and user.email != claim_email:
        user.email = claim_email
        changed = True
    if not user.name and claim_name:
        user.name = claim_name
        changed = True
    if changed:
        session.add(user)
        await session.commit()
        await session.refresh(user)
        logger.info(
            "auth.betterauth.user.sync sub=%s created=%s",
            sub_log,
            created,
        )
    else:
        logger.debug("auth.betterauth.user.sync.noop sub=%s", sub_log)
    if not user.email:
        logger.warning("auth.betterauth.user.sync.missing_email sub=%s", sub_log)

    from app.services.organizations import ensure_member_for_user

    await ensure_member_for_user(session, user)
    return user


async def _resolve_better_auth_context(
    *,
    request: Request,
    session: AsyncSession,
    required: bool,
) -> AuthContext | None:
    """Resolve a user from a Better Auth JWT, verified offline against the JWKS.

    Refusals (missing token, bad signature, wrong issuer/audience, expiry,
    unknown key, or JWKS unavailable) map to a 401 on required routes and to
    `None` on optional ones — a JWKS outage never becomes a 500.
    """
    token = _extract_bearer_token(request.headers.get("Authorization"))
    if token is None:
        if required:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return None
    verifier = get_better_auth_verifier()
    try:
        claims = await verifier.verify(token)
    except BetterAuthJwksUnavailableError as exc:
        logger.warning("auth.betterauth.jwks_unavailable %s", exc)
        if required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Better Auth key material unavailable",
            ) from exc
        return None
    except BetterAuthTokenError as exc:
        logger.debug("auth.betterauth.token_refused %s", exc)
        if required:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Better Auth token",
            ) from exc
        return None
    sub = claims.get("sub")
    if not isinstance(sub, str) or not sub:
        if required:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return None
    user = await _get_or_create_better_auth_user(session, sub=sub, claims=claims)
    return AuthContext(actor_type="user", user=user)


async def get_auth_context(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = SECURITY_DEP,
    session: AsyncSession = SESSION_DEP,
) -> AuthContext:
    """Resolve required authenticated user context for the configured auth mode."""
    if settings.auth_mode == AuthMode.LOCAL:
        local_auth = await _resolve_local_auth_context(
            request=request,
            session=session,
            required=True,
        )
        if local_auth is None:  # pragma: no cover
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return local_auth

    if settings.auth_mode == AuthMode.BETTER_AUTH:
        better_auth = await _resolve_better_auth_context(
            request=request,
            session=session,
            required=True,
        )
        if better_auth is None:  # pragma: no cover
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
        return better_auth

    # `AuthMode` only carries `LOCAL` and `BETTER_AUTH` (validated at startup),
    # so the two branches above are exhaustive; this only guards against a
    # future enum value being added without a resolver.
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail=(
            f"Unsupported AUTH_MODE '{settings.auth_mode.value}'; "
            "expected 'local' or 'betterauth'."
        ),
    )


async def get_auth_context_optional(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = SECURITY_DEP,
    session: AsyncSession = SESSION_DEP,
) -> AuthContext | None:
    """Resolve user context if available, otherwise return `None`."""
    if request.headers.get("X-Agent-Token"):
        return None
    if settings.auth_mode == AuthMode.LOCAL:
        return await _resolve_local_auth_context(
            request=request,
            session=session,
            required=False,
        )
    if settings.auth_mode == AuthMode.BETTER_AUTH:
        return await _resolve_better_auth_context(
            request=request,
            session=session,
            required=False,
        )

    # `AuthMode` only carries `LOCAL` and `BETTER_AUTH` (validated at startup),
    # so the branches above are exhaustive; this only guards against a future
    # enum value being added without a resolver.
    return None
