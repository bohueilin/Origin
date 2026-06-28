"""Immutable input sourcing for the Plan 006 Acceptance Demo Run.

Loads the prior-plan artifacts the demo consumes (Plan 002 ForkPoint, Plan 003
Witness/branch/QA, Plan 004 controls, Plan 005 ReleaseProof/candidate), resolves
trusted repo-relative refs, and builds the enriched ForkPoint that the
repo-native live branch runner requires. The container-specific task profile is
lifted from the proven Plan 003 Witness replay surface rather than inferred, so
the live launch reproduces the exact entrypoint and grader the sealed Witness
used.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .models import DemoError

ROOT = Path(__file__).resolve().parents[3]

# Plan 002 — accepted ForkPoint and source trace boundary.
FORKPOINT_RECORD_REF = "docs/plans/evidence/002/artifacts/forkpoint-record.json"
SOURCE_TRACE_REF = "docs/plans/evidence/002/artifacts/trace-boundary-summary.json"

# Plan 003 — sealed Witness and its branch/QA/file-diff evidence.
PRIOR_RUN_ID = "run-20260621T075711"
_PRIOR_RUN_DIR = f"docs/plans/evidence/003/artifacts/branch-runs/{PRIOR_RUN_ID}"
PRIOR_BATCH_REF = f"{_PRIOR_RUN_DIR}/branch-run-batch.json"
PRIOR_BRANCH_REF = f"{_PRIOR_RUN_DIR}/branches/{PRIOR_RUN_ID}-branch-08.json"
PRIOR_QA_REF = f"{_PRIOR_RUN_DIR}/qa/{PRIOR_RUN_ID}-branch-08.json"
PRIOR_FILE_DIFF_REF = f"{_PRIOR_RUN_DIR}/file-diffs/{PRIOR_RUN_ID}-branch-08.json"
PRIOR_WITNESS_REF = "docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json"

# Plan 004 — legitimate controls baseline.
CONTROLS_BASELINE_REF = "artifacts/chronos/controls/baseline_runs.json"

# Plan 005 — ProofSet, fixer (verifier patch), and v2 replay trace.
PROOFSET_REF = (
    "artifacts/chronos/releases/release-results/proofset-e497370b2c3d2a69.json"
)
FIXER_RUN_REF = "artifacts/chronos/releases/harden-runs/proofset-e497370b2c3d2a69.json"
V2_REPLAY_REF = (
    "artifacts/chronos/releases/release-results/releasecandidate-294df1726b8a5ed0/"
    "traces/wit-run-20260621t075711-branch-08.json"
)

# Plan 005 — manifest-bound ReleaseProof/candidate resolution.
PLAN_005_MANIFEST_REF = "docs/plans/evidence/005/MANIFEST.json"
RELEASE_PROOFS_DIR = "artifacts/chronos/releases/release-proofs"
RELEASE_CANDIDATES_DIR = "artifacts/chronos/releases/candidates"

# Local env module the live BranchRun loads to build the task and hacker prompt.
ENV_MODULE_PATH = "envs/mongodb-sales-aggregation-engine/env.py"
ENV_TASK_FACTORY = "implement_sales_analyzer"
ENV_PROMPT_FACTORY = "_prompt"


def _load_json(ref: str) -> dict[str, Any]:
    path = ROOT / ref
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise DemoError(
            "input_unavailable", f"required demo input not found: {ref}"
        ) from exc
    except json.JSONDecodeError as exc:
        raise DemoError(
            "input_invalid", f"demo input is not valid JSON: {ref}: {exc.msg}"
        ) from exc
    if not isinstance(value, dict):
        raise DemoError("input_invalid", f"demo input must be a JSON object: {ref}")
    return value


@dataclass(frozen=True)
class DemoInputs:
    """Resolved immutable inputs for one Acceptance Demo Run."""

    forkpoint_record: dict[str, Any]
    forkpoint_ref: str
    enriched_forkpoint: dict[str, Any]
    source_trace_id: str
    source_trace_ref: str
    qa_verdict_ref: str
    file_diff_ref: str
    prior_branch_ref: str
    prior_batch_ref: str
    prior_run_id: str
    prior_witness: dict[str, Any]
    prior_witness_ref: str
    prior_witness_digest: str
    prior_witness_cluster_id: str
    prior_witness_reward: Any
    replay_entrypoint_ref: str
    proofset_ref: str
    patch_ref: str
    controls_baseline_ref: str
    controls_preserved: int
    controls_total: int
    v2_replay_ref: str
    v2_replay_reward: Any
    release_proof: dict[str, Any]
    release_proof_ref: str
    release_proof_digest: str
    release_candidate_ref: str
    target_id: str


def build_hud_task_profile(prior_witness: dict[str, Any]) -> dict[str, Any]:
    """Build the BranchRun task profile from the proven Witness replay surface."""

    surface = prior_witness.get("replay_surface")
    if not isinstance(surface, dict):
        raise DemoError(
            "forkpoint_not_branch_ready",
            "prior Witness lacks a replay_surface to bind the task profile",
        )
    workdir = surface.get("cwd")
    entrypoint = surface.get("trusted_entrypoint_ref")
    grader_argv = surface.get("grader_command_argv")
    pre_grader_argv = surface.get("pre_grader_command_argv")
    missing = [
        name
        for name, value in (
            ("cwd", workdir),
            ("trusted_entrypoint_ref", entrypoint),
            ("grader_command_argv", grader_argv),
            ("pre_grader_command_argv", pre_grader_argv),
        )
        if not value
    ]
    if missing:
        raise DemoError(
            "forkpoint_not_branch_ready",
            f"Witness replay surface missing fields: {sorted(missing)}",
        )
    if not (ROOT / ENV_MODULE_PATH).is_file():
        raise DemoError(
            "forkpoint_not_branch_ready",
            f"live env module is not present: {ENV_MODULE_PATH}",
        )
    return {
        "env_module_path": ENV_MODULE_PATH,
        "task_factory": ENV_TASK_FACTORY,
        "prompt_factory": ENV_PROMPT_FACTORY,
        "runtime_workdir": str(workdir),
        "instruction_path": f"{str(workdir).rstrip('/')}/task_assets/instruction.md",
        "trusted_entrypoint_ref": str(entrypoint),
        "capture_roots": [str(workdir)],
        "pre_grader_command_argv": list(pre_grader_argv),
        "grader_command_argv": list(grader_argv),
    }


def build_enriched_forkpoint(
    forkpoint_record: dict[str, Any], profile: dict[str, Any]
) -> dict[str, Any]:
    """Attach the task profile so the live runner can launch branches."""

    if not forkpoint_record.get("snapshot_id"):
        raise DemoError(
            "forkpoint_not_branch_ready",
            "ForkPoint record lacks a snapshot_id for restore",
        )
    enriched = dict(forkpoint_record)
    enriched["hud_task_profile"] = profile
    # Validate against the same contract the runner enforces before launch.
    from chronos.witnesses.branch_task_profile import hud_task_profile

    try:
        hud_task_profile(enriched)
    except ValueError as exc:
        raise DemoError(
            "forkpoint_not_branch_ready", f"task profile is not branch-ready: {exc}"
        ) from exc
    return enriched


def _resolve_release_inputs() -> tuple[dict[str, Any], str, str]:
    manifest = _load_json(PLAN_005_MANIFEST_REF)
    if manifest.get("status") != "complete":
        raise DemoError("dependency_gate", "Plan 005 evidence manifest is not complete")
    proof_ref = _single_manifest_artifact(
        manifest, prefix=RELEASE_PROOFS_DIR, suffix=".json"
    )
    if not proof_ref:
        raise DemoError(
            "missing_artifacts", "Plan 005 ReleaseProof artifact is not manifest-bound"
        )
    proof = _load_json(proof_ref)
    candidate_name = Path(str(proof.get("release_candidate_ref", ""))).name
    if not candidate_name:
        raise DemoError(
            "missing_artifacts", "ReleaseProof does not reference a release candidate"
        )
    candidate_ref = f"{RELEASE_CANDIDATES_DIR}/{candidate_name}"
    manifest_candidate_ref = _single_manifest_artifact(
        manifest, prefix=RELEASE_CANDIDATES_DIR, suffix=".json"
    )
    if not (ROOT / candidate_ref).is_file() or candidate_ref != manifest_candidate_ref:
        raise DemoError(
            "missing_artifacts", "Plan 005 release candidate is not manifest-bound"
        )
    _assert_candidate_binding(proof, _load_json(candidate_ref))
    return proof, proof_ref, candidate_ref


def _single_manifest_artifact(
    manifest: dict[str, Any], *, prefix: str, suffix: str
) -> str | None:
    refs = [
        artifact.get("ref")
        for artifact in manifest.get("artifacts", [])
        if isinstance(artifact, dict) and isinstance(artifact.get("ref"), str)
    ]
    matches = [
        ref
        for ref in refs
        if ref.startswith(prefix) and ref.endswith(suffix) and "*" not in ref
    ]
    return matches[0] if len(matches) == 1 else None


def _assert_candidate_binding(proof: dict[str, Any], candidate: dict[str, Any]) -> None:
    mismatched = [
        field
        for field in ("environment_v2", "grader_v2_digest")
        if candidate.get(field) != proof.get(field)
    ]
    if mismatched:
        raise DemoError(
            "missing_artifacts",
            f"release candidate does not match ReleaseProof fields {mismatched}",
        )
    proof_candidate_id = Path(str(proof.get("release_candidate_ref", ""))).stem
    if (
        proof_candidate_id
        and candidate.get("release_candidate_id") != proof_candidate_id
    ):
        raise DemoError(
            "missing_artifacts", "release candidate id does not match ReleaseProof ref"
        )


def load_demo_inputs() -> DemoInputs:
    """Load and identity-check every immutable input for the Acceptance Demo."""

    forkpoint_record = _load_json(FORKPOINT_RECORD_REF)
    prior_witness = _load_json(PRIOR_WITNESS_REF)
    proof, proof_ref, candidate_ref = _resolve_release_inputs()

    profile = build_hud_task_profile(prior_witness)
    enriched_forkpoint = build_enriched_forkpoint(forkpoint_record, profile)

    proof_digest = proof.get("content_digest")
    target_id = proof.get("environment_v2")
    if not isinstance(proof_digest, str) or not proof_digest:
        raise DemoError("missing_artifacts", "ReleaseProof lacks a content digest")
    if not isinstance(target_id, str) or not target_id:
        raise DemoError(
            "unauthorized_target", "ReleaseProof lacks an environment_v2 target"
        )

    controls_preserved = proof.get("controls_preserved")
    if not isinstance(controls_preserved, int):
        raise DemoError(
            "missing_artifacts", "ReleaseProof lacks a controls_preserved count"
        )
    broken_controls = proof.get("broken_control_ids")
    broken_count = len(broken_controls) if isinstance(broken_controls, list) else 0

    v2_replay = _load_json(V2_REPLAY_REF)
    source_trace_id = forkpoint_record.get("hud_trace_id")
    if not isinstance(source_trace_id, str) or not source_trace_id:
        raise DemoError("input_invalid", "ForkPoint record lacks a source hud_trace_id")

    return DemoInputs(
        forkpoint_record=forkpoint_record,
        forkpoint_ref=FORKPOINT_RECORD_REF,
        enriched_forkpoint=enriched_forkpoint,
        source_trace_id=source_trace_id,
        source_trace_ref=SOURCE_TRACE_REF,
        qa_verdict_ref=PRIOR_QA_REF,
        file_diff_ref=PRIOR_FILE_DIFF_REF,
        prior_branch_ref=PRIOR_BRANCH_REF,
        prior_batch_ref=PRIOR_BATCH_REF,
        prior_run_id=PRIOR_RUN_ID,
        prior_witness=prior_witness,
        prior_witness_ref=PRIOR_WITNESS_REF,
        prior_witness_digest=str(prior_witness.get("content_digest") or ""),
        prior_witness_cluster_id=str(prior_witness.get("cluster_id") or ""),
        prior_witness_reward=prior_witness.get("reward"),
        replay_entrypoint_ref=str(
            prior_witness.get("replay_entrypoint")
            or "chronos.witnesses.sealing.seal_witness"
        ),
        proofset_ref=PROOFSET_REF,
        patch_ref=FIXER_RUN_REF,
        controls_baseline_ref=CONTROLS_BASELINE_REF,
        controls_preserved=controls_preserved,
        controls_total=controls_preserved + broken_count,
        v2_replay_ref=V2_REPLAY_REF,
        v2_replay_reward=v2_replay.get("reward"),
        release_proof=proof,
        release_proof_ref=proof_ref,
        release_proof_digest=proof_digest,
        release_candidate_ref=candidate_ref,
        target_id=target_id,
    )


__all__ = [
    "DemoInputs",
    "ROOT",
    "build_hud_task_profile",
    "build_enriched_forkpoint",
    "load_demo_inputs",
]
