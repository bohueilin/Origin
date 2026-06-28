"""Locality-of-behavior ForkPoint capture and restore contracts.

The public functions in this module enforce the Plan 002 semantic invariants:
history, boundary, grader, and snapshot identity must match before a restored
handoff is branch-ready. Provider implementations own real snapshot mechanics.
"""

from __future__ import annotations

import copy
import hashlib
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Protocol

SUPPORTED_SNAPSHOT_MODES = {"directory", "filesystem"}


class ForkPointError(RuntimeError):
    """Repository-native error carrying the shared semantic error class."""

    def __init__(self, error_class: str, message: str):
        super().__init__(message)
        self.error_class = error_class


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode()


def digest_json(value: Any) -> str:
    return hashlib.sha256(_json_bytes(value)).hexdigest()


def utc_now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def environment_source_digest(repo_root: Path) -> str:
    env_root = repo_root / "envs" / "mongodb-sales-aggregation-engine"
    paths = [
        env_root / ".hud" / "config.json",
        env_root / "Dockerfile.hud",
        env_root / "env.py",
        env_root / "pyproject.toml",
        env_root / "tasks.py",
        env_root / "uv.lock",
        env_root / "task_assets" / "init_data.py",
        env_root / "task_assets" / "instruction.md",
        env_root / "task_assets" / "orders.json",
        env_root / "task_assets" / "products.json",
        env_root / "task_assets" / "reference_solution.sh",
        env_root / "task_assets" / "test_outputs.py",
    ]
    if not env_root.exists():
        return "source-tree-unavailable:" + digest_json({"repo_root": str(repo_root)})
    payload = {
        str(path.relative_to(repo_root)): hashlib.sha256(path.read_bytes()).hexdigest()
        for path in paths
    }
    return "source-tree-sha256:" + digest_json(payload)


def load_source_trace(status_path: Path) -> dict[str, Any]:
    status = json.loads(status_path.read_text(encoding="utf-8"))
    live = status.get("live_trace")
    if not isinstance(live, dict):
        raise ForkPointError("provenance_incomplete", "STATUS.json lacks live_trace")
    required = (
        "env_id",
        "env_name",
        "job_id",
        "trace_id",
        "reward",
        "kind",
        "grader_digest_sha256",
    )
    missing = [key for key in required if key not in live]
    if missing:
        raise ForkPointError("provenance_incomplete", f"live_trace missing {missing}")
    return {
        "hud_trace_id": live["trace_id"],
        "hud_job_id": live["job_id"],
        "task_id": "implement_sales_analyzer",
        "environment_id": live["env_id"],
        "environment_version": live["env_name"],
        "environment_image_digest": live.get(
            "environment_image_digest",
            environment_source_digest(status_path.parents[3]),
        ),
        "reward": live["reward"],
        "trace_kind": live["kind"],
        "fork_reason": "accepted-live-reward1-source-trace",
        "qa_result_ref": "unavailable-plan-003-owned",
        "file_evidence_ref": "unavailable-plan-003-owned",
        "grader_digest": live["grader_digest_sha256"],
        "grader_digest_source": "docs/plans/repo-map/STATUS.json:live_trace.grader_digest_sha256",
    }


def boundary_token(source: dict[str, Any], hud_step_id: str) -> str:
    return digest_json(
        {
            "env": source["environment_id"],
            "job": source["hud_job_id"],
            "trace": source["hud_trace_id"],
            "step": hud_step_id,
            "task": source["task_id"],
        }
    )


class SnapshotProvider(Protocol):
    def capture(self, state: dict[str, Any], mode: str) -> dict[str, Any]:
        """Capture executable state and return provider snapshot metadata."""

    def restore(self, snapshot_id: str) -> dict[str, Any]:
        """Restore executable state for task-visible probes."""

    def cleanup(self, snapshot_id: str) -> None:
        """Clean up an unfinalized snapshot."""


class InMemorySnapshotProvider:
    """Deterministic provider for behavior tests; not the real Modal adapter."""

    def __init__(self) -> None:
        self._snapshots: dict[str, dict[str, Any]] = {}
        self.cleaned: list[str] = []

    def capture(self, state: dict[str, Any], mode: str) -> dict[str, Any]:
        snapshot_id = "local-" + digest_json({"mode": mode, "state": state})[:16]
        self._snapshots[snapshot_id] = copy.deepcopy(state)
        return {
            "snapshot_id": snapshot_id,
            "snapshot_mode": mode,
            "snapshot_digest": digest_json(state),
            "snapshot_restore_ref": f"in-memory://{snapshot_id}",
            "snapshot_retention": "process-local-test-only",
        }

    def restore(self, snapshot_id: str) -> dict[str, Any]:
        try:
            return copy.deepcopy(self._snapshots[snapshot_id])
        except KeyError as exc:
            raise ForkPointError(
                "state_restore_failed", "snapshot unavailable"
            ) from exc

    def cleanup(self, snapshot_id: str) -> None:
        self.cleaned.append(snapshot_id)
        self._snapshots.pop(snapshot_id, None)


class ForkPointStore:
    """Immutable JSON store for finalized ForkPoint records."""

    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, record: dict[str, Any]) -> Path:
        record = copy.deepcopy(record)
        record["content_digest"] = digest_json(
            {k: v for k, v in record.items() if k != "content_digest"}
        )
        path = self.root / f"{record['fork_point_id']}.json"
        if path.exists():
            raise ForkPointError(
                "state_capture_failed", "finalized ForkPoint is immutable"
            )
        path.write_text(
            json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return path

    def get(self, fork_point_id: str) -> dict[str, Any]:
        path = self.root / f"{fork_point_id}.json"
        record = json.loads(path.read_text(encoding="utf-8"))
        expected = record.get("content_digest")
        actual = digest_json({k: v for k, v in record.items() if k != "content_digest"})
        if expected != actual:
            raise ForkPointError(
                "state_restore_failed", "ForkPoint content digest mismatch"
            )
        return record


def capture_forkpoint(
    *,
    source: dict[str, Any],
    hud_step_id: str,
    history_prefix: list[dict[str, Any]],
    task_state: dict[str, Any],
    snapshot_mode: str,
    provider: SnapshotProvider,
    store: ForkPointStore,
) -> dict[str, Any]:
    if snapshot_mode not in SUPPORTED_SNAPSHOT_MODES:
        raise ForkPointError(
            "state_capture_failed", f"unsupported snapshot mode: {snapshot_mode}"
        )
    history_hash = digest_json(history_prefix)
    token = boundary_token(source, hud_step_id)
    snapshot: dict[str, Any] | None = None
    try:
        snapshot = provider.capture(task_state, snapshot_mode)
        fork_point_id = (
            "fp-"
            + digest_json(
                {"boundary": token, "history": history_hash, "snapshot": snapshot}
            )[:24]
        )
        record = {
            "schema_version": 1,
            "fork_point_id": fork_point_id,
            "hud_trace_id": source["hud_trace_id"],
            "hud_step_id": hud_step_id,
            "task_id": source["task_id"],
            "environment_version": source["environment_version"],
            "environment_image_digest": source["environment_image_digest"],
            "trace_kind": source["trace_kind"],
            "history_hash": history_hash,
            "history_prefix_ref": f"inline-sha256:{history_hash}",
            "snapshot_id": snapshot["snapshot_id"],
            "snapshot_mode": snapshot["snapshot_mode"],
            "snapshot_digest": snapshot["snapshot_digest"],
            "snapshot_restore_ref": snapshot["snapshot_restore_ref"],
            "snapshot_retention": snapshot["snapshot_retention"],
            "grader_digest": source["grader_digest"],
            "grader_digest_source": source["grader_digest_source"],
            "fork_reason": source["fork_reason"],
            "boundary_token": token,
            "parent_node_id": hud_step_id,
            "source_evidence_refs": [
                source["grader_digest_source"],
                source["qa_result_ref"],
                source["file_evidence_ref"],
            ],
            "network_policy": snapshot.get(
                "network_policy", "not-proven-real-modal-security"
            ),
            "secret_policy": snapshot.get("secret_policy", "no-secrets-recorded"),
            "resource_policy": snapshot.get(
                "resource_policy", "not-proven-real-modal-limits"
            ),
            "created_at": utc_now(),
        }
        store.put(record)
        return store.get(fork_point_id)
    except Exception:
        if snapshot is not None:
            provider.cleanup(snapshot["snapshot_id"])
        raise


def restore_forkpoint(
    *,
    record: dict[str, Any],
    provider: SnapshotProvider,
    expected_boundary_token: str,
    history_prefix: list[dict[str, Any]],
    grader_digest: str,
) -> dict[str, Any]:
    if record["snapshot_mode"] not in SUPPORTED_SNAPSHOT_MODES:
        raise ForkPointError("state_restore_failed", "unsupported_snapshot_mode")
    if record["boundary_token"] != expected_boundary_token:
        raise ForkPointError("boundary_mismatch", "boundary token mismatch")
    if record["history_hash"] != digest_json(history_prefix):
        raise ForkPointError("history_mismatch", "history prefix mismatch")
    if record["grader_digest"] != grader_digest:
        raise ForkPointError("grader_mismatch", "grader digest mismatch")
    restored = provider.restore(record["snapshot_id"])
    return {
        "fork_point_id": record["fork_point_id"],
        "task_id": record["task_id"],
        "environment_version": record["environment_version"],
        "environment_image_digest": record["environment_image_digest"],
        "snapshot_restore_ref": record["snapshot_restore_ref"],
        "snapshot_id": record["snapshot_id"],
        "snapshot_mode": record["snapshot_mode"],
        "snapshot_digest": record["snapshot_digest"],
        "history_prefix_ref": record["history_prefix_ref"],
        "history_hash": record["history_hash"],
        "boundary_token": record["boundary_token"],
        "parent_node_id": record["parent_node_id"],
        "isolated_writable_root": restored.get("task_state_root", "unknown"),
        "grader_digest": record["grader_digest"],
        "grader_digest_source": record["grader_digest_source"],
        "source_evidence_refs": record["source_evidence_refs"],
        "network_policy": record["network_policy"],
        "secret_policy": record["secret_policy"],
        "resource_policy": record["resource_policy"],
        "snapshot_retention": record["snapshot_retention"],
        "branch_tag_inputs": {
            "trace_kind": record["trace_kind"],
            "fork_reason": record["fork_reason"],
        },
        "task_visible_probe": restored,
    }
