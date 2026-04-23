"""Heuristic detection of option rolls from Trades sheet rows."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from app.services.portfolio.sheet_parser import (
    build_position_key,
    normalize_number,
    normalize_text,
    parse_expiration,
    value_for,
)

# Pair a close with an open when the open is on the close date or within this many
# calendar days after (T+1 / weekend / broker lag). Same-day-only misses many rolls.
ROLL_OPEN_AFTER_CLOSE_MAX_DAYS = 5


_DATE_ALIASES = (
    "Trade Date",
    "Transacted At",
    "Activity Date",
    "Date",
    "Transaction Date",
    "Process Date",
    "Filled At",
)

_QUANTITY_ALIASES = (
    "Quantity",
    "Qty",
    "Qty (contracts)",
    "Contracts",
    "Shares",
    "Signed Qty",
)

_EXPIRATION_ALIASES = (
    "Expiration",
    "Expiration Date",
    "Exp Date",
    "Expiry",
    "Expiry (YYYY-MM-DD)",
    "Exp",
    "Maturity",
)

_AMOUNT_ALIASES = (
    "Amount",
    "Total",
    "Net Amount",
    "Proceeds",
    "Cash Flow",
)

_TRADE_ID_ALIASES = (
    "Order ID",
    "Id",
    "ID",
    "Transaction ID",
    "Import ID",
)

_ROLL_GROUP_ALIASES = ("Roll Group", "Roll ID", "Roll Tag")


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
    roll_group: str | None = None


@dataclass(frozen=True)
class RollEvent:
    rolled_from_position_key: str
    rolled_to_position_key: str
    rolled_at: datetime
    net_credit_cents: int
    source_trade_ids: tuple[str, ...]
    confidence: float


def _parse_trade_date(record: dict[str, Any]) -> datetime | None:
    raw = normalize_text(value_for(record, _DATE_ALIASES))
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
    if re.search(r"buy\s+to\s+close|buy\s*[-–]\s*close|btc\b", low):
        return "btc"
    if re.search(r"sell\s+to\s+close|sell\s*[-–]\s*close|stc\b", low):
        return "stc"
    if re.search(r"buy\s+to\s+open|buy\s*[-–]\s*open|bto\b", low):
        return "bto"
    if re.search(r"sell\s+to\s+open|sell\s*[-–]\s*open|sto\b", low):
        return "sto"
    return "unknown"


def _action_from_columns(record: dict[str, Any]) -> str:
    """Derive action from explicit sheet columns that are not in the description blob.

    Supports two common layouts:
      1. A single ``Action`` cell with values like "Sell to Open" / "Buy to Close".
      2. Split ``Order`` (Buy/Sell) + ``Position Effect`` (Open/Close) columns.
    """
    action_text = normalize_text(value_for(record, ("Action",))) or ""
    if action_text:
        result = _detect_action(action_text)
        if result != "unknown":
            return result
    order_raw = (normalize_text(value_for(record, ("Order", "Side"))) or "").lower()
    effect_raw = (
        normalize_text(value_for(record, ("Position Effect", "Open/Close", "Effect"))) or ""
    ).lower()
    if order_raw and effect_raw:
        if "buy" in order_raw and "close" in effect_raw:
            return "btc"
        if "sell" in order_raw and "close" in effect_raw:
            return "stc"
        if "buy" in order_raw and "open" in effect_raw:
            return "bto"
        if "sell" in order_raw and "open" in effect_raw:
            return "sto"
    return "unknown"


_SIDE_RE = re.compile(r"\b(calls?|puts?)\b", re.I)
_STRIKE_AFTER_RE = re.compile(r"\b(?:calls?|puts?)\s*\$?\s*(\d+(?:\.\d+)?)\b", re.I)
_STRIKE_BEFORE_RE = re.compile(r"\$?\s*(\d+(?:\.\d+)?)\s*(?:calls?|puts?)\b", re.I)
# 4-digit years 2020-2099 only; the earlier 20[2-9]\d{2} version required 5 digits
# and silently never matched real ISO dates.
_ISO_DATE_RE = re.compile(r"\b(20[2-9]\d-\d{2}-\d{2})\b")
_MDY_DATE_RE = re.compile(r"\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b")


def _parse_option_from_description(desc: str) -> tuple[str | None, float | None, str | None]:
    """Extract call/put, strike, expiration from a broker description blob.

    The caller is responsible for NOT passing already-parsed columns (like the trade
    date) into ``desc`` — otherwise the date regex may pick up the trade date and
    stamp it as the expiration.
    """
    side: str | None = None
    m_side = _SIDE_RE.search(desc)
    if m_side:
        side = "call" if m_side.group(1).lower().startswith("call") else "put"

    strike: float | None = None
    for m in (_STRIKE_AFTER_RE.search(desc), _STRIKE_BEFORE_RE.search(desc)):
        if m is None:
            continue
        try:
            strike = float(m.group(1))
        except ValueError:
            continue
        else:
            break

    exp: str | None = None
    m_iso = _ISO_DATE_RE.search(desc)
    if m_iso:
        try:
            exp = date.fromisoformat(m_iso.group(1)).isoformat()
        except ValueError:
            exp = None
    if exp is None:
        m_date = _MDY_DATE_RE.search(desc)
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


def _option_side_from_trade_columns(record: dict[str, Any]) -> str | None:
    raw = normalize_text(
        value_for(record, ("Option Type", "Put/Call", "Call/Put", "C/P", "Option", "Type")),
    )
    if not raw:
        return None
    low = raw.lower()
    # Only treat as side if unambiguous; "Stock" / "Equity" must not map to a side.
    if "call" in low:
        return "call"
    if "put" in low:
        return "put"
    return None


def _option_fields_for_trade(record: dict[str, Any], blob: str) -> tuple[str | None, float | None, str | None]:
    """Prefer explicit sheet columns, then description heuristics."""
    side_d, strike_d, exp_d = _parse_option_from_description(blob)
    side_c = _option_side_from_trade_columns(record)
    strike_c = normalize_number(value_for(record, ("Strike", "Strike Price", "Strike price")))
    exp_c = parse_expiration(normalize_text(value_for(record, _EXPIRATION_ALIASES)))
    side = side_c or side_d
    strike = strike_c if strike_c is not None else strike_d
    exp = exp_c or exp_d
    return side, strike, exp


_DESCRIPTION_ALIASES = (
    "Activity",
    "Description",
    "Trans Code",
    "Type",
    "Side",
    "Order Description",
    "Instrument Description",
)


def _description_blob(record: dict[str, Any]) -> str:
    """Concatenate description-style columns only.

    Excludes the trade-date column and other structured fields so the regex parser
    does not mistake the trade date for an expiration, or an amount for a strike.
    """
    parts: list[str] = []
    seen: set[str] = set()
    for alias in _DESCRIPTION_ALIASES:
        value = record.get(alias)
        if not isinstance(value, str):
            continue
        text = value.strip()
        if not text or text in seen:
            continue
        seen.add(text)
        parts.append(text)
    return " ".join(parts)


def parse_trade_records(records: list[dict[str, Any]]) -> list[ParsedTrade]:
    out: list[ParsedTrade] = []
    for i, record in enumerate(records):
        dt = _parse_trade_date(record)
        if dt is None:
            continue
        ticker = normalize_text(value_for(record, ("Symbol", "Ticker", "Instrument"))) or ""
        ticker = ticker.upper()
        blob = _description_blob(record)
        # Prefer explicit columns over regex-on-blob so friendly sheet layouts
        # (e.g. separate `Action` and `Position Effect` cells) are understood.
        action = _action_from_columns(record)
        if action == "unknown":
            action = _detect_action(blob)
        if action == "unknown":
            continue
        opt_side, strike, exp = _option_fields_for_trade(record, blob)
        qty_raw = value_for(record, _QUANTITY_ALIASES)
        qty: float | None = None
        if qty_raw is not None:
            try:
                qty = float(str(qty_raw).replace(",", ""))
            except ValueError:
                qty = None
        amt_raw = value_for(record, _AMOUNT_ALIASES)
        amount_cents: int | None = None
        if amt_raw is not None:
            try:
                amount_cents = int(
                    round(float(str(amt_raw).replace("$", "").replace(",", "")) * 100)
                )
            except ValueError:
                amount_cents = None
        raw_id = normalize_text(value_for(record, _TRADE_ID_ALIASES)) or str(i)
        roll_group = normalize_text(value_for(record, _ROLL_GROUP_ALIASES))
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
                roll_group=roll_group,
            ),
        )
    return out


def _position_key_for_trade(t: ParsedTrade) -> str | None:
    """Key identifying the position this trade touches.

    Quantity is intentionally omitted from the key: position identity is
    (ticker, side, strike, expiration). Including qty would drift trade-derived
    keys (e.g. ``-1``) away from snapshot-derived keys (which carry ``na`` when
    the Positions sheet does not expose a signed quantity column), and would
    break rationale carry during roll detection.
    """
    if not t.ticker or not t.option_side or t.strike is None or not t.expiration:
        return None
    return build_position_key(
        ticker=t.ticker,
        instrument_type=t.option_side,
        option_side=t.option_side,
        strike=t.strike,
        expiration=t.expiration,
        quantity=None,
    )


def _roll_pair_eligible(c: ParsedTrade, o: ParsedTrade) -> bool:
    """Decide whether a close leg ``c`` and an open leg ``o`` form a real roll.

    Canonical roll patterns keep directional exposure constant:
      * Short call / short put roll: ``BTC`` then ``STO`` on same side.
      * Long  call / long  put roll: ``STC`` then ``BTO`` on same side.

    A reversal (for example ``STC`` followed by ``STO`` on the same side) is not a
    roll — it flips the position direction — so it is rejected here.
    """
    if c.ticker != o.ticker or c.option_side != o.option_side:
        return False
    short_roll = c.action == "btc" and o.action == "sto"
    long_roll = c.action == "stc" and o.action == "bto"
    if not (short_roll or long_roll):
        return False
    strike_diff = (c.strike or 0) != (o.strike or 0)
    exp_diff = (c.expiration or "") != (o.expiration or "")
    return bool(strike_diff or exp_diff)


def _build_roll_event(c: ParsedTrade, o: ParsedTrade) -> RollEvent | None:
    ck = _position_key_for_trade(c)
    ok = _position_key_for_trade(o)
    if ck is None or ok is None or ok == ck:
        return None
    net = (c.amount_cents or 0) + (o.amount_cents or 0)
    conf = 0.72
    if o.trade_date.date() == c.trade_date.date():
        conf += 0.08
    if abs((o.trade_date - c.trade_date).days) <= 1:
        conf += 0.05
    if c.quantity and o.quantity and abs(c.quantity) == abs(o.quantity):
        conf += 0.12
    conf = min(1.0, conf)
    return RollEvent(
        rolled_from_position_key=ck,
        rolled_to_position_key=ok,
        rolled_at=c.trade_date,
        net_credit_cents=net,
        source_trade_ids=(c.raw_id, o.raw_id),
        confidence=conf,
    )


def _detect_by_roll_group(parsed: list[ParsedTrade]) -> tuple[list[RollEvent], set[str]]:
    """Use explicit ``Roll Group`` tags when provided by the source sheet.

    When the user (or an importer) tags both legs of a roll with the same non-empty
    ``Roll Group`` value, trust it over heuristic pairing. Returns the events
    produced and the set of raw_ids consumed so heuristic detection does not
    pair them a second time.
    """
    groups: dict[str, list[ParsedTrade]] = {}
    for t in parsed:
        if t.roll_group:
            groups.setdefault(t.roll_group, []).append(t)
    events: list[RollEvent] = []
    used: set[str] = set()
    for _gid, legs in groups.items():
        if len(legs) < 2:
            continue
        closes = [x for x in legs if x.action in ("btc", "stc")]
        opens = [x for x in legs if x.action in ("bto", "sto")]
        if not closes or not opens:
            continue
        closes.sort(key=lambda x: x.trade_date)
        opens.sort(key=lambda x: x.trade_date)
        # Pair in order; authoritative group means all listed legs belong to this roll.
        for c, o in zip(closes, opens, strict=False):
            if not _roll_pair_eligible(c, o):
                continue
            ev = _build_roll_event(c, o)
            if ev is None:
                continue
            # Bump confidence for explicit tagging.
            events.append(
                RollEvent(
                    rolled_from_position_key=ev.rolled_from_position_key,
                    rolled_to_position_key=ev.rolled_to_position_key,
                    rolled_at=ev.rolled_at,
                    net_credit_cents=ev.net_credit_cents,
                    source_trade_ids=ev.source_trade_ids,
                    confidence=min(1.0, max(ev.confidence, 0.95)),
                ),
            )
            used.add(c.raw_id)
            used.add(o.raw_id)
    return events, used


def detect_rolls(trades: list[dict[str, Any]]) -> list[RollEvent]:
    """Pair close + open legs on the same ticker/side with different strike or expiry.

    Opens may occur on the same calendar day as the close or within a few days after
    (broker lag, weekend, T+1 bookkeeping) — same-day-only matching misses most rolls.
    When trades carry an explicit ``Roll Group`` tag, that pairing is trusted
    first and heuristic matching runs only on the remaining trades.
    """
    parsed = parse_trade_records(trades)
    if not parsed:
        return []
    events: list[RollEvent] = []

    group_events, group_used = _detect_by_roll_group(parsed)
    events.extend(group_events)

    by_ticker: dict[str, list[ParsedTrade]] = {}
    for t in parsed:
        if not t.ticker or t.raw_id in group_used:
            continue
        by_ticker.setdefault(t.ticker, []).append(t)

    for _ticker, group in by_ticker.items():
        closes = sorted(
            (x for x in group if x.action in ("btc", "stc")),
            key=lambda x: x.trade_date,
        )
        opens = sorted(
            (x for x in group if x.action in ("bto", "sto")),
            key=lambda x: x.trade_date,
        )
        used_open_ids: set[str] = set()

        for c in closes:
            ck = _position_key_for_trade(c)
            if ck is None:
                continue
            best: tuple[float, ParsedTrade] | None = None
            for o in opens:
                if o.raw_id in used_open_ids:
                    continue
                if o.trade_date < c.trade_date:
                    continue
                days_after = (o.trade_date.date() - c.trade_date.date()).days
                if days_after > ROLL_OPEN_AFTER_CLOSE_MAX_DAYS:
                    continue
                if not _roll_pair_eligible(c, o):
                    continue
                ok = _position_key_for_trade(o)
                if ok is None or ok == ck:
                    continue
                delta = (o.trade_date - c.trade_date).total_seconds()
                if best is None or delta < best[0]:
                    best = (delta, o)
            if best is None:
                continue
            o = best[1]
            ev = _build_roll_event(c, o)
            if ev is None:
                continue
            used_open_ids.add(o.raw_id)
            events.append(ev)

    dedup: dict[tuple[str, str], RollEvent] = {}
    for ev in events:
        dedup[(ev.rolled_from_position_key, ev.rolled_to_position_key)] = ev
    return list(dedup.values())
