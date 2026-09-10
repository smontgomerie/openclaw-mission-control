# ruff: noqa: INP001
"""Integration tests for `AUTH_MODE=betterauth` (offline JWKS verification).

The Better Auth instance lives in the Next.js app; here we stand in for its
`GET /api/auth/jwks` endpoint with in-process JWKS documents (RSA and
Ed25519 — the two families Better Auth's `jwt()` plugin can issue) and
check that the backend resolves users from those JWTs without ever calling
Google or Better Auth, and that every refusal creates no rows.
"""

from __future__ import annotations

import base64
import time
from typing import Any
from uuid import uuid4

import httpx
import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519, rsa
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession
from starlette.requests import Request

from app.api.users import router as users_router
from app.core import auth as auth_module
from app.core import betterauth_jwt
from app.core.auth import get_auth_context_optional
from app.core.auth_mode import AuthMode
from app.core.config import settings
from app.db.session import get_session
from app.models.organization_members import OrganizationMember
from app.models.organizations import Organization
from app.models.users import User

BASE_URL = "http://localhost:3000"


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _rsa_jwks() -> tuple[Any, list[dict[str, Any]]]:
    """An RSA key pair plus its JWKS entry (RS256)."""
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = private.public_key().public_numbers()
    key: dict[str, Any] = {
        "kty": "RSA",
        "n": _b64url(numbers.n.to_bytes(256, "big")),
        "e": _b64url(numbers.e.to_bytes(3, "big")),
        "alg": "RS256",
        "use": "sig",
        "kid": "mc-rsa-1",
    }
    return private, [key]


def _ed25519_jwks() -> tuple[Any, list[dict[str, Any]]]:
    """An Ed25519 key pair plus its JWKS entry (EdDSA — Better Auth's default)."""
    private = ed25519.Ed25519PrivateKey.generate()
    x = private.public_key().public_bytes_raw()
    key: dict[str, Any] = {
        "kty": "OKP",
        "crv": "Ed25519",
        "x": _b64url(x),
        "alg": "EdDSA",
        "use": "sig",
        "kid": "mc-ed-1",
    }
    return private, [key]


def _issue(
    private: Any,
    *,
    sub: str,
    issuer: str,
    audience: str,
    alg: str,
    expires_in: float = 900.0,
    kid: str | None = None,
    **claims: Any,
) -> str:
    """Mint a Better Auth-style JWT: the session user object plus iss/aud/exp/sub."""
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": sub,
        "iss": issuer,
        "aud": audience,
        "exp": now + int(expires_in),
        "iat": now,
        **claims,
    }
    header = {"kid": kid} if kid is not None else None
    return pyjwt.encode(payload, private, algorithm=alg, headers=header)


class JwksServer:
    """In-process stand-in for the Next.js app's `GET /api/auth/jwks`."""

    def __init__(self, keys: list[dict[str, Any]]) -> None:
        self.keys = keys
        self.down = False
        self.request_count = 0

    def _handle(self, request: httpx.Request) -> httpx.Response:
        self.request_count += 1
        if self.down:
            raise httpx.ConnectError("JWKS endpoint down", request=request)
        return httpx.Response(200, json={"keys": self.keys})

    def install(self, monkeypatch: pytest.MonkeyPatch) -> None:
        real = httpx.AsyncClient

        def factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
            kwargs["transport"] = httpx.MockTransport(self._handle)
            return real(*args, **kwargs)

        # The module references `httpx.AsyncClient` at call time, so this
        # redirect is seen by the verifier's fetcher (and reverted per test).
        monkeypatch.setattr(betterauth_jwt.httpx, "AsyncClient", factory)


def _configure_betterauth_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    # A unique JWKS URL per test gives each test its own verifier/cache
    # (the process-wide registry is keyed by the config triple).
    monkeypatch.setattr(settings, "auth_mode", AuthMode.BETTER_AUTH)
    monkeypatch.setattr(
        settings, "betterauth_jwks_url", f"http://{uuid4().hex}.jwks.local/api/auth/jwks"
    )
    monkeypatch.setattr(settings, "betterauth_issuer", BASE_URL)
    monkeypatch.setattr(settings, "betterauth_audience", BASE_URL)


async def _make_engine() -> AsyncEngine:
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.connect() as conn, conn.begin():
        await conn.run_sync(SQLModel.metadata.create_all)
    return engine


def _build_test_app(session_maker: async_sessionmaker[AsyncSession]) -> FastAPI:
    app = FastAPI()
    api_v1 = APIRouter(prefix="/api/v1")
    api_v1.include_router(users_router)
    app.include_router(api_v1)

    async def _override_get_session() -> AsyncSession:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    app.dependency_overrides[auth_module.get_session] = _override_get_session
    return app


async def _row_counts(
    session_maker: async_sessionmaker[AsyncSession],
) -> tuple[list[User], list[Organization], list[OrganizationMember]]:
    async with session_maker() as session:
        users = (await session.exec(select(User))).all()
        organizations = (await session.exec(select(Organization))).all()
        memberships = (await session.exec(select(OrganizationMember))).all()
    return users, organizations, memberships


@pytest.mark.asyncio
async def test_valid_ed25519_token_provisions_user_and_membership_once(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _ed25519_jwks()
    server = JwksServer(jwks_keys)
    server.install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = _build_test_app(session_maker)
    token = _issue(
        private,
        sub="ba-user-1",
        issuer=BASE_URL,
        audience=BASE_URL,
        alg="EdDSA",
        kid="mc-ed-1",
        email="ada@corp.example.com",
        name="Ada Lovelace",
    )

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["external_auth_id"] == "ba-user-1"
            assert body["email"] == "ada@corp.example.com"
            assert body["name"] == "Ada Lovelace"

            users, organizations, memberships = await _row_counts(session_maker)
            assert len(users) == 1
            assert users[0].external_auth_id == "ba-user-1"
            assert len(organizations) == 1
            assert len(memberships) == 1
            assert memberships[0].user_id == users[0].id

            # A second request reuses the provisioned row, not a new one.
            repeat = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert repeat.status_code == 200
            assert repeat.json()["id"] == body["id"]
            users, _orgs, memberships = await _row_counts(session_maker)
            assert len(users) == 1
            assert len(memberships) == 1
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_valid_rsa_token_resolves_user(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _rsa_jwks()
    server = JwksServer(jwks_keys)
    server.install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = _build_test_app(session_maker)
    token = _issue(
        private,
        sub="ba-user-rsa",
        issuer=BASE_URL,
        audience=BASE_URL,
        alg="RS256",
        kid="mc-rsa-1",
        email="rsa@corp.example.com",
    )
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert res.status_code == 200, res.text
            assert res.json()["external_auth_id"] == "ba-user-rsa"
            users, _orgs, _memberships = await _row_counts(session_maker)
            assert len(users) == 1
    finally:
        await engine.dispose()


async def _refused_creates_nothing(
    monkeypatch: pytest.MonkeyPatch,
    *,
    token: str | None,
    jwks_keys: list[dict[str, Any]],
    jwks_down: bool = False,
) -> None:
    server = JwksServer(jwks_keys)
    server.down = jwks_down
    server.install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = _build_test_app(session_maker)
    headers = {"Authorization": f"Bearer {token}"} if token is not None else {}
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get("/api/v1/users/me", headers=headers)
            # Refused, not an error: the route must not 500.
            assert res.status_code == 401, res.text
            users, organizations, memberships = await _row_counts(session_maker)
            assert users == []
            assert organizations == []
            assert memberships == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_expired_token_refused_with_no_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _ed25519_jwks()
    token = _issue(
        private,
        sub="ba-user-expired",
        issuer=BASE_URL,
        audience=BASE_URL,
        alg="EdDSA",
        kid="mc-ed-1",
        expires_in=-600.0,
    )
    await _refused_creates_nothing(monkeypatch, token=token, jwks_keys=jwks_keys)


@pytest.mark.asyncio
async def test_wrong_key_refused_with_no_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The JWKS only contains key A; the token is signed with key B under A's
    # kid, so the signature can never verify (this is the "token signed by
    # the wrong key" refusal — not the "unknown kid" one).
    known_kid = "mc-ed-wrong"
    key_a = _ed25519_jwks()[1]
    key_a[0]["kid"] = known_kid
    other_private, _ = _ed25519_jwks()
    token = _issue(
        other_private,
        sub="ba-user-wrongkey",
        issuer=BASE_URL,
        audience=BASE_URL,
        alg="EdDSA",
        kid=known_kid,
    )
    await _refused_creates_nothing(monkeypatch, token=token, jwks_keys=[key_a])


@pytest.mark.asyncio
async def test_issuer_mismatch_refused_with_no_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A token minted by another Better Auth instance (its own issuer origin)
    # must be refused even though the signature would verify.
    private, jwks_keys = _ed25519_jwks()
    token = _issue(
        private,
        sub="ba-user-foreign",
        issuer="http://other-tenant.example",
        audience=BASE_URL,
        alg="EdDSA",
        kid="mc-ed-1",
    )
    await _refused_creates_nothing(monkeypatch, token=token, jwks_keys=jwks_keys)


@pytest.mark.asyncio
async def test_audience_mismatch_refused_with_no_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _ed25519_jwks()
    token = _issue(
        private,
        sub="ba-user-badaud",
        issuer=BASE_URL,
        audience="http://some-other-audience.example",
        alg="EdDSA",
        kid="mc-ed-1",
    )
    await _refused_creates_nothing(monkeypatch, token=token, jwks_keys=jwks_keys)


@pytest.mark.asyncio
async def test_missing_token_refused_with_no_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _private, jwks_keys = _ed25519_jwks()
    await _refused_creates_nothing(monkeypatch, token=None, jwks_keys=jwks_keys)


@pytest.mark.asyncio
async def test_unknown_kid_refused_with_no_rows(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _ed25519_jwks()
    # Token header names a kid the JWKS does not have (e.g. rotated out).
    token = _issue(
        private,
        sub="ba-user-unknownkid",
        issuer=BASE_URL,
        audience=BASE_URL,
        alg="EdDSA",
        kid="mc-ed-rotated",
    )
    await _refused_creates_nothing(monkeypatch, token=token, jwks_keys=jwks_keys)


@pytest.mark.asyncio
async def test_jwks_outage_before_first_fetch_refuses_not_500(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _ed25519_jwks()
    token = _issue(
        private,
        sub="ba-user-outage",
        issuer=BASE_URL,
        audience=BASE_URL,
        alg="EdDSA",
    )
    # Nothing cached yet: a JWKS failure must fail closed with 401, not
    # turn every route into a 500.
    await _refused_creates_nothing(monkeypatch, token=token, jwks_keys=jwks_keys, jwks_down=True)


@pytest.mark.asyncio
async def test_stale_cache_serves_tokens_after_jwks_outage(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _ed25519_jwks()
    server = JwksServer(jwks_keys)
    server.install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)
    token = _issue(
        private,
        sub="ba-user-cached",
        issuer=BASE_URL,
        audience=BASE_URL,
        alg="EdDSA",
        kid="mc-ed-1",
    )

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = _build_test_app(session_maker)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            ok = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert ok.status_code == 200, ok.text

            # JWKS goes down: the cached keys must keep verifying, and no
            # further fetches are attempted while the cache is fresh.
            server.down = True
            cached = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert cached.status_code == 200, cached.text
            assert cached.json()["id"] == ok.json()["id"]
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_optional_context_returns_none_for_invalid_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    private, jwks_keys = _ed25519_jwks()
    server = JwksServer(jwks_keys)
    server.install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)
    token = _issue(
        private,
        sub="ba-user-optional",
        issuer="http://not-the-configured-issuer.example",
        audience=BASE_URL,
        alg="EdDSA",
        kid="mc-ed-1",
    )

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    scope = {
        "type": "http",
        "method": "GET",
        "headers": [(b"authorization", f"Bearer {token}".encode())],
    }
    request = Request(scope)
    try:
        async with session_maker() as session:
            result = await get_auth_context_optional(
                request=request,
                credentials=None,
                session=session,
            )
        assert result is None
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_agent_token_path_short_circuits_before_jwks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # X-Agent-Token requests return early from the optional resolver — agent
    # auth must stay independent of user auth modes: no JWKS fetch at all.
    _private, jwks_keys = _ed25519_jwks()
    server = JwksServer(jwks_keys)
    server.install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    scope = {
        "type": "http",
        "method": "POST",
        "headers": [(b"x-agent-token", b"some-agent-token")],
    }
    request = Request(scope)
    try:
        async with session_maker() as session:
            result = await get_auth_context_optional(
                request=request,
                credentials=None,
                session=session,
            )
        assert result is None
        assert server.request_count == 0
        users, _orgs, _memberships = await _row_counts(session_maker)
        assert users == []
    finally:
        await engine.dispose()
