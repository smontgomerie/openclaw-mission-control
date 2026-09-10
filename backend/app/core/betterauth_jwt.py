"""Stateless Better Auth JWT verification against a published JWKS.

In `AUTH_MODE=betterauth` the backend resolves users from Better Auth JWTs
sent as `Authorization: Bearer <jwt>`. Those tokens are signed by the
Better Auth instance that runs inside the Next.js app, which publishes its
public keys at `GET <origin>/api/auth/jwks` (see
`frontend/src/lib/better-auth.ts`). The backend never talks to Google or to
Better Auth on the request path — only to the JWKS endpoint, and only to
refresh key material.

Design notes:
- Verification is offline per request: the JWKS document is fetched lazily
  and cached for `JWKS_CACHE_TTL_SECONDS` (at most one fetch per ten-minute
  window, plus a bounded re-fetch when the token's `kid` is missing from
  the cache, e.g. after a key rotation).
- JWKS outages degrade, they do not take the API down: a stale cache keeps
  verifying (keys just age slowly), and when nothing is cached yet the
  verification fails closed with a 401 instead of a 500 on every route.
- Tokens are verified with PyJWT against the JWK selected by `kid`/`alg`:
  signature, `iss`, `aud`, `exp`, and a non-empty `sub`. A token minted by
  some *other* Better Auth instance (different issuer/audience) will not
  verify — that is the "wrong instance" refusal.
- Supported key material mirrors what Better Auth's `jwt()` plugin can
  actually issue: RSA/PS (`kty=RSA`) and EdDSA (`kty=OKP`, Ed25519/Ed448;
  its default is Ed25519).
"""

from __future__ import annotations

import asyncio
import base64
import time
from typing import Mapping

import httpx
import jwt as pyjwt
from cryptography.hazmat.primitives.asymmetric.ed448 import Ed448PublicKey
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.hazmat.primitives.asymmetric.rsa import RSAPublicKey, RSAPublicNumbers

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

#: How long a fetched JWKS document is trusted before a re-fetch.
JWKS_CACHE_TTL_SECONDS = 600.0
#: Network timeout for a single JWKS fetch.
JWKS_FETCH_TIMEOUT_SECONDS = 5.0
#: After re-fetching for a kid that is still missing, do not re-fetch
#: again for this long (keeps rejected tokens from hammering the endpoint).
MISSING_KID_REFETCH_LIMIT_SECONDS = 60.0

_RSA_ALGORITHMS = frozenset({"RS256", "RS384", "RS512", "PS256", "PS384", "PS512"})
_SUPPORTED_ALGORITHMS = _RSA_ALGORITHMS | frozenset({"EdDSA"})

PublicKey = Ed25519PublicKey | Ed448PublicKey | RSAPublicKey


class BetterAuthJwksUnavailableError(RuntimeError):
    """No usable JWKS key material: the endpoint is down, unreachable, or
    does not contain a key for the requested kid."""


class BetterAuthTokenError(ValueError):
    """The token itself was refused: malformed, wrong signature, wrong
    issuer/audience, expired, or a JWKS entry that cannot be used."""


def _b64url_decode(value: object) -> bytes | None:
    """Base64url-decode a JWK component; `None` when absent or malformed."""
    if not isinstance(value, str) or not value:
        return None
    try:
        return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))
    except ValueError:
        return None


def _public_key_from_jwk(jwk: Mapping[str, object], alg: str) -> PublicKey:
    """Build a verification key from a single JWKS entry.

    Raises `BetterAuthTokenError` for anything unusable or out of the
    supported set (unknown kty/crv, `alg` mismatch between the key and the
    token header, malformed components).
    """
    advertised = jwk.get("alg")
    if isinstance(advertised, str) and advertised != alg:
        raise BetterAuthTokenError(
            f"JWKS key advertises alg {advertised!r} but the token header uses {alg!r}"
        )
    kty = jwk.get("kty")
    if kty == "RSA":
        if alg not in _RSA_ALGORITHMS:
            raise BetterAuthTokenError(f"algorithm {alg!r} cannot be verified with an RSA JWK")
        modulus = _b64url_decode(jwk.get("n"))
        exponent = _b64url_decode(jwk.get("e"))
        if modulus is None or exponent is None:
            raise BetterAuthTokenError("RSA JWK is missing base64url 'n'/'e' components")
        try:
            return RSAPublicNumbers(
                int.from_bytes(exponent, "big"),
                int.from_bytes(modulus, "big"),
            ).public_key()
        except ValueError as exc:
            raise BetterAuthTokenError(f"unusable RSA JWK: {exc}") from exc
    if kty == "OKP":
        if alg != "EdDSA":
            raise BetterAuthTokenError(f"algorithm {alg!r} cannot be verified with an OKP JWK")
        x_bytes = _b64url_decode(jwk.get("x"))
        crv = jwk.get("crv")
        if crv == "Ed25519":
            if x_bytes is None or len(x_bytes) != 32:
                raise BetterAuthTokenError("Ed25519 JWK 'x' must decode to 32 bytes")
            return Ed25519PublicKey.from_public_bytes(x_bytes)
        if crv == "Ed448":
            if x_bytes is None or len(x_bytes) != 57:
                raise BetterAuthTokenError("Ed448 JWK 'x' must decode to 57 bytes")
            return Ed448PublicKey.from_public_bytes(x_bytes)
        raise BetterAuthTokenError(f"unsupported OKP curve {crv!r}")
    raise BetterAuthTokenError(f"unsupported JWK kty {kty!r}")


def _jwk_is_usable(jwk: Mapping[str, object], now_wall: float) -> bool:
    """A JWKS entry may carry a unix-time `exp` (Better Auth key rotation)."""
    exp = jwk.get("exp")
    if isinstance(exp, (int, float)) and not isinstance(exp, bool):
        return exp >= now_wall
    return True


def _parse_jwks_document(payload: object) -> dict[str, dict[str, object]]:
    """Parse a JWKS document into `{kid: jwk}`."""
    if not isinstance(payload, dict):
        raise BetterAuthJwksUnavailableError("JWKS body is not a JSON object")
    keys = payload.get("keys")
    if not isinstance(keys, list):
        raise BetterAuthJwksUnavailableError("JWKS body has no 'keys' array")
    parsed: dict[str, dict[str, object]] = {}
    for entry in keys:
        if not isinstance(entry, Mapping):
            continue
        kid = entry.get("kid")
        if isinstance(kid, str) and kid:
            parsed[kid] = dict(entry)
    return parsed


async def _fetch_jwks(jwks_url: str) -> dict[str, dict[str, object]]:
    """Fetch and parse the JWKS document.

    Raises `BetterAuthJwksUnavailableError` for any failure mode (network
    error, non-200, malformed body) — never propagates a 500 to callers.
    """
    try:
        async with httpx.AsyncClient(timeout=JWKS_FETCH_TIMEOUT_SECONDS) as client:
            response = await client.get(jwks_url)
    except httpx.HTTPError as exc:
        raise BetterAuthJwksUnavailableError(f"fetch of {jwks_url} failed: {exc}") from exc
    if response.status_code != 200:
        raise BetterAuthJwksUnavailableError(
            f"fetch of {jwks_url} returned HTTP {response.status_code}"
        )
    try:
        payload: object = response.json()
    except ValueError as exc:
        raise BetterAuthJwksUnavailableError("JWKS body is not valid JSON") from exc
    return _parse_jwks_document(payload)


class BetterAuthJwtVerifier:
    """Verify Better Auth JWTs against one lazily-fetched, cached JWKS."""

    def __init__(
        self,
        jwks_url: str,
        issuer: str,
        audience: str | None = None,
        cache_ttl_seconds: float = JWKS_CACHE_TTL_SECONDS,
    ) -> None:
        self.jwks_url = jwks_url
        self.issuer = issuer
        self.audience = audience
        self.cache_ttl_seconds = cache_ttl_seconds
        self._keys: dict[str, dict[str, object]] = {}
        self._last_fetched_at: float = 0.0
        self._last_miss_refetch_at: float = 0.0
        self._lock = asyncio.Lock()

    @property
    def _expected_audience(self) -> str:
        """Better Auth's jwt plugin sets `aud` = `iss` unless configured."""
        return self.audience or self.issuer

    async def verify(self, token: str) -> dict[str, object]:
        """Verify `token` and return its claims.

        Raises `BetterAuthTokenError` when the token is refused (signature,
        issuer, audience, expiry, shape) and `BetterAuthJwksUnavailableError`
        when no key material is available for it.
        """
        try:
            header = pyjwt.get_unverified_header(token)
        except pyjwt.PyJWTError as exc:
            raise BetterAuthTokenError(f"malformed JWT: {exc}") from exc
        alg = header.get("alg")
        kid = header.get("kid")
        if not isinstance(alg, str) or alg not in _SUPPORTED_ALGORITHMS:
            raise BetterAuthTokenError(f"token header has an unsupported or missing 'alg': {alg!r}")
        if not isinstance(kid, str) or not kid:
            raise BetterAuthTokenError("token header is missing 'kid'")
        key = await self._resolve_public_key(kid, alg)
        if key is None:
            raise BetterAuthJwksUnavailableError(f"no usable JWKS key for kid {kid!r}")
        try:
            claims = pyjwt.decode(
                token,
                key,
                algorithms=[alg],
                issuer=self.issuer,
                audience=self._expected_audience,
                options={"require": ["sub", "iss", "aud", "exp"]},
            )
        except pyjwt.PyJWTError as exc:
            raise BetterAuthTokenError(f"JWT verification failed: {exc}") from exc
        sub = claims.get("sub")
        if not isinstance(sub, str) or not sub:
            raise BetterAuthTokenError("JWT has no usable 'sub' claim")
        return claims

    async def _resolve_public_key(self, kid: str, alg: str) -> PublicKey | None:
        """Find the public key for `kid`, fetching the JWKS lazily.

        Fast path: cached and fresh. Slow path: a single-flight re-fetch;
        on failure it falls back to the stale cache (or returns `None`,
        which the resolver maps to a 401 — never a 500).
        """
        now = time.monotonic()
        cached = self._keys.get(kid)
        if (
            cached is not None
            and _jwk_is_usable(cached, time.time())
            and now - self._last_fetched_at < self.cache_ttl_seconds
        ):
            return _public_key_from_jwk(cached, alg)
        async with self._lock:
            now = time.monotonic()
            cached = self._keys.get(kid)
            if (
                cached is not None
                and _jwk_is_usable(cached, time.time())
                and now - self._last_fetched_at < self.cache_ttl_seconds
            ):
                return _public_key_from_jwk(cached, alg)
            unknown_kid = cached is None
            if unknown_kid and now - self._last_miss_refetch_at < MISSING_KID_REFETCH_LIMIT_SECONDS:
                # We already re-fetched for this missing kid recently; keep
                # rejected tokens from hammering the endpoint.
                return None
            try:
                self._keys = await _fetch_jwks(self.jwks_url)
                self._last_fetched_at = time.monotonic()
            except BetterAuthJwksUnavailableError as exc:
                logger.warning(
                    "auth.betterauth.jwks.fetch_failed url=%s reason=%s stale_cache_kept=%s",
                    self.jwks_url,
                    exc,
                    bool(self._keys),
                )
                fallback = self._keys.get(kid)
                if fallback is not None and _jwk_is_usable(fallback, time.time()):
                    return _public_key_from_jwk(fallback, alg)
                raise
            if self._keys.get(kid) is None:
                self._last_miss_refetch_at = time.monotonic()
                return None
            return _public_key_from_jwk(self._keys[kid], alg)


_VERIFIERS: dict[tuple[str, str, str], BetterAuthJwtVerifier] = {}


def get_better_auth_verifier() -> BetterAuthJwtVerifier:
    """The process-wide verifier for the currently configured settings.

    Keyed by (JWKS URL, issuer, audience) so tests (which monkeypatch
    `settings`) get a fresh, isolated verifier per configuration while the
    production server builds and reuses one per process.
    """
    jwks_url = settings.betterauth_jwks_url.strip()
    issuer = settings.betterauth_issuer.strip()
    audience = settings.betterauth_audience.strip() or issuer
    key = (jwks_url, issuer, audience)
    verifier = _VERIFIERS.get(key)
    if verifier is None:
        verifier = BetterAuthJwtVerifier(jwks_url, issuer, audience)
        _VERIFIERS[key] = verifier
    return verifier


def reset_better_auth_verifiers() -> None:
    """Drop cached verifiers (test hook)."""
    _VERIFIERS.clear()
