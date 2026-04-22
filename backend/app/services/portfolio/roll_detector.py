"""Heuristic detection of option rolls from Trades sheet rows."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.services.portfolio.sheet_parser import build_position_key, normalize_text, value_for


@dataclass(frozen=True)
class ParsedTrade:
    """One normalized trade line."""

    trade_date: datetime
    ticker: str
    action: str  # btc | stc | bto | sto | unknown
    option_side: str | None  # call | put
    strike: float | None
    expiration: str | None  # ISO date
    quantity: float | None
    amount_cents: int | None
    raw_id: str
    description: str


@dataclass(frozen=True)
class RollEvent:
    rolled_from_position_key: str
    rolled_to_position_key: str
    rolled_at: datetime
    net_credit_cents: int
    source_trade_ids: tuple[str, ...]
    confidence: float


def _parse_trade_date(record: dict[str, Any]) -> datetime | None:
    raw = normalize_text(
        value_for(
            record,
            (
                "Transacted At",
                "Activity Date",
                "Date",
                "Transaction Date",
                "Process Date",
                "Filled At",
            ),
        ),
    )
    if not raw:
        return None
    s = raw.strip()
    try:
        iso = s.replace("Z", "+00:00")
        return datetime.fromisoformat(iso)
    except ValueError:
        pass
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y"):
        try:
            return datetime.strptime(s[:19], fmt)
        except ValueError:
            continue
    return None


def _detect_action(text: str) -> str:
    low = text.lower()
    if re.search(r"buy\s+to\s+close|btc\b", low):
        return "btc"
    if re.search(r"sell\s+to\s+close|stc\b", low):
        return "stc"
    if re.search(r"buy\s+to\s+open|bto\b", low):
        return "bto"
    if re.search(r"sell\s+to\s+open|sto\b", low):
        return "sto"
    return "unknown"


def _parse_option_from_description(desc: str) -> tuple[str | None, float | None, str | None]:
    """Extract call/put, strike, expiration from Robinhood-style description."""
    low = desc.lower()
    side: str | None = None
    if " call" in low or low.endswith("call") or "calls" in low:
        side = "call"
    elif " put" in low or low.endswith("put") or "puts" in low:
        side = "put"
    strike: float | None = None
    m_strike = re.search(r"\$?\s*(\d+(?:\.\d+)?)\s*(?:call|put)", low, re.I)
    if m_strike:
        try:
            strike = float(m_strike.group(1))
        except ValueError:
            strike = None
    exp: str | None = None
    m_date = re.search(
        r"(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})",
        desc,
    )
    if m_date:
        a, b, y = m_date.groups()
        yi = int(y) if len(y) == 4 else 2000 + int(y)
        try:
            mi, di = int(a), int(b)
            if mi > 12:
                mi, di = di, mi
            exp = datetime(yi, mi, di).date().isoformat()
        except ValueError:
            exp = None
    return side, strike, exp


def parse_trade_records(records: list[dict[str, Any]]) -> list[ParsedTrade]:
    out: list[ParsedTrade] = []
    for i, record in enumerate(records):
        dt = _parse_trade_date(record)
        if dt is None:
            continue
        ticker = normalize_text(value_for(record, ("Symbol", "Ticker", "Instrument"))) or ""
        ticker = ticker.upper()
        desc = " ".join(str(v) for v in record.values() if isinstance(v, str) and v.strip())
        activity = (
            normalize_text(
                value_for(record, ("Activity", "Type", "Description", "Trans Code", "Side")),
            )
            or ""
        )
        blob = f"{activity} {desc}"
        action = _detect_action(blob)
        if action == "unknown":
            continue
        opt_side, strike, exp = _parse_option_from_description(blob)
        qty = None
        for key in ("Quantity", "Qty", "Shares", "Contracts"):
            if key in record:
                try:
                    qty = float(str(record[key]).replace(",", ""))
                except ValueError:
                    qty = None
                break
        amt_raw = value_for(record, ("Amount", "Total", "Net Amount", "Proceeds"))
        amount_cents: int | None = None
        if amt_raw is not None:
            try:
                amount_cents = int(
                    round(float(str(amt_raw).replace("$", "").replace(",", "")) * 100)
                )
            except ValueError:
                amount_cents = None
        raw_id = normalize_text(
            value_for(record, ("Order ID", "Id", "ID", "Transaction ID"))
        ) or str(i)
        out.append(
            ParsedTrade(
                trade_date=dt,
                ticker=ticker,
                action=action,
                option_side=opt_side,
                strike=strike,
                expiration=exp,
                quantity=qty,
                amount_cents=amount_cents,
                raw_id=raw_id,
                description=blob[:500],
            ),
        )
    return out


def _position_key_for_trade(t: ParsedTrade) -> str | None:
    if not t.ticker or not t.option_side or t.strike is None or not t.expiration:
        return None
    return build_position_key(
        ticker=t.ticker,
        instrument_type=t.option_side,
        option_side=t.option_side,
        strike=t.strike,
        expiration=t.expiration,
        quantity=t.quantity,
    )


def detect_rolls(trades: list[dict[str, Any]]) -> list[RollEvent]:
    """Pair same-day close + open on same ticker/side with different strike or expiry."""
    parsed = parse_trade_records(trades)
    events: list[RollEvent] = []
    by_day_ticker: dict[tuple[str, str], list[ParsedTrade]] = {}
    for t in parsed:
        day = t.trade_date.date().isoformat()
        key = (day, t.ticker)
        by_day_ticker.setdefault(key, []).append(t)

    for (_day, ticker), group in by_day_ticker.items():
        closes = [x for x in group if x.action in ("btc", "stc")]
        opens = [x for x in group if x.action in ("bto", "sto")]
        for c in closes:
            ck = _position_key_for_trade(c)
            if ck is None:
                continue
            for o in opens:
                ok = _position_key_for_trade(o)
                if ok is None or ck == ok:
                    continue
                if c.option_side != o.option_side:
                    continue
                # Short roll: STC short + STO new, or BTC long + BTO new
                short_roll = c.action == "stc" and o.action == "sto"
                long_roll = c.action == "btc" and o.action == "bto"
                if not (short_roll or long_roll):
                    continue
                strike_diff = (c.strike or 0) != (o.strike or 0)
                exp_diff = (c.expiration or "") != (o.expiration or "")
                if not (strike_diff or exp_diff):
                    continue
                net = (c.amount_cents or 0) + (o.amount_cents or 0)
                conf = 0.75
                if c.quantity and o.quantity and abs(c.quantity) == abs(o.quantity):
                    conf += 0.15
                conf = min(1.0, conf)
                events.append(
                    RollEvent(
                        rolled_from_position_key=ck,
                        rolled_to_position_key=ok,
                        rolled_at=c.trade_date,
                        net_credit_cents=net,
                        source_trade_ids=(c.raw_id, o.raw_id),
                        confidence=conf,
                    ),
                )
    dedup: dict[tuple[str, str], RollEvent] = {}
    for ev in events:
        dedup[(ev.rolled_from_position_key, ev.rolled_to_position_key)] = ev
    return list(dedup.values())
