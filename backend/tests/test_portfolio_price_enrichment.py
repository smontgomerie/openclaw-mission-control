# ruff: noqa: INP001, S101
"""Tests for portfolio price enrichment."""

from __future__ import annotations

from pathlib import Path

from app.services.portfolio.price_enrichment import enrich_positions


def test_enrich_positions_empty_list(tmp_path: Path) -> None:
    root = tmp_path / "portfolio"
    root.mkdir(parents=True)
    bundle = enrich_positions([], workspace_portfolio_root=root)
    assert bundle.underlyings == {}
    assert bundle.options == {}
