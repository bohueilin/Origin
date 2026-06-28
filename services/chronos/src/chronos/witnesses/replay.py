"""Deterministic replay gate."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from .models import WitnessError, digest_json, reward_success


ReplayFn = Callable[[dict[str, Any], int], dict[str, Any]]


def require_three_replays(
    candidate: dict[str, Any], replay_fn: ReplayFn
) -> list[dict[str, Any]]:
    """Run three fresh restores and reject any model call or divergence."""

    expected_actions = candidate["action_record_digest"]
    expected_grader = candidate["grader_digest"]
    checks: list[dict[str, Any]] = []
    restore_refs: set[str] = set()
    for attempt in range(1, 4):
        result = replay_fn(candidate, attempt)
        if result.get("model_gateway_request_ids"):
            raise WitnessError(
                "replay_diverged", "replay attempted model/gateway calls"
            )
        if result.get("grader_digest") != expected_grader:
            raise WitnessError("grader_mismatch", "replay grader digest changed")
        if result.get("action_record_digest") != expected_actions:
            raise WitnessError("replay_diverged", "recorded action order diverged")
        if not reward_success(result.get("reward")):
            raise WitnessError(
                "replay_diverged", "replay did not reproduce reward success"
            )
        restore_ref = result.get("restore_ref")
        if not restore_ref or restore_ref in restore_refs:
            raise WitnessError(
                "replay_diverged", "replay did not use three fresh restores"
            )
        restore_refs.add(restore_ref)
        checks.append(
            {
                "attempt": attempt,
                "reward": result["reward"],
                "restore_ref": restore_ref,
                "verifier_output_digest": result["verifier_output_digest"],
                "file_diff_digest": result["file_diff_digest"],
                "semantic_success": True,
                "content_digest": digest_json(result),
            }
        )
    return checks
