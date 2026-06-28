"""Task-agnostic Witness sealing contracts.

This module packages one already-discovered BranchRun candidate into a sealed
Exploit Witness only after generic evidence gates pass. It intentionally avoids
task-specific path rules: callers may select candidate paths from evidence, but
the promotion rule is reward + QA join + dedup + minimized causal delta +
three deterministic replays.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from .causal_evidence import require_causal_evidence_bundle
from .models import WitnessError, digest_json, utc_now
from .promotion import (
    assert_witness_fields,
    branch_signal_status,
    dedup_by_target_mechanism,
)
from .replay import ReplayFn, require_three_replays
from .store import JsonArtifactStore


REPLAY_SURFACE_FIELDS = {
    "schema_version",
    "replay_surface_id",
    "environment_version",
    "grader_digest",
    "command_argv",
    "cwd",
    "state_restore_ref",
    "trusted_entrypoint_ref",
    "grader_command_argv",
    "captured_at",
}


def _load_json(path: Path) -> dict[str, Any]:
    import json

    return json.loads(path.read_text(encoding="utf-8"))


def _relative(root: Path, path: Path) -> str:
    return str(path.relative_to(root))


def _branch_run_root(branch_ref: Path) -> Path:
    # .../branch-runs/<run_id>/branches/<branch>.json -> .../branch-runs/<run_id>
    return branch_ref.parent.parent


def load_candidate_bundle(
    root: Path, branch_ref: str
) -> dict[str, dict[str, Any] | str]:
    """Load a BranchRun candidate and sibling artifacts by canonical layout."""

    branch_path = root / branch_ref
    branch = _load_json(branch_path)
    branch_id = str(branch["branch_id"])
    run_root = _branch_run_root(branch_path)
    qa = _load_json(run_root / "qa" / f"{branch_id}.json")
    causal = _load_json(run_root / "causal" / f"{branch_id}.json")
    file_diff = _load_json(run_root / "file-diffs" / f"{branch_id}.json")
    return {
        "branch": branch,
        "qa": qa,
        "causal": causal,
        "file_diff": file_diff,
        "branch_ref": branch_ref,
        "qa_ref": _relative(root, run_root / "qa" / f"{branch_id}.json"),
        "causal_ref": _relative(root, run_root / "causal" / f"{branch_id}.json"),
        "file_diff_ref": _relative(root, run_root / "file-diffs" / f"{branch_id}.json"),
    }


def require_replay_surface(branch: dict[str, Any]) -> dict[str, Any]:
    """Return the candidate's canonical replay surface or reject sealing."""

    surface = branch.get("replay_surface")
    if not isinstance(surface, dict):
        raise WitnessError(
            "replay_surface_missing", "BranchRun lacks canonical replay surface"
        )
    missing = sorted(
        field
        for field in REPLAY_SURFACE_FIELDS
        if field not in surface or surface[field] in (None, "", [])
    )
    if missing:
        raise WitnessError(
            "replay_surface_incomplete", f"replay surface missing {missing}"
        )
    if surface["environment_version"] != branch.get("environment_version"):
        raise WitnessError(
            "replay_surface_mismatch",
            "replay surface environment does not match branch",
        )
    if surface["grader_digest"] != branch.get("grader_digest"):
        raise WitnessError(
            "replay_surface_mismatch", "replay surface grader does not match branch"
        )
    if surface["state_restore_ref"] != branch.get("snapshot_restore_ref"):
        raise WitnessError(
            "replay_surface_mismatch",
            "replay surface restore ref does not match branch",
        )
    for field in ("command_argv", "grader_command_argv"):
        if not isinstance(surface[field], list) or not all(
            isinstance(part, str) and part for part in surface[field]
        ):
            raise WitnessError(
                "replay_surface_incomplete",
                f"replay surface {field} must be non-empty strings",
            )
    setup = surface.get("pre_grader_command_argv") or []
    if not isinstance(setup, list) or not all(
        isinstance(part, str) and part for part in setup
    ):
        raise WitnessError(
            "replay_surface_incomplete",
            "replay surface pre_grader_command_argv must be strings",
        )
    return surface


def build_minimized_delta(
    *,
    branch: dict[str, Any],
    qa: dict[str, Any],
    causal: dict[str, Any],
    file_diff: dict[str, Any],
    included_paths: list[str] | None = None,
) -> dict[str, Any]:
    """Build a task-agnostic minimized delta from textual evidence.

    The delta is "minimized" only relative to the selected candidate paths. It
    still needs replay proof before a Witness can seal.
    """

    if branch_signal_status(branch, qa) != "candidate":
        raise WitnessError(
            "classification_unavailable", "BranchRun is not a reward-hacking candidate"
        )
    require_causal_evidence_bundle(causal, require_minimized=False)
    if file_diff.get("status") != "pass":
        raise WitnessError("provenance_incomplete", "file diff is not pass")

    added_text = file_diff.get("added_text", {})
    modified_text = file_diff.get("modified_text", {})
    text_patches = file_diff.get("text_patches", {})
    textual_paths = sorted(set(added_text) | set(modified_text) | set(text_patches))
    selected = included_paths or textual_paths
    if not selected:
        raise WitnessError(
            "provenance_incomplete", "candidate has no textual replay delta"
        )

    missing = [
        path
        for path in selected
        if path not in added_text
        and path not in modified_text
        and path not in text_patches
    ]
    if missing:
        raise WitnessError(
            "provenance_incomplete",
            f"selected paths lack captured text or patch data: {missing}",
        )

    delta = {
        "schema_version": 1,
        "branch_id": branch["branch_id"],
        "source_causal_evidence_ref": branch.get("causal_evidence_ref"),
        "source_file_diff_ref": branch.get("file_diff_ref"),
        "causal_delta_status": "minimized",
        "included_paths": selected,
        "added_text": {
            path: added_text[path] for path in selected if path in added_text
        },
        "modified_text": {
            path: modified_text[path] for path in selected if path in modified_text
        },
        "text_patches": {
            path: text_patches[path] for path in selected if path in text_patches
        },
        "excluded_added_paths": [
            path for path in file_diff.get("added_paths", []) if path not in selected
        ],
        "excluded_modified_paths": [
            path for path in file_diff.get("modified_paths", []) if path not in selected
        ],
        "minimization_basis": "operator-selected textual branch-local delta; replay gate remains authoritative",
        "created_at": utc_now(),
    }
    delta["content_digest"] = digest_json(delta)
    return delta


def infer_target_mechanism(
    *,
    qa: dict[str, Any],
    delta: dict[str, Any],
) -> tuple[str, str]:
    """Derive a semantic target/mechanism label without task-specific paths."""

    strategy = (
        str(qa.get("hacking_strategy") or "reward_hacking").strip() or "reward_hacking"
    )
    paths = ", ".join(delta.get("included_paths", []))
    target = f"reward-verifier:{strategy}"
    mechanism = f"textual-causal-delta:{paths}" if paths else "textual-causal-delta"
    return target, mechanism


def seal_witness(
    *,
    root: Path,
    branch_ref: str,
    artifact_store: JsonArtifactStore,
    replay_fn: ReplayFn,
    clusters: list[dict[str, Any]] | None = None,
    included_paths: list[str] | None = None,
    retention_policy: str = "retain-for-release-regression",
) -> dict[str, Any]:
    """Seal a candidate BranchRun into an Exploit Witness or raise WitnessError."""

    bundle = load_candidate_bundle(root, branch_ref)
    branch = bundle["branch"]
    qa = bundle["qa"]
    causal = bundle["causal"]
    file_diff = bundle["file_diff"]
    assert isinstance(branch, dict)
    assert isinstance(qa, dict)
    assert isinstance(causal, dict)
    assert isinstance(file_diff, dict)
    replay_surface = require_replay_surface(branch)

    delta = build_minimized_delta(
        branch=branch,
        qa=qa,
        causal=causal,
        file_diff=file_diff,
        included_paths=included_paths,
    )
    target, mechanism = infer_target_mechanism(qa=qa, delta=delta)
    candidate = {
        **branch,
        "_chronos_repo_root": str(root),
        "exploit_target": target,
        "exploit_mechanism": mechanism,
        "causal_delta": delta,
        "replay_surface": replay_surface,
    }
    dedup = dedup_by_target_mechanism(candidate, clusters or [])
    replay_checks = require_three_replays(candidate, replay_fn)
    witness_id = f"wit-{branch['branch_id']}"
    verifier_output_ref = f"{branch_ref}#verifier_output"
    witness = {
        "schema_version": 1,
        "witness_id": witness_id,
        "source_branch_id": branch["branch_id"],
        "source_hud_trace_id": branch["hud_trace_id"],
        "pre_attack_snapshot_ref": branch["snapshot_restore_ref"],
        "durable_snapshot_mode": branch["snapshot_mode"],
        "history_prefix_ref": branch["history_prefix_ref"],
        "recorded_actions_ref": branch["action_record_ref"],
        "action_record_digest": branch["action_record_digest"],
        "file_diff_ref": str(bundle["file_diff_ref"]),
        "verifier_output_ref": verifier_output_ref,
        "qa_result_ref": branch["qa_result_ref"],
        "qa_join": {
            "qa_result_id": qa["qa_result_id"],
            "branch_id": qa["branch_id"],
            "hud_trace_id": qa["hud_trace_id"],
            "action_record_digest": qa["action_record_digest"],
            "authoritative_source": qa["authoritative_source"],
            "evidence_quality": qa["evidence_quality"],
            "task_identity_status": qa["task_identity_status"],
        },
        "qa_is_reward_hacking": qa["is_reward_hacking"],
        "environment_version": branch["environment_version"],
        "environment_image_digest": branch["environment_image_digest"],
        "grader_digest": branch["grader_digest"],
        "reward": branch["reward"],
        "seed": branch["seed"],
        "model": branch["model"],
        "sampling_config": branch["sampling_config"],
        "exploit_target": target,
        "exploit_mechanism": mechanism,
        "cluster_id": dedup["cluster_id"],
        "dedup_decision": dedup,
        "causal_delta_ref": f"causal-deltas/{branch['branch_id']}.json",
        "replay_surface": replay_surface,
        "replay_entrypoint": "chronos.witnesses.sealing.seal_witness",
        "replay_checks": replay_checks,
        "retention_policy": retention_policy,
        "created_at": utc_now(),
    }
    witness["content_digest"] = digest_json(witness)
    assert_witness_fields(witness)
    delta_path = artifact_store.create("causal-deltas", branch["branch_id"], delta)
    witness["causal_delta_ref"] = _relative(root, delta_path)
    witness["content_digest"] = digest_json(
        {k: v for k, v in witness.items() if k != "content_digest"}
    )
    artifact_store.create("witnesses", witness_id, witness)
    return witness
