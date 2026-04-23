# ruff: noqa: INP001, S101
"""Tests for portfolio Google Sheet parsing."""

from __future__ import annotations

from app.services.portfolio.sheet_parser import build_position_key, parse_positions_sheet


def test_parse_positions_expands_qty_and_mark_aliases() -> None:
    rows = [
        ["Ticker", "Qty Open", "Strike", "Expiration", "Current Price", "Unrealized P/L %", "DTE"],
        ["AAPL", "100", "", "", "190.5", "1.2", ""],
    ]
    positions = parse_positions_sheet(
        rows,
        generated_at_iso="2026-04-22T12:00:00Z",
        previous_positions=[],
        rationale_exists={},
    )
    assert len(positions) == 1
    p = positions[0]
    assert p["ticker"] == "AAPL"
    assert p["quantity"] == 100.0
    assert p["mark"] == 190.5
    assert p["unrealized_pnl_pct"] == 1.2


def test_build_position_key_legacy_stable_contract() -> None:
    """Rationale files and roll events rely on a stable key shape (third segment base)."""
    assert (
        build_position_key(
            ticker="AAPL",
            instrument_type="stock",
            option_side="stock",
            strike=None,
            expiration=None,
            quantity=100.0,
        )
        == "aapl-stock-base-na-na-100"
    )
    assert (
        build_position_key(
            ticker="GOOG",
            instrument_type="call",
            option_side="call",
            strike=300.0,
            expiration="2026-04-23",
            quantity=None,
        )
        == "goog-call-base-300-2026-04-23-na"
    )
    assert (
        build_position_key(
            ticker="AAPL",
            instrument_type="put",
            option_side=None,
            strike=267.5,
            expiration="2026-05-01",
            quantity=1.0,
        )
        == "aapl-put-base-267.5-2026-05-01-1"
    )


def test_parse_positions_no_missing_rationale_when_saved_rationale_exists() -> None:
    """Rationale on file/DB must not be treated as missing just because previous snapshot is absent."""
    rows = [
        ["Ticker", "Qty Open"],
        ["AAPL", "100"],
    ]
    key = "aapl-stock-base-na-na-100"
    positions = parse_positions_sheet(
        rows,
        generated_at_iso="2026-04-22T12:00:00Z",
        previous_positions=[],
        rationale_exists={key: True},
    )
    assert len(positions) == 1
    assert positions[0]["position_key"] == key
    assert positions[0]["needs_rationale"] is False
    assert not any(
        isinstance(f, dict) and f.get("code") == "missing_rationale"
        for f in (positions[0].get("latest_flags") or [])
    )


def test_parse_positions_position_key_ignores_type_column_for_option_side() -> None:
    """Sheets that use 'Type' for asset class must not put 'stock' into the key's third slot."""
    rows = [
        ["Ticker", "Type", "Qty Open"],
        ["AAPL", "Stock", "100"],
    ]
    positions = parse_positions_sheet(
        rows,
        generated_at_iso="2026-04-22T12:00:00Z",
        previous_positions=[],
        rationale_exists={},
    )
    assert len(positions) == 1
    assert positions[0]["position_key"] == "aapl-stock-base-na-na-100"


def test_parse_positions_skips_option_header_row() -> None:
    rows = [
        ["Ticker", "Qty"],
        ["OPTION", "0"],
        ["MSFT", "10"],
    ]
    positions = parse_positions_sheet(
        rows,
        generated_at_iso="2026-04-22T12:00:00Z",
        previous_positions=[],
        rationale_exists={},
    )
    assert [p["ticker"] for p in positions] == ["MSFT"]
