"""OpenClaw-compatible device identity and connect-signature helpers."""

from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from time import time
from typing import Any, cast

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)

from app.core.logging import get_logger

DEFAULT_DEVICE_IDENTITY_PATH = Path.home() / ".openclaw" / "identity" / "device.json"
DEFAULT_DEVICE_IDENTITY_FALLBACK_PATH = Path.home() / ".cache" / "openclaw" / "identity" / "device.json"
SHARED_WORKSPACE_DEVICE_IDENTITY_SUFFIX = Path(".system") / "gateway-device-identity" / "device.json"
logger = get_logger(__name__)


@dataclass(frozen=True)
class DeviceIdentity:
    """Persisted gateway device identity used for connect signatures."""

    device_id: str
    public_key_pem: str
    private_key_pem: str


def _identity_path() -> Path:
    raw = os.getenv("OPENCLAW_GATEWAY_DEVICE_IDENTITY_PATH", "").strip()
    if raw:
        return Path(raw).expanduser().resolve()
    return DEFAULT_DEVICE_IDENTITY_PATH


def _identity_path_candidates() -> list[Path]:
    primary = _identity_path()
    candidates: list[Path] = [primary]
    raw_workspace_root = os.getenv("OPENCLAW_SHARED_WORKSPACE_ROOT", "").strip()
    if raw_workspace_root:
        candidates.append(
            Path(raw_workspace_root).expanduser().resolve() / SHARED_WORKSPACE_DEVICE_IDENTITY_SUFFIX
        )
    candidates.append(DEFAULT_DEVICE_IDENTITY_FALLBACK_PATH)

    deduped: list[Path] = []
    seen: set[Path] = set()
    for candidate in candidates:
        if candidate in seen:
            continue
        seen.add(candidate)
        deduped.append(candidate)
    return deduped


def _base64url_encode(raw: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def _derive_public_key_raw(public_key_pem: str) -> bytes:
    loaded = serialization.load_pem_public_key(public_key_pem.encode("utf-8"))
    if not isinstance(loaded, Ed25519PublicKey):
        msg = "device identity public key is not Ed25519"
        raise ValueError(msg)
    return loaded.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )


def _derive_device_id(public_key_pem: str) -> str:
    return hashlib.sha256(_derive_public_key_raw(public_key_pem)).hexdigest()


def _write_identity(path: Path, identity: DeviceIdentity) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": 1,
        "deviceId": identity.device_id,
        "publicKeyPem": identity.public_key_pem,
        "privateKeyPem": identity.private_key_pem,
        "createdAtMs": int(time() * 1000),
    }
    path.write_text(f"{json.dumps(payload, indent=2)}\n", encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        # Best effort on platforms/filesystems that ignore chmod.
        pass


def _load_identity(path: Path) -> DeviceIdentity | None:
    if not path.exists():
        return None
    payload = cast(dict[str, Any], json.loads(path.read_text(encoding="utf-8")))
    device_id = str(payload.get("deviceId") or "").strip()
    public_key_pem = str(payload.get("publicKeyPem") or "").strip()
    private_key_pem = str(payload.get("privateKeyPem") or "").strip()
    if not (device_id and public_key_pem and private_key_pem):
        return None

    derived_id = _derive_device_id(public_key_pem)
    identity = DeviceIdentity(
        device_id=derived_id,
        public_key_pem=public_key_pem,
        private_key_pem=private_key_pem,
    )
    if derived_id != device_id:
        try:
            _write_identity(path, identity)
        except OSError as exc:
            logger.warning(
                "openclaw.device_identity.rewrite_failed path=%s error=%s",
                path,
                exc,
            )
    return identity


def _generate_identity() -> DeviceIdentity:
    private_key = Ed25519PrivateKey.generate()
    private_key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_key_pem = (
        private_key.public_key()
        .public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        .decode("utf-8")
    )
    device_id = _derive_device_id(public_key_pem)
    return DeviceIdentity(
        device_id=device_id,
        public_key_pem=public_key_pem,
        private_key_pem=private_key_pem,
    )


def load_or_create_device_identity() -> DeviceIdentity:
    """Load persisted device identity or create a new one when missing/invalid."""
    generated_identity: DeviceIdentity | None = None
    primary_path: Path | None = None
    last_error: OSError | None = None

    for path in _identity_path_candidates():
        if primary_path is None:
            primary_path = path
        try:
            identity = _load_identity(path)
        except (OSError, ValueError, json.JSONDecodeError) as exc:
            if isinstance(exc, OSError):
                last_error = exc
            logger.warning(
                "openclaw.device_identity.load_failed path=%s error=%s",
                path,
                exc,
            )
            identity = None
        if identity is not None:
            if primary_path is not None and path != primary_path:
                logger.warning(
                    "openclaw.device_identity.using_fallback_path primary=%s fallback=%s",
                    primary_path,
                    path,
                )
            return identity

        if generated_identity is None:
            generated_identity = _generate_identity()
        try:
            _write_identity(path, generated_identity)
            if primary_path is not None and path != primary_path:
                logger.warning(
                    "openclaw.device_identity.persisted_to_fallback_path primary=%s fallback=%s",
                    primary_path,
                    path,
                )
            return generated_identity
        except OSError as exc:
            last_error = exc
            logger.warning(
                "openclaw.device_identity.write_failed path=%s error=%s",
                path,
                exc,
            )

    if last_error is not None:
        raise last_error
    msg = "Unable to load or create a device identity."
    raise OSError(msg)


def public_key_raw_base64url_from_pem(public_key_pem: str) -> str:
    """Return raw Ed25519 public key in base64url form expected by OpenClaw."""
    return _base64url_encode(_derive_public_key_raw(public_key_pem))


def sign_device_payload(private_key_pem: str, payload: str) -> str:
    """Sign a device payload with Ed25519 and return base64url signature."""
    loaded = serialization.load_pem_private_key(private_key_pem.encode("utf-8"), password=None)
    if not isinstance(loaded, Ed25519PrivateKey):
        msg = "device identity private key is not Ed25519"
        raise ValueError(msg)
    signature = loaded.sign(payload.encode("utf-8"))
    return _base64url_encode(signature)


def build_device_auth_payload(
    *,
    device_id: str,
    client_id: str,
    client_mode: str,
    role: str,
    scopes: list[str],
    signed_at_ms: int,
    token: str | None,
    nonce: str | None,
) -> str:
    """Build the OpenClaw canonical payload string for device signatures."""
    version = "v2" if nonce else "v1"
    parts = [
        version,
        device_id,
        client_id,
        client_mode,
        role,
        ",".join(scopes),
        str(signed_at_ms),
        token or "",
    ]
    if version == "v2":
        parts.append(nonce or "")
    return "|".join(parts)
