"""Portfolio review rule evaluators (flags + recommendations)."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from app.services.portfolio.price_enrichment import EnrichmentBundle, OptionEnrichment


def _flag(
    code: str,
    headline: str,
    *,
    severity: str = "warning",
    summary: str | None = None,
    recommendation: str | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "headline": headline,
        "summary": summary,
        "recommendation": recommendation,
    }


def _parse_kelly_wheel_bands(workspace_root: Path) -> tuple[float | None, float | None]:
    """Return (low_cc_pct, high_cc_pct) from kelly_wheel_sizing.md if present."""
    path = workspace_root / "kelly_wheel_sizing.md"
    if not path.is_file():
        return None, None
    text = path.read_text(encoding="utf-8", errors="ignore")
    m = re.search(
        r"Bullish regime:\s*\*\*(\d+)\s*[–-]\s*(\d+)%\*\*\s+shares covered",
        text,
        re.I,
    )
    if not m:
        return None, None
    low = float(m.group(1)) / 100.0
    high = float(m.group(2)) / 100.0
    return low, high


def _has_flag(flags: list[dict[str, Any]], code: str) -> bool:
    return any(isinstance(f, dict) and f.get("code") == code for f in flags)


def _append_flag(position: dict[str, Any], flag: dict[str, Any]) -> None:
    flags: list[dict[str, Any]] = list(position.get("latest_flags") or [])
    if not _has_flag(flags, str(flag["code"])):
        flags.append(flag)
    position["latest_flags"] = flags


def apply_rules(
    positions: list[dict[str, Any]],
    bundle: EnrichmentBundle,
    *,
    workspace_root: Path,
) -> None:
    """Mutate positions in place with additional latest_flags."""
    cc_low, cc_high = _parse_kelly_wheel_bands(workspace_root)

    # Shares per underlying for covered-call coverage heuristic
    stock_shares: dict[str, float] = {}
    short_call_shares: dict[str, float] = {}
    for p in positions:
        t = str(p.get("ticker") or "").upper()
        it = str(p.get("instrument_type") or "").lower()
        qty = p.get("quantity")
        if not isinstance(qty, (int, float)):
            continue
        q = abs(float(qty))
        if it == "stock" and q > 0:
            stock_shares[t] = stock_shares.get(t, 0.0) + q
        if it == "call" and q > 0:
            short_call_shares[t] = short_call_shares.get(t, 0.0) + q * 100.0

    for p in positions:
        flags: list[dict[str, Any]] = list(p.get("latest_flags") or [])
        p["latest_flags"] = flags

        strategy = str(p.get("strategy") or "").lower()
        it = str(p.get("instrument_type") or "").lower()
        ticker = str(p.get("ticker") or "").upper()
        dte = p.get("dte")
        dte_i = (
            int(dte)
            if isinstance(dte, int)
            else (int(dte) if isinstance(dte, float) and dte == int(dte) else None)
        )

        upnl_pct = p.get("unrealized_pnl_pct")
        if (
            it in ("call", "put", "option")
            and isinstance(upnl_pct, (int, float))
            and float(upnl_pct) >= 50
        ):
            rec = (
                f"Consider closing {ticker} early and reopening a fresh 7-21 DTE CSP cycle."
                if strategy == "csp"
                else (
                    f"Consider closing {ticker} early and reopening a fresh 7-21 DTE wheel/CSP cycle."
                    if strategy == "wheel"
                    else f"Consider closing {ticker} early and reassessing the next premium-selling cycle."
                )
            )
            _append_flag(
                p,
                _flag(
                    "profit_target_hit",
                    "50%+ gain threshold hit",
                    summary=f"{ticker} has reached a 50%+ unrealized gain threshold.",
                    recommendation=rec,
                ),
            )

        if isinstance(dte_i, int) and dte_i <= 3 and it in ("call", "put", "option"):
            rec = (
                "Decide whether to let expire, close, roll, or accept assignment."
                if strategy == "csp"
                else (
                    "Decide whether to let expire, close, or roll into the next covered-call cycle."
                    if strategy in ("covered_call", "wheel")
                    else "Review this position before expiry."
                )
            )
            _append_flag(
                p,
                _flag(
                    "near_expiry",
                    "Near expiry",
                    summary=f"{ticker} has {dte_i} DTE remaining.",
                    recommendation=rec,
                ),
            )

        u = bundle.underlyings.get(ticker)
        opt_e = bundle.options.get(str(p.get("position_key") or ""))
        spot = u.spot if u else None
        strike = p.get("strike")

        if it in ("call", "put") and spot and isinstance(strike, (int, float)):
            if it == "call" and float(spot) > float(strike):
                _append_flag(
                    p,
                    _flag(
                        "breached_short_strike",
                        "Short call ITM",
                        summary=f"{ticker} spot {spot:.2f} above strike {strike}.",
                        recommendation="Assignment risk: consider rolling, closing, or accepting assignment.",
                    ),
                )
            if it == "put" and float(spot) < float(strike):
                _append_flag(
                    p,
                    _flag(
                        "breached_short_strike",
                        "Short put ITM",
                        summary=f"{ticker} spot {spot:.2f} below strike {strike}.",
                        recommendation="Assignment risk: decide roll, accept shares, or close.",
                    ),
                )

        if (
            cc_low is not None
            and cc_high is not None
            and ticker in stock_shares
            and stock_shares[ticker] > 0
        ):
            cov = short_call_shares.get(ticker, 0.0) / stock_shares[ticker]
            if cov < cc_low:
                _append_flag(
                    p,
                    _flag(
                        "cc_coverage_low",
                        "Covered-call coverage below target",
                        summary=f"{ticker} overwrite ~{cov:.0%} (target {cc_low:.0%}-{cc_high:.0%}).",
                        recommendation="Consider selling additional calls if thesis allows.",
                    ),
                )
            elif cov > cc_high + 0.01:
                _append_flag(
                    p,
                    _flag(
                        "cc_coverage_high",
                        "Covered-call coverage above target",
                        summary=f"{ticker} overwrite ~{cov:.0%} (target up to {cc_high:.0%}).",
                        recommendation="Consider fewer / wider strikes if you want more upside.",
                    ),
                )

        if strategy == "csp" and it in ("put",) and isinstance(strike, (int, float)):
            collateral = float(strike) * 100.0 * abs(float(p.get("quantity") or 1))
            upnl = p.get("unrealized_pnl")
            if collateral > 0 and isinstance(upnl, (int, float)) and float(upnl) < 0:
                dd = abs(float(upnl)) / collateral * 100.0
                if dd > 4.0:
                    _append_flag(
                        p,
                        _flag(
                            "csp_drawdown_warn",
                            "CSP drawdown vs collateral",
                            summary=f"Unrealized loss ~{dd:.1f}% of collateral.",
                            recommendation="Revisit strike / roll plan vs Kelly wheel sizing.",
                        ),
                    )

        if isinstance(dte_i, int) and dte_i < 14 and it in ("call", "put"):
            _append_flag(
                p,
                _flag(
                    "earnings_in_window",
                    "Earnings window",
                    summary=f"{ticker} has {dte_i} DTE — check earnings calendar.",
                    recommendation="Reduce size or widen strikes into earnings if needed.",
                ),
            )

        if isinstance(opt_e, OptionEnrichment) and opt_e.implied_volatility is not None:
            iv = float(opt_e.implied_volatility)
            if iv > 0.8:
                _append_flag(
                    p,
                    _flag(
                        "high_iv_rank",
                        "Elevated IV",
                        summary="Implied volatility is elevated (annualized).",
                        recommendation="Favor taking premium or rolling out if thesis intact.",
                    ),
                )
            elif iv < 0.12 and isinstance(upnl_pct, (int, float)) and float(upnl_pct) < 50:
                _append_flag(
                    p,
                    _flag(
                        "compressed_iv",
                        "Compressed IV",
                        summary="IV is relatively low.",
                        recommendation="Consider taking profits earlier on remaining premium.",
                    ),
                )

        if (
            it in ("call", "put")
            and isinstance(dte_i, int)
            and dte_i < 7
            and isinstance(upnl_pct, (int, float))
            and 50 <= float(upnl_pct) < 80
        ):
            _append_flag(
                p,
                _flag(
                    "roll_candidate",
                    "Roll candidate",
                    summary=f"{ticker} option inside final week with partial profit.",
                    recommendation="Evaluate roll for credit vs close for risk reduction.",
                ),
            )
