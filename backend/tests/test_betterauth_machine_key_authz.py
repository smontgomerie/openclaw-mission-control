# ruff: noqa: INP001
"""Authz coverage for machine clients on Better Auth API keys (wi_e3bac8f3).

Machine clients (MCP, portfolio sync, Cypress) authenticate as a user with a
Better Auth API key (`mc_` prefix): the client exchanges the key for a
short-lived session JWT at the Better Auth origin, and the backend verifies
that JWT offline against JWKS. These tests pin the authorization model:

- a machine-key-shaped JWT (flat Better Auth user claims + ``sub``) resolves
  to the key owner's user, never to a different user;
- a **raw API key** used directly as a bearer token is refused with 401 and
  creates no user/org/membership rows — the backend has no key awareness, so
  a revoked key can mint no token at all;
- a key owned by user B cannot write user A's board (403, no mutation),
  while A's own key succeeds.

Revocation therefore takes effect immediately for new exchanges; already
minted JWTs live out their configured 15-minute lifetime (stated window in
docs/reference/authentication.md).
"""

from __future__ import annotations

import base64
import time
from typing import Any
from uuid import UUID, uuid4

import httpx
import jwt as pyjwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ed25519
from fastapi import APIRouter, FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.sql import sqltypes
from sqlmodel import SQLModel, select
from sqlmodel.ext.asyncio.session import AsyncSession

from app.api.boards import router as boards_router
from app.api.users import router as users_router
from app.core import betterauth_jwt
from app.core.auth_mode import AuthMode
from app.core.config import settings
from app.db.session import get_session
from app.models.agents import Agent
from app.models.boards import Board
from app.models.gateways import Gateway
from app.models.organization_members import OrganizationMember
from app.models.organizations import Organization
from app.models.users import User

BASE_URL = "http://localhost:3000"


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def _ed25519_jwks() -> tuple[Any, list[dict[str, Any]]]:
    """Ed25519 key pair plus JWKS entry (Better Auth's default algorithm)."""
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
    expires_in: float = 900.0,
    **claims: Any,
) -> str:
    """Mint a Better Auth machine-key JWT: flat user claims + iss/aud/exp/sub.

    Mirrors the payload shape of the Better Auth ``jwt()`` plugin's
    ``GET /token`` response, which is what the machine clients exchange
    their API key for.
    """
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": sub,
        "iss": BASE_URL,
        "aud": BASE_URL,
        "exp": now + int(expires_in),
        "iat": now,
        **claims,
    }
    return pyjwt.encode(payload, private, algorithm="EdDSA", headers={"kid": "mc-ed-1"})


class JwksServer:
    """In-process stand-in for the Next.js app's `GET /api/auth/jwks`."""

    def __init__(self, keys: list[dict[str, Any]]) -> None:
        self.keys = keys

    def _handle(self, request: httpx.Request) -> httpx.Response:
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
        settings,
        "betterauth_jwks_url",
        f"http://{uuid4().hex}.jwks.local/api/auth/jwks",
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
    api_v1.include_router(boards_router)
    app.include_router(api_v1)

    async def _override_get_session() -> AsyncSession:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_session] = _override_get_session
    return app


async def _seed_org(
    session_maker: async_sessionmaker[AsyncSession],
    *,
    org_name: str,
    owner_external_id: str,
    owner_email: str,
    board_name: str,
    board_slug: str,
) -> tuple[User, Organization, Board]:
    async with session_maker() as session:
        org = Organization(name=org_name)
        owner = User(external_auth_id=owner_external_id, email=owner_email)
        session.add(org)
        session.add(owner)
        await session.flush()
        # Mirrors the auto-provisioned owner shape (see
        # app.services.organizations.ensure_member_for_user): the all-board
        # grants are what make "owner" able to write every org board.
        session.add(
            OrganizationMember(
                organization_id=org.id,
                user_id=owner.id,
                role="owner",
                all_boards_read=True,
                all_boards_write=True,
            )
        )
        # Board updates require a resolvable gateway with a board-less main
        # agent (app.api.boards._require_gateway), so seed that too.
        gateway = Gateway(
            organization_id=org.id,
            name="Main Gateway",
            url="ws://gateway.example/ws",
            workspace_root="/tmp/openclaw",
        )
        session.add(gateway)
        await session.flush()
        session.add(Agent(gateway_id=gateway.id, name="Main Agent"))
        board = Board(
            organization_id=org.id,
            name=board_name,
            slug=board_slug,
            gateway_id=gateway.id,
        )
        session.add(board)
        await session.commit()
        return owner, org, board


@pytest.fixture(autouse=True)
def _uuid_string_bind(monkeypatch: pytest.MonkeyPatch) -> None:
    """Let string UUIDs bind against `Uuid` columns under ASGI tests.

    Production runs Postgres (string path params bind fine natively); the
    SQLite test backend stores UUIDs as CHAR(32) and its bind processor
    only accepts UUID instances, so a route like
    ``PATCH /api/v1/boards/{board_id}`` would 500 on the string param.
    This test-only shim emulates the production behavior.

    The shim patches ``Uuid.bind_processor`` on the class rather than
    swapping the shared ``Column.type`` instances: SQLAlchemy memoizes the
    ``type`` of shared ``AnnotatedColumn`` wrappers for its statement
    cache-key traversal, so a swapped metadata column type would keep the
    stale processor and pollute the process-wide compile cache across test
    files (order-dependent failures). The class-level patch is scoped to
    this test by ``monkeypatch`` and leaves the shared metadata untouched.
    """

    original = sqltypes.Uuid.bind_processor

    def tolerant(self: sqltypes.Uuid, dialect: Any):
        proc = original(self, dialect)
        if proc is None:
            return proc

        def process(value: Any):
            if isinstance(value, str):
                value = UUID(value)
            return proc(value)

        return process

    monkeypatch.setattr(sqltypes.Uuid, "bind_processor", tolerant)


@pytest.mark.asyncio
async def test_machine_key_jwt_resolves_to_key_owner(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A JWT minted for a machine API key lands on the owner's user row."""
    private, jwks_keys = _ed25519_jwks()
    JwksServer(jwks_keys).install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    owner, org, _board = await _seed_org(
        session_maker,
        org_name="Ops Org",
        owner_external_id="ba-machine-a",
        owner_email="ada@corp.example.com",
        board_name="Ops",
        board_slug="ops",
    )
    app = _build_test_app(session_maker)
    token = _issue(
        private,
        sub="ba-machine-a",
        email="ada@corp.example.com",
        name="MCP Mission Control",
        id="ba-machine-a",
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
            # The JWT's `sub` must resolve to the key owner's user, not any
            # other user in the instance.
            assert body["id"] == str(owner.id)
            assert body["external_auth_id"] == "ba-machine-a"
            assert body["email"] == "ada@corp.example.com"
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_raw_api_key_as_bearer_is_refused_and_mutates_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A raw `mc_` key is not a JWT: the backend must 401 and create no rows.

    This is the revocation guarantee — the backend never accepts keys
    directly, so a revoked key (which no longer mints a JWT at Better Auth)
    authenticates nowhere and cannot provision anything.
    """
    _private, jwks_keys = _ed25519_jwks()
    JwksServer(jwks_keys).install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    app = _build_test_app(session_maker)
    raw_key = "mc_" + "z" * 64

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            res = await client.get(
                "/api/v1/users/me",
                headers={"Authorization": f"Bearer {raw_key}"},
            )
            assert res.status_code == 401, res.text
            # Refusal without mutation: no auto-provisioned rows.
            async with session_maker() as session:
                assert (await session.exec(select(User))).all() == []
                assert (await session.exec(select(Organization))).all() == []
                assert (await session.exec(select(OrganizationMember))).all() == []
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_cross_user_key_cannot_write_foreign_board(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Named refused actor: user B's key cannot write user A's board.

    User A owns the org; user B (a second machine key) has no membership in
    A's org and must get 403 with the board left untouched.
    """
    private, jwks_keys = _ed25519_jwks()
    JwksServer(jwks_keys).install(monkeypatch)
    _configure_betterauth_mode(monkeypatch)

    engine = await _make_engine()
    session_maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    owner, org, board = await _seed_org(
        session_maker,
        org_name="Ops Org",
        owner_external_id="ba-machine-a",
        owner_email="ada@corp.example.com",
        board_name="Ops",
        board_slug="ops",
    )
    app = _build_test_app(session_maker)
    owner_token = _issue(
        private,
        sub="ba-machine-a",
        email="ada@corp.example.com",
        name="MCP Mission Control",
    )
    intruder_token = _issue(
        private,
        sub="ba-machine-b",
        email="grace@corp.example.com",
        name="Portfolio Sync",
    )

    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://testserver",
        ) as client:
            # The owner's machine key can write its own board.
            res = await client.patch(
                f"/api/v1/boards/{board.id}",
                json={"description": "updated by A"},
                headers={"Authorization": f"Bearer {owner_token}"},
            )
            assert res.status_code == 200, res.text
            assert res.json()["description"] == "updated by A"

            # The refused actor: user B's key against A's org board.
            denied = await client.patch(
                f"/api/v1/boards/{board.id}",
                json={"description": "torn by B"},
                headers={"Authorization": f"Bearer {intruder_token}"},
            )
            assert denied.status_code == 403, denied.text
            assert denied.json()["detail"] == "No org access"

            # No-mutation assertion: B's attempt changed nothing.
            async with session_maker() as session:
                board_in_db = await session.get(Board, board.id)
                assert board_in_db.description == "updated by A"
                assert board_in_db.organization_id == org.id
    finally:
        await engine.dispose()
