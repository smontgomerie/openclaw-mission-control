# ruff: noqa: INP001, S101
"""Tests for trade-sheet roll detection."""

from __future__ import annotations

from app.services.portfolio.roll_detector import detect_rolls


def test_detect_short_roll_same_day() -> None:
    """Canonical short-call roll: Buy To Close the old short, Sell To Open the new short."""
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
            "Buy To Close 5/21/2026 Call $200.00",
            "1",
            "-150",
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


def test_detect_short_roll_open_within_calendar_day_window() -> None:
    """Close and open on different calendar days still pair (broker / weekend lag)."""
    trades = [
        ["Date", "Symbol", "Activity", "Quantity", "Amount"],
        [
            "2026-04-20",
            "NVDA",
            "Buy To Close 5/21/2026 Call $200.00",
            "1",
            "-150",
        ],
        [
            "2026-04-22",
            "NVDA",
            "Sell To Open 7/16/2026 Call $205.00",
            "-1",
            "400",
        ],
    ]
    events = detect_rolls([dict(zip(trades[0], row, strict=False)) for row in trades[1:]])
    assert len(events) >= 1
    assert "nvda-call-base-200-2026-05-21" in events[0].rolled_from_position_key
    assert "nvda-call-base-205-2026-07-16" in events[0].rolled_to_position_key


def test_detect_roll_strike_after_call_word_order() -> None:
    """Robinhood-style 'M/D/YYYY Call $strike' (strike after call)."""
    trades = [
        ["Date", "Symbol", "Activity", "Quantity", "Amount"],
        [
            "2026-04-20",
            "AAPL",
            "Buy To Close 4/23/2026 Call $267.50",
            "1",
            "-100",
        ],
        [
            "2026-04-20",
            "AAPL",
            "Sell To Open 5/30/2026 Call $270.00",
            "-1",
            "110",
        ],
    ]
    events = detect_rolls([dict(zip(trades[0], row, strict=False)) for row in trades[1:]])
    assert len(events) >= 1
    assert "aapl-call-base-267.5-2026-04-23" in events[0].rolled_from_position_key
    assert "aapl-call-base-270-2026-05-30" in events[0].rolled_to_position_key


def test_detect_roll_buy_sell_hyphen_open_close() -> None:
    """Hyphenated action phrasing should still detect a short-call roll."""
    trades = [
        ["Date", "Symbol", "Activity", "Quantity", "Amount"],
        [
            "2026-04-20",
            "MSFT",
            "Buy - Close 6/20/2026 Call $400.00",
            "1",
            "-50",
        ],
        [
            "2026-04-20",
            "MSFT",
            "Sell - Open 9/18/2026 Call $410.00",
            "-1",
            "60",
        ],
    ]
    events = detect_rolls([dict(zip(trades[0], row, strict=False)) for row in trades[1:]])
    assert len(events) >= 1
    assert "msft-call-base" in events[0].rolled_from_position_key
    assert "msft-call-base" in events[0].rolled_to_position_key


def test_detect_roll_iso_expiration_in_description_is_not_confused_with_trade_date() -> None:
    """ISO expirations in the description must parse as expiration, not the trade date."""
    trades = [
        ["Date", "Symbol", "Activity", "Quantity", "Amount"],
        [
            "2026-04-20",
            "NVDA",
            "Buy To Close 2026-05-21 Call $200.00",
            "1",
            "-150",
        ],
        [
            "2026-04-20",
            "NVDA",
            "Sell To Open 2026-07-16 Call $205.00",
            "-1",
            "400",
        ],
    ]
    events = detect_rolls([dict(zip(trades[0], row, strict=False)) for row in trades[1:]])
    assert len(events) >= 1
    assert "nvda-call-base-200-2026-05-21" in events[0].rolled_from_position_key
    assert "nvda-call-base-205-2026-07-16" in events[0].rolled_to_position_key


def test_parse_quantity_uses_nonempty_alias() -> None:
    """An empty 'Quantity' column must not mask a populated 'Contracts' column."""
    from app.services.portfolio.roll_detector import parse_trade_records

    records = [
        {
            "Date": "2026-04-20",
            "Symbol": "NVDA",
            "Activity": "Sell To Open 5/21/2026 Call $200.00",
            "Quantity": "",
            "Contracts": "-1",
            "Amount": "100",
        }
    ]
    parsed = parse_trade_records(records)
    assert len(parsed) == 1
    assert parsed[0].quantity == -1.0


def test_detect_roll_uses_explicit_strike_exp_columns() -> None:
    """Structured Strike/Expiration/Call-Put columns must feed position keys."""
    trades = [
        [
            "Date",
            "Symbol",
            "Activity",
            "Quantity",
            "Amount",
            "Strike",
            "Expiration",
            "Call/Put",
        ],
        [
            "2026-04-20",
            "GOOG",
            "BTC",
            "1",
            "-180",
            "300",
            "2026-04-23",
            "Call",
        ],
        [
            "2026-04-20",
            "GOOG",
            "STO",
            "-1",
            "220",
            "310",
            "2026-06-18",
            "Call",
        ],
    ]
    rows = [dict(zip(trades[0], row, strict=False)) for row in trades[1:]]
    events = detect_rolls(rows)
    assert len(events) >= 1
    from_key = {e.rolled_from_position_key for e in events}
    to_key = {e.rolled_to_position_key for e in events}
    # Quantity is intentionally NOT part of the position key — identity is
    # (ticker, side, strike, expiration). Trade-derived keys therefore end in `na`.
    assert "goog-call-base-300-2026-04-23-na" in from_key
    assert "goog-call-base-310-2026-06-18-na" in to_key


# ---------------------------------------------------------------------------
# Regression tests for the real user Trades sheet shape.
#
# Columns observed in production:
#   Trade Date | Ticker | Strategy | Action | Order | Position Effect | Type |
#   Qty (contracts) | Expiry (YYYY-MM-DD) | Strike | Price | Fees | Underlying Px |
#   Notes | Key | Signed Qty | Cash Flow | Import ID | Roll Group | Roll Type | Roll Net
#
# Before the alias fix, every trade was dropped at `_parse_trade_date` (no
# "Trade Date" alias) and again at `_detect_action` (the blob did not include
# the `Action` column). Result: `rolls_detected_count: 0` for a portfolio with
# obvious rolls. These tests pin the fix.
# ---------------------------------------------------------------------------

_FRIENDLY_HEADER = [
    "Trade Date",
    "Ticker",
    "Strategy",
    "Action",
    "Order",
    "Position Effect",
    "Type",
    "Qty (contracts)",
    "Expiry (YYYY-MM-DD)",
    "Strike",
    "Price",
    "Fees",
    "Underlying Px",
    "Notes",
    "Key",
    "Signed Qty",
    "Cash Flow",
    "Import ID",
    "Roll Group",
    "Roll Type",
    "Roll Net",
]


def _friendly_row(
    *,
    trade_date: str,
    ticker: str,
    action: str,
    order: str,
    effect: str,
    opt_type: str,
    qty: str,
    expiry: str,
    strike: str,
    price: str,
    notes: str = "",
    signed_qty: str = "",
    cash_flow: str = "",
    import_id: str = "",
    roll_group: str = "",
    roll_type: str = "",
    roll_net: str = "",
) -> list[str]:
    return [
        trade_date,
        ticker,
        "",
        action,
        order,
        effect,
        opt_type,
        qty,
        expiry,
        strike,
        price,
        "",
        "",
        notes,
        "",
        signed_qty,
        cash_flow,
        import_id,
        roll_group,
        roll_type,
        roll_net,
    ]


def test_detect_roll_friendly_sheet_single_action_column() -> None:
    """Rolls from a sheet using 'Trade Date' + 'Action' = 'Sell to Open' / 'Buy to Close'."""
    rows = [
        _friendly_row(
            trade_date="2026-04-17",
            ticker="AAPL",
            action="Buy to Close",
            order="Buy",
            effect="Close",
            opt_type="Call",
            qty="1",
            expiry="2026-04-17",
            strike="267.5",
            price="2.24",
            signed_qty="1",
            cash_flow="-224",
            import_id="a1",
        ),
        _friendly_row(
            trade_date="2026-04-17",
            ticker="AAPL",
            action="Sell to Open",
            order="Sell",
            effect="Open",
            opt_type="Call",
            qty="1",
            expiry="2026-04-24",
            strike="272.5",
            price="2.32",
            signed_qty="-1",
            cash_flow="232",
            import_id="a2",
        ),
    ]
    records = [dict(zip(_FRIENDLY_HEADER, row, strict=False)) for row in rows]
    events = detect_rolls(records)
    assert len(events) == 1
    ev = events[0]
    assert "aapl-call-base-267.5-2026-04-17" in ev.rolled_from_position_key
    assert "aapl-call-base-272.5-2026-04-24" in ev.rolled_to_position_key
    # Cash Flow -224 + 232 = 8 dollars = 800 cents.
    assert ev.net_credit_cents == 800


def test_detect_roll_friendly_sheet_split_order_and_effect() -> None:
    """Rolls should still pair when Action is empty but Order + Position Effect are set."""
    rows = [
        _friendly_row(
            trade_date="2026-04-20",
            ticker="AAPL",
            action="",
            order="Buy",
            effect="Close",
            opt_type="Call",
            qty="1",
            expiry="2026-04-24",
            strike="267.5",
            price="7.29",
            signed_qty="1",
            cash_flow="-729",
            import_id="b1",
        ),
        _friendly_row(
            trade_date="2026-04-20",
            ticker="AAPL",
            action="",
            order="Sell",
            effect="Open",
            opt_type="Call",
            qty="1",
            expiry="2026-06-18",
            strike="285",
            price="7.49",
            signed_qty="-1",
            cash_flow="749",
            import_id="b2",
        ),
    ]
    records = [dict(zip(_FRIENDLY_HEADER, row, strict=False)) for row in rows]
    events = detect_rolls(records)
    assert len(events) == 1
    assert "aapl-call-base-267.5-2026-04-24" in events[0].rolled_from_position_key
    assert "aapl-call-base-285-2026-06-18" in events[0].rolled_to_position_key


def test_trade_derived_position_key_matches_position_snapshot_key() -> None:
    """Trade-derived keys must match Positions-sheet-derived keys for rationale carry.

    The Positions sheet does not carry signed quantity, so ``build_position_key`` on
    a snapshot position lands in the ``-na`` qty slot. If the roll detector emits
    ``-1`` or ``-1`` trade-derived keys, ``_carry_roll`` cannot find the source
    rationale and every detected roll silently no-ops on write. Pin the shapes.
    """
    from app.services.portfolio.roll_detector import parse_trade_records
    from app.services.portfolio.sheet_parser import build_position_key

    records = [
        {
            "Trade Date": "2026-04-17",
            "Ticker": "AAPL",
            "Action": "Buy to Close",
            "Type": "Call",
            "Qty (contracts)": "1",
            "Expiry (YYYY-MM-DD)": "2026-04-17",
            "Strike": "267.5",
            "Cash Flow": "-224",
            "Import ID": "a1",
        },
    ]
    parsed = parse_trade_records(records)
    assert len(parsed) == 1
    trade = parsed[0]
    # Trade-derived key as the detector will emit it.
    from app.services.portfolio.roll_detector import _position_key_for_trade

    trade_key = _position_key_for_trade(trade)
    # Snapshot key as computed when a Positions row produced a rationale.
    snap_key = build_position_key(
        ticker="AAPL",
        instrument_type="call",
        option_side="call",
        strike=267.5,
        expiration="2026-04-17",
        quantity=None,
    )
    assert trade_key == snap_key
    assert trade_key.endswith("-na")


def test_detect_roll_honors_explicit_roll_group_tag() -> None:
    """When both legs share a Roll Group tag, prefer that pairing (high confidence)."""
    rows = [
        _friendly_row(
            trade_date="2026-04-17",
            ticker="AAPL",
            action="Buy to Close",
            order="Buy",
            effect="Close",
            opt_type="Call",
            qty="1",
            expiry="2026-04-17",
            strike="267.5",
            price="2.24",
            signed_qty="1",
            cash_flow="-224",
            import_id="g1",
            roll_group="329ef074",
            roll_type="Roll Out & Up",
            roll_net="8",
        ),
        _friendly_row(
            trade_date="2026-04-17",
            ticker="AAPL",
            action="Sell to Open",
            order="Sell",
            effect="Open",
            opt_type="Call",
            qty="1",
            expiry="2026-04-24",
            strike="272.5",
            price="2.32",
            signed_qty="-1",
            cash_flow="232",
            import_id="g2",
            roll_group="329ef074",
            roll_type="Roll Out & Up",
            roll_net="8",
        ),
        # Unrelated noise on same ticker/day that should not be paired into the group.
        _friendly_row(
            trade_date="2026-04-17",
            ticker="AAPL",
            action="Sell to Open",
            order="Sell",
            effect="Open",
            opt_type="Put",
            qty="1",
            expiry="2026-04-24",
            strike="270",
            price="2.66",
            signed_qty="-1",
            cash_flow="266",
            import_id="g3",
        ),
    ]
    records = [dict(zip(_FRIENDLY_HEADER, row, strict=False)) for row in rows]
    events = detect_rolls(records)
    assert len(events) == 1
    ev = events[0]
    assert ev.source_trade_ids == ("g1", "g2")
    assert ev.confidence >= 0.95
    assert "aapl-call-base-267.5-2026-04-17" in ev.rolled_from_position_key
    assert "aapl-call-base-272.5-2026-04-24" in ev.rolled_to_position_key
