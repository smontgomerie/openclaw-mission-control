# ruff: noqa: SLF001

from __future__ import annotations

from types import SimpleNamespace
from typing import Any

import pytest

from app.core import auth
from app.core.auth_mode import AuthMode
from app.models.users import User


class _FakeSession:
    async def commit(self) -> None:  # pragma: no cover
        raise AssertionError("commit should not be called in these tests")


@pytest.mark.asyncio
async def test_get_auth_context_optional_returns_none_for_agent_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth.settings, "auth_mode", AuthMode.LOCAL)
    monkeypatch.setattr(auth.settings, "local_auth_token", "expected-token")

    async def _boom(_session: Any) -> Any:  # pragma: no cover
        raise AssertionError("_get_or_create_local_user should not be called")

    monkeypatch.setattr(auth, "_get_or_create_local_user", _boom)

    out = await auth.get_auth_context_optional(  # type: ignore[arg-type]
        request=SimpleNamespace(headers={"X-Agent-Token": "agent"}),
        credentials=None,
        session=_FakeSession(),  # type: ignore[arg-type]
    )
    assert out is None


@pytest.mark.asyncio
async def test_get_auth_context_local_mode_requires_valid_bearer_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth.settings, "auth_mode", AuthMode.LOCAL)
    monkeypatch.setattr(auth.settings, "local_auth_token", "expected-token")

    async def _fake_local_user(_session: Any) -> User:
        return User(external_auth_id="local-auth-user", email="local@localhost", name="Local User")

    monkeypatch.setattr(auth, "_get_or_create_local_user", _fake_local_user)

    ctx = await auth.get_auth_context(  # type: ignore[arg-type]
        request=SimpleNamespace(headers={"Authorization": "Bearer expected-token"}),
        credentials=None,
        session=_FakeSession(),  # type: ignore[arg-type]
    )

    assert ctx.actor_type == "user"
    assert ctx.user is not None
    assert ctx.user.external_auth_id == "local-auth-user"


@pytest.mark.asyncio
async def test_get_auth_context_optional_local_mode_returns_none_without_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth.settings, "auth_mode", AuthMode.LOCAL)
    monkeypatch.setattr(auth.settings, "local_auth_token", "expected-token")

    async def _boom(_session: Any) -> User:  # pragma: no cover
        raise AssertionError("_get_or_create_local_user should not be called")

    monkeypatch.setattr(auth, "_get_or_create_local_user", _boom)

    out = await auth.get_auth_context_optional(  # type: ignore[arg-type]
        request=SimpleNamespace(headers={}),
        credentials=None,
        session=_FakeSession(),  # type: ignore[arg-type]
    )
    assert out is None
