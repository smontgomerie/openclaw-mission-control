"""Write portfolio snapshot and review artifacts to the shared workspace."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def write_artifacts(
    portfolio_root: Path,
    snapshot: dict[str, Any],
    review: dict[str, Any],
) -> tuple[Path, Path, Path]:
    """Persist snapshot + review JSON/MD; update latest.json."""
    snapshots_dir = portfolio_root / "snapshots"
    reviews_dir = portfolio_root / "reviews"
    snapshots_dir.mkdir(parents=True, exist_ok=True)
    reviews_dir.mkdir(parents=True, exist_ok=True)

    generated = str(snapshot["generated_at"])
    timestamp_key = generated.replace(":", "-").replace(".", "-")
    snapshot_path = snapshots_dir / f"{timestamp_key}.json"
    review_id = str(review["id"])
    review_json_path = reviews_dir / f"{review_id}.json"
    review_md_path = reviews_dir / f"{review_id}.md"
    latest_path = portfolio_root / "latest.json"

    pretty_snapshot = json.dumps(snapshot, indent=2)
    snapshot_path.write_text(pretty_snapshot, encoding="utf-8")
    latest_path.write_text(pretty_snapshot, encoding="utf-8")
    review_json_path.write_text(json.dumps(review, indent=2), encoding="utf-8")
    review_md_path.write_text(str(review.get("summary_markdown") or ""), encoding="utf-8")

    return snapshot_path, review_json_path, review_md_path


def build_review_markdown(
    positions: list[dict[str, Any]],
    roll_lines: list[str],
) -> tuple[str, list[dict[str, Any]]]:
    """Build summary_markdown and flat actions list from positions."""
    action_now: list[str] = []
    watch: list[str] = []
    missing_rationale: list[str] = []
    candidate_trades: list[str] = []
    coverage: list[str] = []
    top_level_actions: list[dict[str, Any]] = []

    for position in positions:
        ticker = str(position.get("ticker") or "")
        for flag in position.get("latest_flags") or []:
            if not isinstance(flag, dict):
                continue
            code = str(flag.get("code") or "")
            rec = str(flag.get("recommendation") or "")
            summ = str(flag.get("summary") or "")
            if code == "missing_rationale":
                missing_rationale.append(
                    f"- {ticker}: capture the reason, risk plan, and reopen plan."
                )
            elif code == "profit_target_hit":
                action_now.append(f"- {ticker}: {rec}")
                candidate_trades.append(
                    f"- {ticker}: if the thesis still holds, queue a fresh 7-21 DTE "
                    f"{position.get('strategy') or 'premium-selling'} setup after closing this winner.",
                )
            elif code == "near_expiry":
                watch.append(f"- {ticker}: {rec}")
            elif code == "decide_column_present":
                action_now.append(f"- {ticker}: {summ}")
            elif code in (
                "breached_short_strike",
                "csp_drawdown_warn",
                "roll_candidate",
                "high_iv_rank",
            ):
                action_now.append(f"- {ticker}: {summ} — {rec}")
            elif code in (
                "cc_coverage_low",
                "cc_coverage_high",
                "earnings_in_window",
                "compressed_iv",
            ):
                coverage.append(f"- {ticker}: {summ}")
            top_level_actions.append(flag)

    sections: list[str] = []
    sections.append("# Rolls detected (auto-carried)")
    sections.append(
        "\n".join(roll_lines) if roll_lines else "- No rolls detected from Trades in this run."
    )
    sections.append("\n# Action now")
    sections.append(
        "\n".join(action_now) if action_now else "- No immediate close/roll actions today."
    )
    sections.append("\n# Watch")
    sections.append(
        "\n".join(watch) if watch else "- No near-expiry positions need urgent attention."
    )
    sections.append("\n# Coverage & exposure")
    sections.append(
        "\n".join(coverage) if coverage else "- No coverage / earnings flags beyond normal ranges."
    )
    sections.append("\n# Missing rationale")
    sections.append(
        "\n".join(missing_rationale)
        if missing_rationale
        else "- Every open position has a saved rationale."
    )
    sections.append("\n# Candidate reopen / next trades")
    sections.append(
        (
            "\n".join(candidate_trades)
            if candidate_trades
            else "- No close-and-reopen candidates were triggered by the fixed rules today."
        ),
    )

    md = "\n".join(sections)
    return md, top_level_actions
