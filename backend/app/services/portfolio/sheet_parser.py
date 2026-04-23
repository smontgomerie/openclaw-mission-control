"""Parse Google Sheet rows (Positions + Trades) into normalized structures."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

SKIP_TICKERS = frozenset(
    {
        "",
        "OPTION",
        "OPTIONS",
        "STOCK",
        "STOCKS",
        "SYMBOL",
        "TICKER",
        "UNDERLYING",
    }
)


def extract_records(payload: object) -> list[dict[str, Any]]:
    """Normalize gog sheets JSON into list of header-keyed dicts."""
    if isinstance(payload, list):
        if len(payload) == 0:
            return []
        if isinstance(payload[0], list):
            header_row, *rows = payload
            headers = [str(item or "").strip() for item in header_row]
            return [dict(zip(headers, row, strict=False)) for row in rows]
        if isinstance(payload[0], dict):
            return list(payload)
    if isinstance(payload, dict):
        if isinstance(payload.get("values"), list):
            return extract_records(payload["values"])
        if isinstance(payload.get("rows"), list):
            return extract_records(payload["rows"])
        if isinstance(payload.get("data"), list):
            return extract_records(payload["data"])
    raise ValueError("Unsupported sheets JSON output shape")


def value_for(record: dict[str, Any], aliases: tuple[str, ...]) -> Any:
    for alias in aliases:
        if alias in record and str(record.get(alias) or "").strip():
            return record[alias]
    return None


def normalize_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def normalize_number(value: object) -> float | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return float(value)
    if isinstance(value, float):
        return value if value == value else None
    cleaned = str(value).replace("$", "").replace("%", "").replace(",", " ").replace(" ", "")
    cleaned = cleaned.strip()
    if not cleaned:
        return None
    try:
        parsed = float(cleaned)
    except ValueError:
        return None
    return parsed if parsed == parsed else None


def detect_instrument_type(record: dict[str, Any]) -> str:
    explicit = normalize_text(
        value_for(
            record,
            ("Instrument Type", "Type", "Asset Type", "Instrument", "Position Type"),
        )
    )
    if explicit:
        return explicit.lower()
    if value_for(
        record,
        (
            "Expiry",
            "Expiration",
            "Exp Date",
            "Expiration Date",
            "Strike",
            "Call/Put",
            "Option Side",
            "Option Type",
        ),
    ):
        return "option"
    return "stock"


def _option_side_from_record(record: dict[str, Any]) -> str | None:
    # Do not use a generic "Type" alias here: Positions sheets often label asset class
    # (Stock / Option) as "Type", which must not be mistaken for put/call.
    raw = normalize_text(
        value_for(record, ("Option Side", "Call/Put", "Put/Call", "Option Type")),
    )
    if not raw:
        return None
    low = raw.lower()
    if "call" in low:
        return "call"
    if "put" in low:
        return "put"
    return low


def _format_key_numeric(value: float | None) -> str:
    """Stable string for strike/qty segments (300 not 300.0; keep fractional strikes)."""
    if value is None:
        return "na"
    f = float(value)
    if f != f:  # NaN
        return "na"
    if f == int(f):
        return str(int(f))
    text = format(f, "f").rstrip("0").rstrip(".")
    return text or "0"


def build_position_key(
    *,
    ticker: str,
    instrument_type: str,
    option_side: str | None,
    strike: float | None,
    expiration: str | None,
    quantity: float | None,
) -> str:
    """Stable id for rationales, roll events, and snapshots.

    The third segment is always the literal ``base`` (historical contract). Call/put
    are encoded in ``instrument_type`` for options; ``option_side`` is not part of
    the key so sheet column quirks cannot drift stored rationale filenames.
    """
    _ = option_side
    base = [
        ticker or "unknown",
        instrument_type or "position",
        "base",
        _format_key_numeric(strike),
        expiration or "na",
        _format_key_numeric(quantity),
    ]
    joined = "-".join(str(x) for x in base).lower()
    joined = re.sub(r"[^a-z0-9.-]+", "-", joined)
    joined = re.sub(r"-+", "-", joined).strip("-")
    return joined


def parse_expiration(raw: str | None) -> str | None:
    if not raw:
        return None
    s = raw.strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%m/%d/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        return s


def compute_dte(expiration: str | None, as_of: datetime) -> int | None:
    if not expiration:
        return None
    try:
        exp = date.fromisoformat(expiration[:10])
    except ValueError:
        return None
    today = as_of.date()
    return max(0, (exp - today).days)


def normalize_position_record(
    record: dict[str, Any],
    as_of_iso: str,
    previous_by_key: dict[str, dict[str, Any]],
    rationale_exists: dict[str, bool],
) -> dict[str, Any] | None:
    ticker = normalize_text(
        value_for(record, ("Ticker", "Symbol", "Underlying", "Stock", "Instrument")),
    )
    if not ticker:
        return None
    ticker_u = ticker.upper()
    if ticker_u in SKIP_TICKERS:
        return None

    instrument_raw = detect_instrument_type(record)
    option_side = _option_side_from_record(record)
    if instrument_raw == "option" and option_side in ("call", "put"):
        instrument_type = option_side
    else:
        instrument_type = instrument_raw

    strategy = normalize_text(
        value_for(record, ("Strategy", "Trade Type", "Setup", "Trade")),
    )
    if strategy:
        strategy = strategy.lower()

    quantity = normalize_number(
        value_for(
            record,
            (
                "Qty",
                "Quantity",
                "Contracts",
                "Shares",
                "Qty Open",
                "Open Qty",
                "Open Quantity",
                "Position",
                "Size",
            ),
        ),
    )
    expiration = parse_expiration(
        normalize_text(
            value_for(record, ("Expiry", "Expiration", "Exp Date", "Expiration Date")),
        ),
    )
    strike = normalize_number(value_for(record, ("Strike", "Strike Price")))
    cost_basis = normalize_number(
        value_for(
            record,
            (
                "Cost Basis",
                "Basis",
                "Entry",
                "Avg Cost",
                "Average Cost",
                "Total Cost",
                "Cost",
                "Average Open Price",
            ),
        ),
    )
    mark = normalize_number(
        value_for(
            record,
            (
                "Mark",
                "Current Price",
                "Mid",
                "Price",
                "Last",
                "Market Value",
                "Equity",
                "Current Value",
                "Last Price",
            ),
        ),
    )
    unrealized_pnl = normalize_number(
        value_for(
            record,
            (
                "Unrealized P/L",
                "Unrealized P&L",
                "PnL",
                "P/L $",
                "Today's Return",
                "Total Return",
                "Return",
            ),
        ),
    )
    unrealized_pnl_pct = normalize_number(
        value_for(
            record,
            (
                "Unrealized P/L %",
                "Unrealized P&L %",
                "P/L %",
                "PnL %",
                "% Change",
                "Percent Change",
            ),
        ),
    )
    as_of_dt = datetime.fromisoformat(as_of_iso.replace("Z", "+00:00"))
    dte_raw = normalize_number(
        value_for(record, ("DTE", "Days to Expiry", "Days", "Days To Expiration")),
    )
    dte = int(dte_raw) if dte_raw is not None else compute_dte(expiration, as_of_dt)

    status = normalize_text(value_for(record, ("Status",))) or "open"
    status = status.lower()
    decide = normalize_text(value_for(record, ("DECIDE", "Decide", "Decision")))
    source_row_ref = normalize_text(value_for(record, ("Row Ref", "Source Row")))

    position: dict[str, Any] = {
        "as_of": as_of_iso,
        "source_row_ref": source_row_ref,
        "ticker": ticker_u,
        "instrument_type": instrument_type,
        "strategy": strategy,
        "option_side": option_side,
        "quantity": quantity,
        "expiration": expiration,
        "strike": strike,
        "cost_basis": cost_basis,
        "mark": mark,
        "unrealized_pnl": unrealized_pnl,
        "unrealized_pnl_pct": unrealized_pnl_pct,
        "dte": dte,
        "status": status,
    }
    position["position_key"] = build_position_key(
        ticker=ticker_u,
        instrument_type=instrument_type,
        option_side=option_side,
        strike=strike,
        expiration=expiration,
        quantity=quantity,
    )

    previous = previous_by_key.get(position["position_key"])
    rationale_ok = rationale_exists.get(position["position_key"], False)

    def same_value(left: object, right: object) -> bool:
        return (left is None and right is None) or (left == right)

    material_change = previous is None or not (
        same_value(previous.get("quantity"), quantity)
        and same_value(previous.get("cost_basis"), cost_basis)
        and same_value(previous.get("status"), status)
        and same_value(previous.get("mark"), mark)
    )
    # Only "no durable rationale" should drive needs_rationale / missing_rationale.
    # Material changes (e.g. mark move, or previous snapshot keyed under an old format)
    # must not look like missing rationale when a rationale file or DB row exists.
    needs_rationale = not rationale_ok
    latest_flags: list[dict[str, Any]] = []

    if not rationale_ok:
        latest_flags.append(
            {
                "code": "missing_rationale",
                "severity": "warning",
                "headline": "This position still needs a why",
                "summary": "Capture the thesis, exit plan, and reopen plan in the portfolio module.",
                "recommendation": (
                    "Open the portfolio module and save the rationale before the next review cycle."
                ),
            }
        )
    elif material_change:
        latest_flags.append(
            {
                "code": "position_inputs_changed",
                "severity": "info",
                "headline": "Position inputs changed since last snapshot",
                "summary": "Qty, basis, mark, or status differs from the last run; rationale is still on file.",
                "recommendation": "Re-read the thesis if the change affects risk or exit timing.",
            }
        )

    if decide:
        latest_flags.append(
            {
                "code": "decide_column_present",
                "severity": "warning",
                "headline": "Manual DECIDE marker present",
                "summary": decide,
                "recommendation": "Treat this as top-of-list in the morning review.",
            }
        )

    position["latest_flags"] = latest_flags
    position["needs_rationale"] = needs_rationale
    position["rationale_updated_at"] = None
    return position


def parse_positions_sheet(
    rows: list[list[object]],
    *,
    generated_at_iso: str,
    previous_positions: list[dict[str, Any]],
    rationale_exists: dict[str, bool],
) -> list[dict[str, Any]]:
    if not rows:
        return []
    records = extract_records(rows)
    prev_map = {p["position_key"]: p for p in previous_positions if p.get("position_key")}
    out: list[dict[str, Any]] = []
    for rec in records:
        norm = normalize_position_record(rec, generated_at_iso, prev_map, rationale_exists)
        if norm:
            out.append(norm)
    return out


def parse_trades_sheet(rows: list[list[object]]) -> list[dict[str, Any]]:
    if not rows:
        return []
    return extract_records(rows)
