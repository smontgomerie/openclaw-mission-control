# ruff: noqa: SLF001

from __future__ import annotations

from app.core import auth


def test_extract_claim_email_prefers_direct_email() -> None:
    claims: dict[str, object] = {
        "email": " User@Example.com ",
        "primary_email_address": "ignored@example.com",
    }
    assert auth._extract_claim_email(claims) == "user@example.com"


def test_extract_claim_email_from_primary_id() -> None:
    claims: dict[str, object] = {
        "primary_email_address_id": "id-2",
        "email_addresses": [
            {"id": "id-1", "email_address": "first@example.com"},
            {"id": "id-2", "email_address": "chosen@example.com"},
        ],
    }
    assert auth._extract_claim_email(claims) == "chosen@example.com"


def test_extract_claim_email_falls_back_to_first_address() -> None:
    claims: dict[str, object] = {
        "email_addresses": [
            {"id": "id-1", "email_address": "first@example.com"},
            {"id": "id-2", "email_address": "second@example.com"},
        ],
    }
    assert auth._extract_claim_email(claims) == "first@example.com"


def test_extract_claim_name_from_parts() -> None:
    claims: dict[str, object] = {
        "given_name": "Alex",
        "family_name": "Morgan",
    }
    assert auth._extract_claim_name(claims) == "Alex Morgan"
