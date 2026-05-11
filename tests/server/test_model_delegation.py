"""Tests for complexity-aware model delegation."""

from __future__ import annotations

from openjarvis.server.model_delegation import select_delegated_model
from openjarvis.server.models import ComplexityInfo


def _complexity(score: float, tier: str = "complex") -> ComplexityInfo:
    return ComplexityInfo(score=score, tier=tier, suggested_max_tokens=8192)


def test_selects_next_larger_local_model_for_complex_request() -> None:
    decision = select_delegated_model(
        "qwen3.5:4b",
        ["qwen3.5:4b", "qwen3.5:9b", "qwen3.5:27b"],
        _complexity(0.62),
    )

    assert decision is not None
    assert decision.selected_model == "qwen3.5:9b"
    assert decision.mode == "local"


def test_selects_largest_local_model_for_very_complex_request() -> None:
    decision = select_delegated_model(
        "qwen3.5:4b",
        ["qwen3.5:4b", "qwen3.5:9b", "qwen3.5:27b"],
        _complexity(0.85, "very_complex"),
    )

    assert decision is not None
    assert decision.selected_model == "qwen3.5:27b"


def test_does_not_delegate_simple_request() -> None:
    decision = select_delegated_model(
        "qwen3.5:4b",
        ["qwen3.5:4b", "qwen3.5:9b"],
        _complexity(0.20, "simple"),
    )

    assert decision is None


def test_cloud_delegation_requires_opt_in() -> None:
    decision = select_delegated_model(
        "qwen3.5:27b",
        ["qwen3.5:27b", "claude-opus-4-6"],
        _complexity(0.85, "very_complex"),
        allow_cloud_delegation=False,
    )

    assert decision is None


def test_cloud_delegation_uses_available_cloud_model_when_allowed() -> None:
    decision = select_delegated_model(
        "qwen3.5:27b",
        ["qwen3.5:27b", "claude-sonnet-4-6", "claude-opus-4-6"],
        _complexity(0.85, "very_complex"),
        allow_cloud_delegation=True,
    )

    assert decision is not None
    assert decision.selected_model == "claude-opus-4-6"
    assert decision.mode == "cloud"
