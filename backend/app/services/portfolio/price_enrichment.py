"""Tiered live price / options enrichment via yfinance."""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def bs_delta_call(spot: float, strike: float, t_years: float, rate: float, iv: float) -> float:
    if spot <= 0 or strike <= 0 or t_years <= 0 or iv <= 0:
        return 1.0 if spot > strike else 0.0
    d1 = (math.log(spot / strike) + (rate + 0.5 * iv * iv) * t_years) / (iv * math.sqrt(t_years))
    return _norm_cdf(d1)


def bs_delta_put(spot: float, strike: float, t_years: float, rate: float, iv: float) -> float:
    return bs_delta_call(spot, strike, t_years, rate, iv) - 1.0


@dataclass
class UnderlyingSnapshot:
    spot: float | None = None
    change_1d_pct: float | None = None
    change_5d_pct: float | None = None
    change_1mo_pct: float | None = None
    week52_low: float | None = None
    week52_high: float | None = None


@dataclass
class OptionEnrichment:
    last_price: float | None = None
    bid: float | None = None
    ask: float | None = None
    implied_volatility: float | None = None
    delta: float | None = None
    distance_to_strike_pct: float | None = None


@dataclass
class EnrichmentBundle:
    underlyings: dict[str, UnderlyingSnapshot] = field(default_factory=dict)
    options: dict[str, OptionEnrichment] = field(default_factory=dict)
    risk_free_rate: float = 0.05


def _underlying_tickers(positions: list[dict[str, Any]]) -> set[str]:
    out: set[str] = set()
    for p in positions:
        t = str(p.get("ticker") or "").upper()
        if t:
            out.add(t)
    return out


def _needs_full_enrichment(p: dict[str, Any]) -> bool:
    dte = p.get("dte")
    if isinstance(dte, int) and dte < 30:
        return True
    it = str(p.get("instrument_type") or "").lower()
    if it in ("call", "put", "option"):
        for fl in p.get("latest_flags") or []:
            if isinstance(fl, dict) and fl.get("code") in (
                "near_expiry",
                "profit_target_hit",
                "breached_short_strike",
                "roll_candidate",
            ):
                return True
    return False


def enrich_positions(
    positions: list[dict[str, Any]],
    *,
    workspace_portfolio_root: Path,
) -> EnrichmentBundle:
    """Populate underlyings (light) and options (tiered full)."""
    try:
        import yfinance as yf  # type: ignore[import-untyped]
    except ImportError:
        return EnrichmentBundle()

    tickers = sorted(_underlying_tickers(positions))
    if not tickers:
        return EnrichmentBundle()

    bundle = EnrichmentBundle()
    # Risk-free proxy
    try:
        irx = yf.Ticker("^IRX")
        ih = irx.history(period="5d")
        if ih is not None and len(ih) > 0 and "Close" in ih.columns:
            last = float(ih["Close"].iloc[-1])
            bundle.risk_free_rate = max(0.0, last / 100.0)
    except Exception:
        pass

    # Light: batch history for all underlyings
    try:
        hist = yf.download(
            tickers,
            period="3mo",
            interval="1d",
            group_by="ticker",
            threads=True,
            progress=False,
        )
    except Exception:
        hist = None

    def spot_and_changes(sym: str) -> UnderlyingSnapshot:
        snap = UnderlyingSnapshot()
        if hist is None or len(hist) == 0:
            return snap
        try:
            if len(tickers) == 1:
                closes = hist["Close"] if "Close" in hist.columns else None
            elif hasattr(hist.columns, "levels") and sym in hist.columns.get_level_values(0):
                closes = hist[(sym, "Close")]
            else:
                closes = None
            if closes is None or len(closes) < 2:
                return snap
            c = closes.dropna()
            if len(c) == 0:
                return snap
            last = float(c.iloc[-1])
            snap.spot = last
            prev = float(c.iloc[-2])
            snap.change_1d_pct = ((last / prev) - 1.0) * 100.0 if prev else None
            if len(c) >= 6:
                snap.change_5d_pct = ((last / float(c.iloc[-6])) - 1.0) * 100.0
            if len(c) >= 22:
                snap.change_1mo_pct = ((last / float(c.iloc[-22])) - 1.0) * 100.0
            snap.week52_low = float(c.min())
            snap.week52_high = float(c.max())
        except Exception:
            pass
        return snap

    for sym in tickers:
        bundle.underlyings[sym] = spot_and_changes(sym)

    # Full tier for selected options
    for p in positions:
        pk = str(p.get("position_key") or "")
        sym = str(p.get("ticker") or "").upper()
        it = str(p.get("instrument_type") or "").lower()
        if it not in ("call", "put"):
            continue
        if not _needs_full_enrichment(p):
            u = bundle.underlyings.get(sym)
            spot = u.spot if u else None
            strike = p.get("strike")
            distance_pct: float | None = None
            if spot and isinstance(strike, (int, float)) and strike:
                distance_pct = (float(spot) - float(strike)) / float(strike) * 100.0
                if it == "put":
                    distance_pct = -distance_pct
                bundle.options[pk] = OptionEnrichment(distance_to_strike_pct=distance_pct)
            continue
        exp = p.get("expiration")
        strike = p.get("strike")
        if not exp or strike is None:
            continue
        iv: float | None = None
        last_p: float | None = None
        bid: float | None = None
        ask: float | None = None
        try:
            tkr = yf.Ticker(sym)
            chain = tkr.option_chain(str(exp))
            opt_df = chain.calls if it == "call" else chain.puts
            row = opt_df.loc[(opt_df["strike"] - float(strike)).abs().idxmin()]
            iv = float(row["impliedVolatility"]) if "impliedVolatility" in row else None
            last_p = (
                float(row["lastPrice"])
                if "lastPrice" in row and not math.isnan(row["lastPrice"])
                else None
            )
            bid = float(row["bid"]) if "bid" in row else None
            ask = float(row["ask"]) if "ask" in row else None
        except Exception:
            continue
        u = bundle.underlyings.get(sym)
        spot = u.spot if u else None
        t_years = max(1e-6, (float(p.get("dte") or 1)) / 365.0)
        delta: float | None = None
        if spot and iv and iv > 0:
            delta = (
                bs_delta_call(float(spot), float(strike), t_years, bundle.risk_free_rate, iv)
                if it == "call"
                else bs_delta_put(float(spot), float(strike), t_years, bundle.risk_free_rate, iv)
            )
        distance_pct = None
        if spot and strike:
            distance_pct = (float(spot) - float(strike)) / float(strike) * 100.0
            if it == "put":
                distance_pct = -distance_pct
        bundle.options[pk] = OptionEnrichment(
            last_price=last_p,
            bid=bid,
            ask=ask,
            implied_volatility=iv,
            delta=delta,
            distance_to_strike_pct=distance_pct,
        )

    return bundle
