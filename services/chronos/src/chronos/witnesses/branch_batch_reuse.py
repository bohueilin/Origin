"""Validated reuse of immutable BranchRun batches."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .models import WitnessError


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _artifact_status(root: Path, ref: Any) -> str:
    if not isinstance(ref, str):
        return "missing"
    path = root / ref
    if not path.is_file():
        return "missing"
    return str(_load_json(path).get("status", "missing"))


def load_reused_branch_batch(
    root: Path, forkpoint: dict[str, Any]
) -> dict[str, Any] | None:
    ref = os.environ.get("FORKPROOF_REUSE_BRANCH_BATCH_REF")
    if not ref:
        return None
    path = root / ref
    batch = _load_json(path)
    expected = {
        "schema_version": 1,
        "fork_point_id": forkpoint.get("fork_point_id"),
        "snapshot_id": forkpoint.get("snapshot_id"),
        "executed_branch_count": 12,
        "completed_record_count": 12,
        "hud_trace_count": 12,
        "qa_pass_count": 12,
        "unique_branch_ids": 12,
        "unique_requested_seed_labels": 12,
        "live_execution_status": "pass",
    }
    mismatched = [key for key, value in expected.items() if batch.get(key) != value]
    branch_refs = (
        batch.get("branch_refs") if isinstance(batch.get("branch_refs"), list) else []
    )
    if len(branch_refs) != 12:
        mismatched.append("branch_refs")
    branches = []
    for branch_ref in branch_refs:
        branch_path = root / str(branch_ref)
        if not branch_path.is_file():
            raise WitnessError(
                "invalid_reuse_batch", f"reused BranchRun file is missing: {branch_ref}"
            )
        branches.append(_load_json(branch_path))
    if len({branch.get("branch_id") for branch in branches}) != 12:
        mismatched.append("branch_id uniqueness")
    if len({branch.get("seed") for branch in branches}) != 12:
        mismatched.append("seed uniqueness")
    if any(
        branch.get("parent_fork_point_id") != forkpoint.get("fork_point_id")
        for branch in branches
    ):
        mismatched.append("branch parent_fork_point_id")
    if any(
        branch.get("snapshot_id") != forkpoint.get("snapshot_id") for branch in branches
    ):
        mismatched.append("branch snapshot_id")
    if any(branch.get("provenance_status") != "complete" for branch in branches):
        mismatched.append("branch provenance_status")
    if any(
        _artifact_status(root, branch.get("file_diff_ref")) != "pass"
        for branch in branches
    ):
        mismatched.append("branch file_diff_ref")
    if any(
        _artifact_status(root, branch.get("security_probe_ref")) != "pass"
        for branch in branches
    ):
        mismatched.append("branch security_probe_ref")
    if mismatched:
        raise WitnessError(
            "invalid_reuse_batch",
            f"cannot reuse mismatched BranchRun batch {ref}: {mismatched}",
        )
    batch["artifact_ref"] = ref
    batch["reuse_mode"] = "existing-immutable-branch-batch"
    return batch
