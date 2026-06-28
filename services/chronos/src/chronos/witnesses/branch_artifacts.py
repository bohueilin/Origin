"""BranchRun provenance artifact builders."""

from __future__ import annotations

import difflib
from typing import Any


def build_file_diff(
    branch_id: str, before: dict[str, Any] | None, after: dict[str, Any] | None
) -> dict[str, Any]:
    if (
        not before
        or not after
        or before.get("status") != "pass"
        or after.get("status") != "pass"
    ):
        return {
            "schema_version": 1,
            "branch_id": branch_id,
            "status": "blocked",
            "observed_behavior": "same-runtime before/after filesystem snapshots were not both captured",
            "before_status": before.get("status") if before else "missing",
            "after_status": after.get("status") if after else "missing",
        }

    before_files = before.get("files", {})
    after_files = after.get("files", {})
    before_paths = set(before_files)
    after_paths = set(after_files)
    added = sorted(after_paths - before_paths)
    removed = sorted(before_paths - after_paths)
    modified = sorted(
        path
        for path in before_paths & after_paths
        if before_files[path].get("sha256") != after_files[path].get("sha256")
    )
    added_text = {}
    removed_text = {}
    modified_text = {}
    text_patches = {}
    for path in added:
        text = after_files[path].get("text")
        if isinstance(text, str):
            added_text[path] = text
    for path in removed:
        text = before_files[path].get("text")
        if isinstance(text, str):
            removed_text[path] = text
    for path in modified:
        old_text = before_files[path].get("text")
        new_text = after_files[path].get("text")
        if isinstance(old_text, str) and isinstance(new_text, str):
            modified_text[path] = new_text
            text_patches[path] = "".join(
                difflib.unified_diff(
                    old_text.splitlines(keepends=True),
                    new_text.splitlines(keepends=True),
                    fromfile=f"before:{path}",
                    tofile=f"after:{path}",
                )
            )

    return {
        "schema_version": 1,
        "branch_id": branch_id,
        "status": "pass",
        "roots": after.get("roots", {}),
        "added_paths": added,
        "removed_paths": removed,
        "modified_paths": modified,
        "file_count_before": len(before_files),
        "file_count_after": len(after_files),
        "added_text": added_text,
        "removed_text": removed_text,
        "modified_text": modified_text,
        "text_patches": text_patches,
        "observed_behavior": "same-runtime before/after filesystem snapshots captured and compared",
    }


def build_security_evidence(
    branch_id: str,
    runtime_params: dict[str, Any],
    probe: dict[str, Any] | None,
) -> dict[str, Any]:
    if not probe:
        return {
            "schema_version": 1,
            "branch_id": branch_id,
            "status": "blocked",
            "observed_behavior": "same-runtime branch security probe did not run",
        }
    blockers = []
    if probe.get("status") != "pass":
        blockers.append("same-runtime security probe returned non-pass")
    if runtime_params.get("egress_policy") != "outbound_cidr_allowlist":
        blockers.append("Modal sandbox did not enforce an outbound allowlist")
    if probe.get("disallowed_egress_probe") != "denied":
        blockers.append("same-runtime disallowed egress probe was not denied")
    if runtime_params.get("secret_policy") != "secrets=[]":
        blockers.append("Modal sandbox was not created with secrets=[]")
    if runtime_params.get("network_file_systems"):
        blockers.append("Modal sandbox mounted network file systems")
    if runtime_params.get("volumes"):
        blockers.append("Modal sandbox mounted shared volumes")
    return {
        "schema_version": 1,
        "branch_id": branch_id,
        "status": "blocked" if blockers else "pass",
        "runtime_params": runtime_params,
        "probe": probe,
        "blockers": blockers,
        "observed_behavior": (
            "same-runtime branch security negative probes passed"
            if not blockers
            else "same-runtime branch security negative probes blocked promotion"
        ),
    }
