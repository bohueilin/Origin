"""Plan 007 depth-two child re-snapshot from a sealed Plan 003 Witness.

This module turns the sealed Witness's durable pre-attack snapshot plus its
minimized causal delta into an independent, Plan 007-owned *child* snapshot. It
restores the recorded filesystem image, applies the textual delta, verifies the
delta landed, then captures a fresh ``snapshot_filesystem`` image. It fails
closed — emitting no captured artifact — when credentials, durable snapshot
provenance, or grader identity are missing. It never fabricates a snapshot.
"""

from __future__ import annotations

import contextlib
import hashlib
from pathlib import Path
from typing import Any

from chronos.research.models import ResearchLineage
from chronos.witnesses.local_env import credential_presence, load_local_env
from chronos.witnesses.models import digest_json, utc_now

CRED_NAMES = (
    "MODAL_TOKEN_ID",
    "MODAL_TOKEN_SECRET",
    "HUD_API_KEY",
    "ANTHROPIC_API_KEY",
)
ROOT_FORK_POINT_ID = "fp-826ba545cf30870e67d42ddb"
APP_NAME = "chronos-plan-007"


class ResnapshotError(RuntimeError):
    """Fail-closed error for an unprovable child re-snapshot."""

    def __init__(self, error_class: str, message: str) -> None:
        super().__init__(message)
        self.error_class = error_class


def _sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _branch_ref_from_witness(witness: dict[str, Any]) -> str:
    file_diff_ref = str(witness.get("file_diff_ref") or "")
    branch_ref = file_diff_ref.replace("/file-diffs/", "/branches/")
    if "file-diffs" in branch_ref or not branch_ref:
        branch_id = str(witness.get("source_branch_id") or "")
        return (
            "docs/plans/evidence/003/artifacts/branch-runs/"
            f"run-20260621T075711/branches/{branch_id}.json"
        )
    return branch_ref


def _validate_inputs(
    witness: dict[str, Any], causal_delta: dict[str, Any]
) -> tuple[str, str, list[str], dict[str, str]]:
    mode = witness.get("durable_snapshot_mode")
    if mode != "filesystem":
        raise ResnapshotError(
            "state_restore_failed",
            f"child re-snapshot requires a filesystem-class Witness, got durable_snapshot_mode={mode!r}",
        )
    pre_attack = witness.get("pre_attack_snapshot_ref")
    if not isinstance(pre_attack, str) or not pre_attack.startswith("modal-image://"):
        raise ResnapshotError(
            "provenance_incomplete",
            "Witness lacks a modal-image pre_attack_snapshot_ref for durable restore",
        )
    grader_digest = witness.get("grader_digest")
    if not grader_digest:
        raise ResnapshotError(
            "grader_identity_missing",
            "Witness lacks grader_digest; cannot preserve grader identity across the child snapshot",
        )
    included = causal_delta.get("included_paths")
    added = causal_delta.get("added_text") or {}
    if not isinstance(included, list) or not included:
        raise ResnapshotError(
            "provenance_incomplete", "causal delta has no included_paths to apply"
        )
    missing = [path for path in included if path not in added]
    if missing:
        raise ResnapshotError(
            "provenance_incomplete",
            f"causal delta included paths lack added_text: {missing}",
        )
    return (
        pre_attack,
        str(grader_digest),
        list(included),
        {p: str(added[p]) for p in included},
    )


def build_child_snapshot_artifact(
    *,
    witness: dict[str, Any],
    causal_delta: dict[str, Any],
    source_witness_ref: str,
    source_causal_delta_ref: str,
    child_snapshot_id: str,
    runtime_identity: dict[str, Any],
    applied_delta_verification: dict[str, Any],
    recorded_at: str,
) -> dict[str, Any]:
    """Build the Plan 007 child-snapshot provenance artifact (no live calls).

    Fails closed (``ResnapshotError``) when the snapshot lacks durable
    provenance, grader identity, or verified application of the causal delta.
    """

    pre_attack, grader_digest, included, added = _validate_inputs(witness, causal_delta)
    if not child_snapshot_id:
        raise ResnapshotError("state_restore_failed", "child snapshot id is required")

    for path in included:
        verification = applied_delta_verification.get(path)
        if (
            not isinstance(verification, dict)
            or verification.get("status") != "present"
        ):
            raise ResnapshotError(
                "provenance_incomplete",
                f"causal delta path was not present in the child sandbox: {path}",
            )
        if verification.get("sha256") != _sha256_text(added[path]):
            raise ResnapshotError(
                "provenance_incomplete",
                f"child sandbox content digest does not match the applied delta: {path}",
            )

    branch_id = str(witness.get("source_branch_id") or "")
    child_node_id = f"node-{branch_id}"
    child_snapshot_ref = f"modal-image://{child_snapshot_id}"
    source_branch_ref = _branch_ref_from_witness(witness)

    lineage = ResearchLineage(
        root_fork_point_id=ROOT_FORK_POINT_ID,
        parent_node_id=ROOT_FORK_POINT_ID,
        child_node_id=child_node_id,
        child_depth=1,
        parent_snapshot_ref=pre_attack,
        child_snapshot_ref=child_snapshot_ref,
        source_branch_ref=source_branch_ref,
        source_witness_ref=source_witness_ref,
    ).to_record()

    artifact: dict[str, Any] = {
        "schema_version": 1,
        "artifact_id": f"depth-two-child-snapshot-{branch_id}",
        "status": "captured",
        "recorded_at": recorded_at,
        "source_witness_ref": source_witness_ref,
        "source_causal_delta_ref": source_causal_delta_ref,
        "lineage": lineage,
        "child_snapshot": {
            "child_node_id": child_node_id,
            "snapshot_id": child_snapshot_id,
            "snapshot_ref": child_snapshot_ref,
            "snapshot_mode": "filesystem",
            "source_pre_attack_snapshot_ref": pre_attack,
            "applied_delta_ref": source_causal_delta_ref,
            "included_paths": included,
            "applied_delta_verification": applied_delta_verification,
            "grader_digest": grader_digest,
            "environment_version": witness.get("environment_version"),
            "environment_image_digest": witness.get("environment_image_digest"),
        },
        "runtime_identity": runtime_identity,
        "completion_claim": "child-snapshot-captured",
    }
    artifact["content_digest"] = digest_json(artifact)
    return artifact


def _apply_delta_script(path: str, encoded: str) -> str:
    return (
        "import base64\n"
        "from pathlib import Path\n"
        f"p = Path({path!r})\n"
        "p.parent.mkdir(parents=True, exist_ok=True)\n"
        f"p.write_bytes(base64.b64decode({encoded!r}))\n"
        "print('applied')\n"
    )


def _verify_delta_script(path: str) -> str:
    return (
        "import hashlib, json\n"
        "from pathlib import Path\n"
        f"p = Path({path!r})\n"
        "result = {'status': 'absent'}\n"
        "if p.exists():\n"
        "    data = p.read_bytes()\n"
        "    result = {'status': 'present', 'sha256': hashlib.sha256(data).hexdigest(), 'size': len(data)}\n"
        "print(json.dumps(result, sort_keys=True))\n"
    )


def capture_child_snapshot(
    *,
    root: Path,
    witness: dict[str, Any],
    causal_delta: dict[str, Any],
    source_witness_ref: str,
    source_causal_delta_ref: str,
    recorded_at: str | None = None,
) -> dict[str, Any]:
    """Restore the Witness snapshot, apply the delta, and capture a child snapshot.

    Returns a captured provenance artifact on success, or a ``status='blocked'``
    record (no captured artifact) when live credentials are absent. Raises
    ``ResnapshotError`` when durable provenance or grader identity is missing.
    """

    import base64
    import json

    recorded_at = recorded_at or utc_now()
    load_local_env(root)
    presence = credential_presence(CRED_NAMES)
    if any(value != "present" for value in presence.values()):
        return {
            "status": "blocked",
            "credential_presence": presence,
            "blocker": "child re-snapshot skipped because required local credentials were absent",
            "completion_claim": "not-complete",
        }

    pre_attack, _grader, included, added = _validate_inputs(witness, causal_delta)
    base_image_id = pre_attack.removeprefix("modal-image://")

    try:
        import modal
    except ImportError as exc:  # pragma: no cover - environment-dependent
        raise ResnapshotError(
            "runtime_unavailable", f"Modal SDK is unavailable: {exc}"
        ) from exc

    app = modal.App.lookup(APP_NAME, create_if_missing=True)
    sandbox = None
    try:
        sandbox = modal.Sandbox.create(
            image=modal.Image.from_id(base_image_id),
            app=app,
            block_network=True,
            secrets=[],
            cpu=0.5,
            memory=1024,
            timeout=900,
            workdir="/app",
            tags={"chronos_plan": "007", "purpose": "depth_two_child_resnapshot"},
        )
        for path in included:
            encoded = base64.b64encode(added[path].encode("utf-8")).decode("ascii")
            proc = sandbox.exec(
                "python3",
                "-c",
                _apply_delta_script(path, encoded),
                workdir="/app",
                timeout=120,
            )
            proc.wait()
            if proc.returncode != 0:
                raise ResnapshotError(
                    "state_restore_failed",
                    f"failed to apply causal delta {path}: {proc.stderr.read()[:400]}",
                )
        verification: dict[str, Any] = {}
        for path in included:
            proc = sandbox.exec(
                "python3", "-c", _verify_delta_script(path), workdir="/app", timeout=60
            )
            proc.wait()
            if proc.returncode != 0:
                raise ResnapshotError(
                    "provenance_incomplete",
                    f"failed to verify causal delta {path}: {proc.stderr.read()[:400]}",
                )
            verification[path] = json.loads(proc.stdout.read())
        child_image = sandbox.snapshot_filesystem()
        child_snapshot_id = str(getattr(child_image, "object_id", "") or "")
        runtime_identity = {
            "provider": "modal",
            "app_id": getattr(app, "app_id", None),
            "base_image_id": base_image_id,
            "base_sandbox_id": sandbox.object_id,
            "modal_version": getattr(modal, "__version__", "unknown"),
            "network_policy": "block_network=True",
            "secret_policy": "secrets=[]",
            "captured_at": recorded_at,
        }
    finally:
        # Best-effort teardown: a terminate failure must not mask a successful
        # capture or the real error. The sandbox also auto-expires at its timeout.
        if sandbox is not None:
            with contextlib.suppress(Exception):
                sandbox.terminate()

    if not child_snapshot_id:
        raise ResnapshotError(
            "state_restore_failed", "Modal snapshot_filesystem returned no object_id"
        )

    return build_child_snapshot_artifact(
        witness=witness,
        causal_delta=causal_delta,
        source_witness_ref=source_witness_ref,
        source_causal_delta_ref=source_causal_delta_ref,
        child_snapshot_id=child_snapshot_id,
        runtime_identity=runtime_identity,
        applied_delta_verification=verification,
        recorded_at=recorded_at,
    )
