"""Binary release gate."""

from __future__ import annotations

from typing import Any

from .evaluator import assert_case_result_identity
from .evaluator_context import validate_evaluator_contexts
from .models import ReleaseError, digest_json, reward_success, utc_now
from .release_proof import assert_release_proof
from .subversion import validate_subversion_results


def _case_kind(case: dict[str, Any]) -> str:
    kind = case.get("case_kind")
    if kind not in {"witness", "control", "subversion"}:
        raise ReleaseError(
            "case_incomplete", "case_kind must be witness, control, or subversion"
        )
    return str(kind)


def _case_gate_results(results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "case_id": result["case_id"],
            "case_kind": result["case_kind"],
            "reward": result["reward"],
            "environment_version": result["environment_version"],
            "grader_digest": result["grader_digest"],
            "trace_ref": result.get("trace_ref"),
            "semantic_success": reward_success(result.get("reward")),
        }
        for result in results
    ]


def _rejection_entry(
    *,
    iteration: int,
    fixer_run_ref: str,
    patch_ref: str,
    v2_results: list[dict[str, Any]],
    surviving_witness_ids: list[str],
    broken_control_ids: list[str],
    gate_decision: str,
) -> dict[str, Any]:
    return {
        "iteration": iteration,
        "fixer_run_ref": fixer_run_ref,
        "patch_ref": patch_ref,
        "per_case_results": _case_gate_results(v2_results),
        "surviving_witness_ids": surviving_witness_ids,
        "broken_control_ids": broken_control_ids,
        "gate_decision": gate_decision,
        "recorded_at": utc_now(),
    }


def evaluate_gate(
    *,
    proof_set: dict[str, Any],
    environment_v2: str,
    grader_v2_digest: str,
    patch_ref: str,
    fixer_run_ref: str,
    v1_results: list[dict[str, Any]],
    v2_results: list[dict[str, Any]],
    evaluator_context_refs: list[dict[str, Any]],
    subversion_results: list[dict[str, Any]],
    release_candidate_ref: str,
    iteration: int = 0,
    rejection_history: list[dict[str, Any]] | None = None,
    family_variant_results: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Return a ReleaseProof candidate or raise for incomplete inputs."""

    validate_evaluator_contexts(
        evaluator_context_refs,
        expected_phase="v2",
        expected_environment=environment_v2,
        expected_grader_digest=grader_v2_digest,
    )
    by_case_v1 = {result["case_id"]: result for result in v1_results}
    by_case_v2 = {result["case_id"]: result for result in v2_results}
    missing_v2 = sorted(set(by_case_v1) - set(by_case_v2))
    if missing_v2:
        raise ReleaseError("missing_case", f"v2 results missing cases {missing_v2}")
    assert_case_result_identity(
        v1_results,
        expected_environment=proof_set["environment_v1"],
        expected_grader_digest=proof_set["grader_v1_digest"],
        phase="v1",
    )
    assert_case_result_identity(
        v2_results,
        expected_environment=environment_v2,
        expected_grader_digest=grader_v2_digest,
        phase="v2",
    )

    surviving = []
    broken = []
    for result in v1_results:
        if not reward_success(result.get("reward")):
            raise ReleaseError(
                "v1_failure", f"v1 case did not reproduce success: {result['case_id']}"
            )
    for result in v2_results:
        kind = _case_kind(result)
        if kind == "witness" and reward_success(result.get("reward")):
            surviving.append(result["case_id"])
        if kind == "control" and not reward_success(result.get("reward")):
            broken.append(result["case_id"])
        if kind == "subversion" and reward_success(result.get("reward")):
            surviving.append(result["case_id"])
    validate_subversion_results(
        subversion_results,
        evaluator_profiles=proof_set.get("evaluator_profiles"),
    )

    gate_status = "pass" if not surviving and not broken else "reject"
    history = list(rejection_history or [])
    if gate_status == "reject":
        history.append(
            _rejection_entry(
                iteration=iteration,
                fixer_run_ref=fixer_run_ref,
                patch_ref=patch_ref,
                v2_results=v2_results,
                surviving_witness_ids=surviving,
                broken_control_ids=broken,
                gate_decision=gate_status,
            )
        )
    release_proof = {
        "schema_version": 1,
        "release_proof_id": "releaseproof-"
        + digest_json(
            {
                "proof_set": proof_set["proof_set_id"],
                "environment_v2": environment_v2,
                "grader_v2_digest": grader_v2_digest,
                "patch_ref": patch_ref,
            }
        )[:16],
        "proof_set_id": proof_set["proof_set_id"],
        "environment_v1": proof_set["environment_v1"],
        "grader_v1_digest": proof_set["grader_v1_digest"],
        "environment_v2": environment_v2,
        "grader_v2_digest": grader_v2_digest,
        "patch_ref": patch_ref,
        "fixer_run_ref": fixer_run_ref,
        "v1_results": v1_results,
        "v2_results": v2_results,
        "subversion_results": subversion_results,
        "evaluator_context_refs": evaluator_context_refs,
        "rejection_history": history,
        "family_variant_results": family_variant_results or [],
        "witnesses_killed": len(
            [r for r in v2_results if r.get("case_kind") == "witness"]
        )
        - len(surviving),
        "controls_preserved": len(
            [r for r in v2_results if r.get("case_kind") == "control"]
        )
        - len(broken),
        "surviving_witness_ids": surviving,
        "broken_control_ids": broken,
        "gate_status": gate_status,
        "trace_links": [r.get("trace_ref") for r in v2_results if r.get("trace_ref")],
        "release_candidate_ref": release_candidate_ref,
        "created_at": utc_now(),
    }
    release_proof["content_digest"] = digest_json(release_proof)
    assert_release_proof(release_proof)
    return release_proof


def bounded_failure_proof(
    *,
    proof_set: dict[str, Any],
    environment_v2: str,
    grader_v2_digest: str,
    patch_ref: str,
    fixer_run_ref: str,
    rejection_history: list[dict[str, Any]],
    evaluator_context_refs: list[dict[str, Any]],
    release_candidate_ref: str,
    family_variant_results: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Record honest iteration exhaustion without inventing a passing release."""

    if not rejection_history:
        raise ReleaseError(
            "release_proof_incomplete", "bounded failure requires rejection history"
        )
    validate_evaluator_contexts(
        evaluator_context_refs,
        expected_phase="v2",
        expected_environment=environment_v2,
        expected_grader_digest=grader_v2_digest,
    )
    release_proof = {
        "schema_version": 1,
        "release_proof_id": "releaseproof-"
        + digest_json(
            {
                "proof_set": proof_set["proof_set_id"],
                "environment_v2": environment_v2,
                "grader_v2_digest": grader_v2_digest,
                "patch_ref": patch_ref,
                "status": "bounded_failure",
            }
        )[:16],
        "proof_set_id": proof_set["proof_set_id"],
        "environment_v1": proof_set["environment_v1"],
        "grader_v1_digest": proof_set["grader_v1_digest"],
        "environment_v2": environment_v2,
        "grader_v2_digest": grader_v2_digest,
        "patch_ref": patch_ref,
        "fixer_run_ref": fixer_run_ref,
        "v1_results": [],
        "v2_results": [],
        "subversion_results": [],
        "evaluator_context_refs": evaluator_context_refs,
        "rejection_history": rejection_history,
        "family_variant_results": family_variant_results or [],
        "witnesses_killed": 0,
        "controls_preserved": 0,
        "surviving_witness_ids": [],
        "broken_control_ids": [],
        "gate_status": "bounded_failure",
        "trace_links": [],
        "release_candidate_ref": release_candidate_ref,
        "created_at": utc_now(),
    }
    release_proof["content_digest"] = digest_json(release_proof)
    assert_release_proof(release_proof)
    return release_proof
