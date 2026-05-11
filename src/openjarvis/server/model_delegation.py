"""Complexity-aware model delegation for desktop chat requests."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable

from openjarvis.server.cloud_router import is_cloud_model
from openjarvis.server.models import ComplexityInfo, DelegationInfo

_LOCAL_SIZE_RE = re.compile(r"(?:(?:^|[:/_-])(?:e)?)(\d+(?:\.\d+)?)(?:b)\b", re.I)

_CLOUD_RANKS: dict[str, float] = {
    "gpt-4o-mini": 90,
    "gpt-4o": 120,
    "gpt-5-mini": 130,
    "gpt-5": 160,
    "gpt-5.4": 180,
    "o3-mini": 125,
    "claude-haiku-4-5": 100,
    "claude-sonnet-4-6": 155,
    "claude-opus-4-6": 185,
    "gemini-2.5-flash": 95,
    "gemini-2.5-pro": 145,
    "gemini-3-pro": 165,
    "gemini-3.1-pro-preview": 175,
    "openrouter/auto": 190,
}

_ESCALATION_SCORE = 0.55
_VERY_COMPLEX_SCORE = 0.80


@dataclass(frozen=True)
class ModelCandidate:
    """Comparable model candidate."""

    model_id: str
    score: float
    mode: str


def select_delegated_model(
    requested_model: str,
    available_models: Iterable[str],
    complexity: ComplexityInfo | None,
    *,
    auto_delegate: bool = True,
    allow_cloud_delegation: bool = False,
) -> DelegationInfo | None:
    """Return an escalation decision, or ``None`` when no change is needed."""

    requested = requested_model.strip()
    if not auto_delegate or not requested or complexity is None:
        return None
    if is_cloud_model(requested):
        return None
    if not _should_delegate(complexity):
        return None

    available = _dedupe(model.strip() for model in available_models if model.strip())
    requested_score = _model_score(requested)
    local_candidates = [
        candidate
        for candidate in (_candidate(model_id) for model_id in available)
        if candidate
        and candidate.mode == "local"
        and candidate.model_id != requested
        and candidate.score > requested_score
    ]

    selected = _select_candidate(local_candidates, complexity)
    mode = "local"
    reason = (
        f"{complexity.tier} request scored {complexity.score:.2f}; "
        "using a larger installed local model."
    )

    if selected is None and allow_cloud_delegation:
        cloud_candidates = [
            candidate
            for candidate in (_candidate(model_id) for model_id in available)
            if candidate
            and candidate.mode == "cloud"
            and candidate.model_id != requested
        ]
        selected = _select_candidate(cloud_candidates, complexity)
        mode = "cloud"
        reason = (
            f"{complexity.tier} request scored {complexity.score:.2f}; "
            "using an available cloud model because no larger local model is ready."
        )

    if selected is None:
        return None

    return DelegationInfo(
        requested_model=requested,
        selected_model=selected.model_id,
        mode=mode,
        reason=reason,
    )


def _should_delegate(complexity: ComplexityInfo) -> bool:
    return complexity.score >= _ESCALATION_SCORE or complexity.tier in {
        "complex",
        "very_complex",
    }


def _select_candidate(
    candidates: list[ModelCandidate],
    complexity: ComplexityInfo,
) -> ModelCandidate | None:
    if not candidates:
        return None
    ordered = sorted(candidates, key=lambda candidate: candidate.score)
    if complexity.score >= _VERY_COMPLEX_SCORE or complexity.tier == "very_complex":
        return ordered[-1]
    return ordered[0]


def _candidate(model_id: str) -> ModelCandidate | None:
    score = _model_score(model_id)
    if score <= 0:
        return None
    return ModelCandidate(
        model_id=model_id,
        score=score,
        mode="cloud" if is_cloud_model(model_id) else "local",
    )


def _model_score(model_id: str) -> float:
    if is_cloud_model(model_id):
        return _cloud_score(model_id)
    return _local_size_b(model_id)


def _local_size_b(model_id: str) -> float:
    matches = [float(match) for match in _LOCAL_SIZE_RE.findall(model_id)]
    return max(matches) if matches else 0.0


def _cloud_score(model_id: str) -> float:
    if model_id in _CLOUD_RANKS:
        return _CLOUD_RANKS[model_id]
    for prefix, rank in _CLOUD_RANKS.items():
        if model_id.startswith(prefix):
            return rank
    if model_id.startswith("openrouter/"):
        return 140
    return 100


def _dedupe(values: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


__all__ = ["select_delegated_model"]
