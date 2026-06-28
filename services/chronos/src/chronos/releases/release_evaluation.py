"""Plan 005 release evaluation orchestration."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .artifact_store import ReleaseArtifactStore
from .gate import evaluate_gate
from .harden_adapter import run_harden_v0
from .models import ReleaseError, digest_json, utc_now
from .release_proof import seal_release_proof
from .subversion import GENERIC_VERIFIER_SUBVERSION_CHECKS, PYTEST_SUBVERSION_CHECKS


def load_release_results(path: Path) -> dict[str, Any]:
    """Load externally recorded real v1/v2 evaluator results."""

    if not path.exists():
        raise ReleaseError(
            "release_results_missing", f"missing release results: {path}"
        )
    record = json.loads(path.read_text(encoding="utf-8"))
    required = {
        "environment_v2",
        "grader_v2_digest",
        "patch_ref",
        "fixer_run_ref",
        "v1_results",
        "v2_results",
        "evaluator_context_refs",
        "subversion_results",
        "release_candidate_ref",
    }
    missing = sorted(
        key for key in required if key not in record or record[key] in (None, "", [])
    )
    if missing:
        raise ReleaseError(
            "release_results_incomplete", f"release results missing {missing}"
        )
    return record


def expected_subversion_case_ids(proof_set: dict[str, Any]) -> list[str]:
    profiles = set(proof_set.get("evaluator_profiles") or [])
    if "pytest" in profiles:
        return sorted(PYTEST_SUBVERSION_CHECKS)
    return sorted(GENERIC_VERIFIER_SUBVERSION_CHECKS)


def validate_harden_task_source_surface(
    *, proof_set: dict[str, Any], task_source: Path
) -> None:
    """Require harden-v0 to run against the sealed v1 replay/grader surface."""

    surface_path = task_source / "chronos-replay-surface.json"
    if not surface_path.exists():
        raise ReleaseError(
            "harden_surface_mismatch",
            (
                "harden task source does not declare chronos-replay-surface.json; "
                "detached harden-v0 task layouts cannot prove the sealed Witness replay surface"
            ),
        )
    declared = json.loads(surface_path.read_text(encoding="utf-8"))
    expected = proof_set.get("v1_replay_surfaces") or []
    if not expected:
        raise ReleaseError(
            "harden_surface_mismatch",
            "ProofSet does not record sealed v1 replay surfaces",
        )
    expected_by_id = {surface["replay_surface_id"]: surface for surface in expected}
    declared_surfaces = declared.get("v1_replay_surfaces") or []
    missing = sorted(
        set(expected_by_id)
        - {surface.get("replay_surface_id") for surface in declared_surfaces}
    )
    if missing:
        raise ReleaseError(
            "harden_surface_mismatch",
            f"harden task source missing replay surfaces {missing}",
        )
    mismatches: list[str] = []
    for surface in declared_surfaces:
        surface_id = surface.get("replay_surface_id")
        if surface_id not in expected_by_id:
            continue
        expected_surface = expected_by_id[surface_id]
        for field in (
            "environment_version",
            "grader_digest",
            "trusted_entrypoint_ref",
            "cwd",
            "command_argv",
            "pre_grader_command_argv",
            "grader_command_argv",
        ):
            if surface.get(field) != expected_surface.get(field):
                mismatches.append(f"{surface_id}:{field}")
    if mismatches:
        raise ReleaseError(
            "harden_surface_mismatch",
            f"harden task source replay surface does not match ProofSet: {sorted(mismatches)}",
        )


def build_harden_blocker_artifact(
    *,
    proof_set: dict[str, Any],
    harden_run: dict[str, Any] | None,
    release_results_ref: str | None,
    reason: str,
) -> dict[str, Any]:
    """Record why the release gate could not honestly seal."""

    record = {
        "schema_version": 1,
        "status": "blocked",
        "proof_set_id": proof_set["proof_set_id"],
        "harden_run_ref": harden_run.get("result_path") if harden_run else None,
        "harden_returncode": harden_run.get("returncode") if harden_run else None,
        "harden_status": (harden_run.get("result_json") or {}).get("status")
        if harden_run
        else None,
        "release_results_ref": release_results_ref,
        "missing_evidence": [
            "v1_results",
            "v2_results",
            "evaluator_context_refs",
            "subversion_results",
            "release_candidate_ref",
        ],
        "mandatory_subversion_case_ids": expected_subversion_case_ids(proof_set),
        "reason": reason,
        "recorded_at": utc_now(),
    }
    if harden_run and harden_run.get("harden_blocker"):
        record["harden_blocker"] = harden_run["harden_blocker"]
    record["content_digest"] = digest_json(record)
    return record


def run_release_evaluation(
    *,
    repo_root: Path,
    proof_set: dict[str, Any],
    harden_task_source: Path | None,
    harden_task_id: str | None,
    release_results_ref: Path | None,
    artifact_root: Path,
    harden_max_iterations: int,
    harden_timeout_seconds: int,
    harden_hacker_retries: int = 1,
    harden_solver_precheck_retries: int = 1,
    harden_replay_retries: int = 1,
    harden_hacker_max_turns: int | None = None,
    harden_hacker_model: str | None = None,
    harden_fixer_model: str | None = None,
    harden_solver_model: str | None = None,
) -> dict[str, Any]:
    """Run or bind the real release gate.

    The harden-v0 run is a fixer candidate producer. A passing ReleaseProof is
    only sealed from real per-case evaluator results; harden's summary status is
    not treated as proof by itself.
    """

    artifact_root.mkdir(parents=True, exist_ok=True)
    harden_run = None
    harden_run_path = (
        artifact_root / "harden-runs" / f"{proof_set['proof_set_id']}.json"
    )
    if harden_task_source is not None or harden_task_id is not None:
        if harden_task_source is None or harden_task_id is None:
            raise ReleaseError(
                "harden_unavailable",
                "harden task source and task id must be provided together",
            )
        try:
            validate_harden_task_source_surface(
                proof_set=proof_set, task_source=harden_task_source
            )
        except ReleaseError as exc:
            blocker = build_harden_blocker_artifact(
                proof_set=proof_set,
                harden_run=None,
                release_results_ref=str(release_results_ref)
                if release_results_ref
                else None,
                reason=str(exc),
            )
            path = (
                artifact_root / "release-blockers" / f"{proof_set['proof_set_id']}.json"
            )
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(
                json.dumps(blocker, indent=2, sort_keys=True) + "\n", encoding="utf-8"
            )
            raise
        harden_run = run_harden_v0(
            repo_root=repo_root,
            harden_root=repo_root / ".external/harden-v0",
            task_id=harden_task_id,
            task_source=harden_task_source,
            output_root=artifact_root / "harden-v0-work",
            max_iterations=harden_max_iterations,
            timeout_seconds=harden_timeout_seconds,
            hacker_retries=harden_hacker_retries,
            solver_precheck_retries=harden_solver_precheck_retries,
            replay_retries=harden_replay_retries,
            hacker_max_turns=harden_hacker_max_turns,
            hacker_model=harden_hacker_model,
            fixer_model=harden_fixer_model,
            solver_model=harden_solver_model,
        )
        harden_run_path.parent.mkdir(parents=True, exist_ok=True)
        harden_run_path.write_text(
            json.dumps(harden_run, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )

    if release_results_ref is None:
        reason = (
            "No real per-case v1/v2 release-results artifact was provided; "
            "harden-v0 result.json alone is not ReleaseProof."
        )
        if harden_run and harden_run.get("harden_blocker"):
            reason = f"{reason} {harden_run['harden_blocker']['reason']}"
        blocker = build_harden_blocker_artifact(
            proof_set=proof_set,
            harden_run=harden_run,
            release_results_ref=None,
            reason=reason,
        )
        path = artifact_root / "release-blockers" / f"{proof_set['proof_set_id']}.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(blocker, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        raise ReleaseError(
            "release_results_missing", f"release evaluation blocked; wrote {path}"
        )

    release_results = load_release_results(release_results_ref)
    gate_kwargs = {
        key: release_results[key]
        for key in (
            "environment_v2",
            "grader_v2_digest",
            "patch_ref",
            "fixer_run_ref",
            "v1_results",
            "v2_results",
            "evaluator_context_refs",
            "subversion_results",
            "release_candidate_ref",
        )
    }
    proof = evaluate_gate(proof_set=proof_set, **gate_kwargs)
    store = ReleaseArtifactStore(artifact_root)
    sealed = seal_release_proof(store=store, release_proof=proof)
    return {
        "schema_version": 1,
        "status": sealed["gate_status"],
        "release_proof": sealed,
        "release_proof_ref": str(
            artifact_root / "release-proofs" / f"{sealed['release_proof_id']}.json"
        ),
        "harden_run_ref": str(harden_run_path)
        if harden_run
        else release_results.get("fixer_run_ref"),
    }
