# ruff: noqa: INP001
"""Settings validation tests for auth-mode configuration."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.core.auth_mode import AuthMode
from app.core.config import Settings

BASE_URL = "http://localhost:8000"
BETTER_AUTH_ISSUER = "http://localhost:3000"
BETTER_AUTH_JWKS_URL = "http://localhost:3000/api/auth/jwks"


def test_local_mode_requires_non_empty_token() -> None:
    with pytest.raises(
        ValidationError,
        match="LOCAL_AUTH_TOKEN must be at least 50 characters and non-placeholder when AUTH_MODE=local",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.LOCAL,
            local_auth_token="",
            base_url=BASE_URL,
        )


def test_local_mode_requires_minimum_length() -> None:
    with pytest.raises(
        ValidationError,
        match="LOCAL_AUTH_TOKEN must be at least 50 characters and non-placeholder when AUTH_MODE=local",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.LOCAL,
            local_auth_token="x" * 49,
            base_url=BASE_URL,
        )


def test_local_mode_rejects_placeholder_token() -> None:
    with pytest.raises(
        ValidationError,
        match="LOCAL_AUTH_TOKEN must be at least 50 characters and non-placeholder when AUTH_MODE=local",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.LOCAL,
            local_auth_token="change-me",
            base_url=BASE_URL,
        )


def test_local_mode_accepts_real_token() -> None:
    token = "a" * 50
    settings = Settings(
        _env_file=None,
        auth_mode=AuthMode.LOCAL,
        local_auth_token=token,
        base_url=BASE_URL,
    )

    assert settings.auth_mode == AuthMode.LOCAL
    assert settings.local_auth_token == token


def test_rejects_retired_clerk_auth_mode() -> None:
    with pytest.raises(
        ValidationError,
        match=r"AUTH_MODE=clerk is no longer supported",
    ):
        Settings(
            _env_file=None,
            auth_mode="clerk",
            base_url=BASE_URL,
        )


def test_base_url_required() -> None:
    with pytest.raises(
        ValidationError,
        match="BASE_URL must be set and non-empty",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.BETTER_AUTH,
            betterauth_jwks_url=BETTER_AUTH_JWKS_URL,
            betterauth_issuer=BETTER_AUTH_ISSUER,
            base_url="  ",
        )


def test_base_url_field_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BASE_URL", raising=False)

    with pytest.raises(ValidationError) as exc_info:
        Settings(
            _env_file=None,
            auth_mode=AuthMode.BETTER_AUTH,
            betterauth_jwks_url=BETTER_AUTH_JWKS_URL,
            betterauth_issuer=BETTER_AUTH_ISSUER,
        )

    text = str(exc_info.value)
    assert "BASE_URL must be set and non-empty" in text


@pytest.mark.parametrize(
    "base_url",
    [
        "localhost:8000",
        "ws://localhost:8000",
    ],
)
def test_base_url_requires_absolute_http_url(base_url: str) -> None:
    with pytest.raises(
        ValidationError,
        match="BASE_URL must be an absolute http\\(s\\) URL",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.BETTER_AUTH,
            betterauth_jwks_url=BETTER_AUTH_JWKS_URL,
            betterauth_issuer=BETTER_AUTH_ISSUER,
            base_url=base_url,
        )


def test_base_url_is_normalized_without_trailing_slash() -> None:
    token = "a" * 50
    settings = Settings(
        _env_file=None,
        auth_mode=AuthMode.LOCAL,
        local_auth_token=token,
        base_url="http://localhost:8000/ ",
    )

    assert settings.base_url == BASE_URL


def test_betterauth_mode_requires_jwks_url() -> None:
    with pytest.raises(
        ValidationError,
        match="BETTER_AUTH_JWKS_URL must be an absolute http\\(s\\) URL when AUTH_MODE=betterauth",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.BETTER_AUTH,
            betterauth_jwks_url="",
            betterauth_issuer=BETTER_AUTH_ISSUER,
            base_url=BASE_URL,
        )


def test_betterauth_mode_rejects_relative_jwks_url() -> None:
    with pytest.raises(
        ValidationError,
        match="BETTER_AUTH_JWKS_URL must be an absolute http\\(s\\) URL when AUTH_MODE=betterauth",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.BETTER_AUTH,
            betterauth_jwks_url="/api/auth/jwks",
            betterauth_issuer=BETTER_AUTH_ISSUER,
            base_url=BASE_URL,
        )


def test_betterauth_mode_requires_issuer() -> None:
    with pytest.raises(
        ValidationError,
        match="BETTER_AUTH_ISSUER must be set and non-empty when AUTH_MODE=betterauth",
    ):
        Settings(
            _env_file=None,
            auth_mode=AuthMode.BETTER_AUTH,
            betterauth_jwks_url=BETTER_AUTH_JWKS_URL,
            betterauth_issuer="",
            base_url=BASE_URL,
        )


def test_betterauth_mode_accepts_config_and_defaults_audience_to_issuer() -> None:
    settings = Settings(
        _env_file=None,
        auth_mode=AuthMode.BETTER_AUTH,
        betterauth_jwks_url=BETTER_AUTH_JWKS_URL,
        betterauth_issuer=BETTER_AUTH_ISSUER,
        base_url=BASE_URL,
    )
    assert settings.auth_mode == AuthMode.BETTER_AUTH
    assert settings.betterauth_jwks_url == BETTER_AUTH_JWKS_URL
    # Audience defaults to the issuer (Better Auth sets iss = aud).
    assert settings.betterauth_audience == BETTER_AUTH_ISSUER


def test_betterauth_mode_keeps_explicit_audience() -> None:
    settings = Settings(
        _env_file=None,
        auth_mode=AuthMode.BETTER_AUTH,
        betterauth_jwks_url=BETTER_AUTH_JWKS_URL,
        betterauth_issuer=BETTER_AUTH_ISSUER,
        betterauth_audience="https://mc.example.com",
        base_url=BASE_URL,
    )
    assert settings.betterauth_audience == "https://mc.example.com"
