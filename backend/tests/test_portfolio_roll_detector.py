# ruff: noqa: INP001, S101
"""Tests for trade-sheet roll detection."""

from __future__ import annotations

from app.services.portfolio.roll_detector import detect_rolls


def test_detect_short_roll_same_day() -> None:
    trades = [
        [
            "Date",
            "Symbol",
            "Activity",
            "Quantity",
            "Amount",
        ],
        [
            "2026-04-20",
            "NVDA",
            "Sell To Close 5/21/2026 Call $200.00",
            "-1",
            "150",
        ],
        [
            "2026-04-20",
            "NVDA",
            "Sell To Open 7/16/2026 Call $205.00",
            "-1",
            "400",
        ],
    ]
    events = detect_rolls(
        [
            dict(zip(trades[0], row, strict=False))
            for row in trades[1:]
        ],
    )
    assert len(events) >= 1
    assert events[0].rolled_from_position_key != events[0].rolled_to_position_key
