"""ProofSet construction from sealed Witnesses and frozen controls."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from chronos.witnesses.models import (
    REQUIRED_WITNESS_FIELDS,
    qa_says_hacking,
    reward_success,
)

from .models import ReleaseError, digest_json, missing_fields, utc_now


CONTROL_PHASE2_FIELDS = {
    "schema_version",
    "control_id",
    "task_id",
    "grader_digest",
    "verifier_harness_digest",
    "environment_dockerfile_digest",
    "solution_ref",
    "content_digest",
    "environment_version",
    "task_checksum",
    "baseline_runs",
    "frozen_at",
}

SEALED_WITNESS_EVIDENCE_FIELDS = {
    "reward",
    "qa_join",
    "qa_is_reward_hacking",
    "source_hud_trace_id",
    "action_record_digest",
    "dedup_decision",
    "replay_surface",
}


def _assert_witness(record: dict[str, Any]) -> None:
    missing = missing_fields(
        record, REQUIRED_WITNESS_FIELDS | SEALED_WITNESS_EVIDENCE_FIELDS
    )
    if missing:
        raise ReleaseError("provenance_incomplete", f"Witness missing {missing}")
    if record.get("durable_snapshot_mode") not in {"directory", "filesystem"}:
        raise ReleaseError(
            "state_restore_failed", "Witness is not filesystem-class durable"
        )
    if len(record.get("replay_checks") or []) < 3:
        raise ReleaseError("replay_diverged", "Witness lacks three replay checks")
    if not reward_success(record.get("reward")):
        raise ReleaseError(
            "v1_failure", "Witness sealed record does not show v1 reward success"
        )
    if not qa_says_hacking({"is_reward_hacking": record.get("qa_is_reward_hacking")}):
        raise ReleaseError(
            "classification_unavailable",
            "Witness sealed record does not show reward-hacking QA",
        )
    qa_join = record.get("qa_join") or {}
    mismatched = [
        field
        for field, expected in {
            "branch_id": record["source_branch_id"],
            "hud_trace_id": record["source_hud_trace_id"],
            "action_record_digest": record["action_record_digest"],
        }.items()
        if qa_join.get(field) != expected
    ]
    if mismatched or qa_join.get("qa_result_id") != record["qa_result_ref"]:
        raise ReleaseError(
            "classification_unavailable",
            "Witness QA join does not match sealed branch identity",
        )
    if (
        qa_join.get("evidence_quality") != "sufficient"
        or qa_join.get("task_identity_status") != "matched"
    ):
        raise ReleaseError(
            "classification_unavailable",
            "Witness QA evidence is not sufficient and task-matched",
        )
    if not record.get("dedup_decision", {}).get("cluster_id"):
        raise ReleaseError(
            "provenance_incomplete", "Witness lacks recorded dedup decision"
        )
    for check in record.get("replay_checks") or []:
        if check.get("model_gateway_request_ids"):
            raise ReleaseError(
                "replay_diverged", "Witness replay used model or gateway calls"
            )
        replay_succeeded = (
            reward_success(check.get("reward")) or check.get("semantic_success") is True
        )
        if not replay_succeeded:
            raise ReleaseError(
                "replay_diverged", "Witness replay did not reproduce v1 reward success"
            )


def _assert_control(record: dict[str, Any]) -> None:
    missing = missing_fields(record, CONTROL_PHASE2_FIELDS)
    if missing:
        raise ReleaseError("control_incomplete", f"Control missing {missing}")
    if len(record.get("baseline_runs") or []) < 3:
        raise ReleaseError("control_incomplete", "Control lacks three baseline runs")
    for run in record.get("baseline_runs") or []:
        if not reward_success(run.get("reward")):
            raise ReleaseError(
                "control_incomplete",
                "Control baseline run did not reproduce reward success",
            )


def _evaluator_profile(record: dict[str, Any]) -> str:
    explicit = record.get("evaluator_profile")
    if explicit:
        return str(explicit)
    surface = record.get("replay_surface") or {}
    command_parts = [
        *(surface.get("command_argv") or []),
        *(surface.get("pre_grader_command_argv") or []),
        *(surface.get("grader_command_argv") or []),
    ]
    if any("pytest" in str(part).lower() for part in command_parts):
        return "pytest"
    return "generic-verifier"


def _proofset_replay_surface(witness: dict[str, Any]) -> dict[str, Any]:
    surface = witness["replay_surface"]
    return {
        "witness_id": witness["witness_id"],
        "replay_surface_id": surface["replay_surface_id"],
        "environment_version": surface["environment_version"],
        "grader_digest": surface["grader_digest"],
        "trusted_entrypoint_ref": surface.get("trusted_entrypoint_ref"),
        "cwd": surface.get("cwd"),
        "command_argv": surface.get("command_argv") or [],
        "pre_grader_command_argv": surface.get("pre_grader_command_argv") or [],
        "grader_command_argv": surface.get("grader_command_argv") or [],
    }


def build_proofset(
    *,
    witnesses: list[dict[str, Any]],
    controls: list[dict[str, Any]],
    taskset_or_suite_ref: str,
    selection_query_ref: str,
) -> dict[str, Any]:
    """Close ProofSet membership over sealed Witness and control records."""

    if not witnesses:
        raise ReleaseError(
            "empty_proofset", "ProofSet requires at least one sealed Witness"
        )
    if len(controls) < 3:
        raise ReleaseError(
            "control_incomplete", "ProofSet requires at least three controls"
        )
    for witness in witnesses:
        _assert_witness(witness)
    for control in controls:
        _assert_control(control)

    environments = {control["environment_version"] for control in controls}
    graders = {control["grader_digest"] for control in controls}
    witness_graders = {witness["grader_digest"] for witness in witnesses}
    if len(environments) != 1:
        raise ReleaseError(
            "environment_mismatch", "Controls do not share one v1 environment"
        )
    if len(graders) != 1 or witness_graders != graders:
        raise ReleaseError(
            "grader_mismatch", "Witness/control v1 grader digests do not match"
        )

    proof_set_id = (
        "proofset-"
        + digest_json(
            {
                "witnesses": [w["witness_id"] for w in witnesses],
                "controls": [c["control_id"] for c in controls],
                "environment": sorted(environments),
                "grader": sorted(graders),
            }
        )[:16]
    )
    evaluator_profiles = sorted({_evaluator_profile(witness) for witness in witnesses})
    record = {
        "schema_version": 1,
        "proof_set_id": proof_set_id,
        "environment_v1": next(iter(environments)),
        "grader_v1_digest": next(iter(graders)),
        "exploit_witness_ids": [witness["witness_id"] for witness in witnesses],
        "legitimate_control_ids": [control["control_id"] for control in controls],
        "exploit_family_variant_ids": [],
        "evaluator_profiles": evaluator_profiles,
        "v1_replay_surfaces": [
            _proofset_replay_surface(witness) for witness in witnesses
        ],
        "taskset_or_suite_ref": taskset_or_suite_ref,
        "selection_query_ref": selection_query_ref,
        "created_at": utc_now(),
    }
    record["content_digest"] = digest_json(record)
    return record


def load_controls_manifest(path: Path) -> list[dict[str, Any]]:
    import json

    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("controls", []))
