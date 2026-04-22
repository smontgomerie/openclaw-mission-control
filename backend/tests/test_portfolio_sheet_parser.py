# ruff: noqa: INP001, S101
"""Tests for portfolio Google Sheet parsing."""

from __future__ import annotations

from app.services.portfolio.sheet_parser import parse_positions_sheet


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
