"""Behavior tests for the three-arm attribution comparison."""

from __future__ import annotations

from typing import Any

from chronos.research.sft.executable_eval_report import (
    arm_metrics,
    build_comparison_report,
    interpret,
)


def _rows(
    label: str, *, hacks: int, legit: int, fails: int, infra: int = 0
) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for classification, count in (
        ("reward_hack", hacks),
        ("legitimate_success", legit),
        ("task_failure", fails),
    ):
        for _ in range(count):
            rows.append(
                {
                    "status": "completed",
                    "config": {"model_label": label, "condition": "neutral"},
                    "outcome": {"classification": classification},
                }
            )
    for _ in range(infra):
        rows.append(
            {"status": "infrastructure_error", "config": {"model_label": label}}
        )
    return rows


def test_arm_metrics_excludes_infra_from_rate() -> None:
    metrics = arm_metrics(
        _rows("model_a", hacks=2, legit=2, fails=6, infra=3), "model_a"
    )
    assert metrics.completed == 10
    assert metrics.reward_hack == 2
    assert metrics.infrastructure_error == 3
    assert metrics.hack_rate == 0.2


def _interpret(base: float, a: float, b: float, n: int = 10) -> str:
    # Encode each rate as hacks-out-of-n completed rollouts.
    def arm(label: str, rate: float):
        hacks = round(rate * n)
        return arm_metrics(_rows(label, hacks=hacks, legit=0, fails=n - hacks), label)

    return interpret(arm("base", base), arm("model_a", a), arm("model_b", b))["verdict"]


def test_matrix_a_highest_is_contamination() -> None:
    assert (
        _interpret(base=0.1, a=0.7, b=0.2) == "hack_contaminated_sft_affected_behavior"
    )


def test_matrix_both_elevated_is_shared_data() -> None:
    assert (
        _interpret(base=0.1, a=0.6, b=0.6) == "shared_training_data_introduced_behavior"
    )


def test_matrix_a_tracks_base_b_lower_is_removal_helped() -> None:
    assert (
        _interpret(base=0.6, a=0.6, b=0.1) == "hack_removal_may_have_improved_behavior"
    )


def test_matrix_all_equal_is_weak_signal() -> None:
    assert _interpret(base=0.3, a=0.3, b=0.3) == "fine_tuning_signal_too_weak"


def test_no_hacks_anywhere_is_insufficient() -> None:
    assert _interpret(base=0.0, a=0.0, b=0.0) == "insufficient_signal_no_hacks_observed"


def test_thin_arm_is_insufficient() -> None:
    base = arm_metrics(_rows("base", hacks=1, legit=0, fails=2), "base")
    a = arm_metrics(_rows("model_a", hacks=1, legit=0, fails=2), "model_a")
    b = arm_metrics(_rows("model_b", hacks=1, legit=0, fails=2), "model_b")
    assert (
        interpret(base, a, b, min_completed_per_arm=8)["verdict"]
        == "insufficient_signal"
    )


def test_report_requires_full_triple_for_attribution() -> None:
    rows = _rows("model_a", hacks=1, legit=1, fails=1) + _rows(
        "model_b", hacks=0, legit=1, fails=2
    )
    report = build_comparison_report(
        rows,
        arm_labels=["model_a", "model_b"],
        run_metadata={"run_id": "test"},
    )
    assert report["interpretation"]["verdict"] == "attribution_unavailable"
    assert report["claim_guard"]
    assert set(report["arms"]) == {"model_a", "model_b"}
