"""Create a ForkPoint from an orchestrated accepted-trace rerun."""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from typing import Any

from .core import (
    ForkPointError,
    ForkPointStore,
    boundary_token,
    capture_forkpoint,
    digest_json,
    load_source_trace,
    restore_forkpoint,
)
from .image_identity_probe import run_image_identity_probe
from .replay_probe import (
    _ensure_mongo_command,
    _exec,
    _image,
    _replay,
    _setup_command,
    _trace_events,
)

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs" / "plans" / "evidence" / "002" / "artifacts"
HUD_STEP_ID = "completed-action:accepted-trace-rerun-before-scenario-evaluate"


def _history_prefix(replay: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "role": "system",
            "content_sha256": digest_json(
                {
                    "source": "accepted HUD trace export",
                    "boundary": HUD_STEP_ID,
                    "raw_history_committed": False,
                }
            ),
        },
        {
            "role": "tool_replay_summary",
            "replayed_tool_count": len(replay["replayed"]),
            "skipped_tool_count": len(replay["skipped"]),
            "replayed_tools_sha256": digest_json(replay),
        },
    ]


def _last_replayed_id(replay: dict[str, Any]) -> str:
    last = replay["replayed"][-1]
    return str(last.get("id") or last.get("seq") or HUD_STEP_ID)


def _quiesce(sb: Any) -> dict[str, str]:
    before = _exec(
        sb,
        "python3 - <<'PY'\n"
        "from pymongo import MongoClient\n"
        "try:\n"
        "    MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=1000).admin.command('ping')\n"
        "    print('running')\n"
        "except Exception:\n"
        "    print('stopped')\n"
        "PY",
    ).strip()
    _exec(
        sb,
        "python3 - <<'PY'\n"
        "from pymongo import MongoClient\n"
        "MongoClient('mongodb://localhost:27017').admin.command({'fsync': 1})\n"
        "PY\n"
        "sync\n"
        "mongod --shutdown --dbpath /data/db >/tmp/mongod-shutdown.log 2>&1 || true\n"
        "sync",
        timeout=60,
    )
    after = _exec(
        sb,
        "python3 - <<'PY'\n"
        "from pymongo import MongoClient\n"
        "try:\n"
        "    MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=1000).admin.command('ping')\n"
        "    print('running')\n"
        "except Exception:\n"
        "    print('stopped')\n"
        "PY",
    ).strip()
    return {
        "mongod_before_quiesce": before,
        "mongod_after_quiesce": after,
        "strategy": "trusted orchestrator MongoDB fsync, clean shutdown, and filesystem sync before snapshot",
    }


def _security_probe(sb: Any) -> dict[str, str]:
    script = (
        "python3 - <<'PY'\n"
        "from pathlib import Path\n"
        "import json, socket\n"
        "result = {\n"
        "  'root_env': 'present' if Path('/root/.env').exists() else 'absent',\n"
        "  'docker_sock': 'present' if Path('/var/run/docker.sock').exists() else 'absent',\n"
        "}\n"
        "try:\n"
        "    socket.create_connection(('169.254.169.254', 80), timeout=2).close()\n"
        "    result['metadata_network'] = 'reachable'\n"
        "except OSError:\n"
        "    result['metadata_network'] = 'blocked'\n"
        "print(json.dumps(result, sort_keys=True))\n"
        "PY"
    )
    return json.loads(_exec(sb, script, timeout=20).strip())


def _surface_inventory(sb: Any) -> dict[str, Any]:
    script = (
        "python3 - <<'PY'\n"
        "from pathlib import Path\n"
        "import hashlib, json, os, sys\n"
        "paths = ['/app', '/app/task_assets', '/data/db', '/var/log/mongodb.log', '/tmp', '/root']\n"
        "def writable(path):\n"
        "    p = Path(path)\n"
        "    return p.exists() and os.access(path, os.W_OK)\n"
        "env_allowlist = {'PYTHONHASHSEED', 'PYTHONPATH'}\n"
        "task_assets = {}\n"
        "for path in sorted(Path('/app/task_assets').glob('*')):\n"
        "    if path.is_file():\n"
        "        task_assets[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()\n"
        "result = {\n"
        "  'cwd': os.getcwd(),\n"
        "  'python_executable': sys.executable,\n"
        "  'python_path': sys.path,\n"
        "  'python_env': {k: os.environ[k] for k in sorted(env_allowlist) if k in os.environ},\n"
        "  'path_writable': {p: writable(p) for p in paths},\n"
        "  'task_assets_sha256': task_assets,\n"
        "  'branch_relevant_paths': ['/app/query.py', '/app/task_assets', '/data/db', '/var/log/mongodb.log'],\n"
        "  'trusted_evidence_root': 'outside sandbox: docs/plans/evidence/002',\n"
        "}\n"
        "print(json.dumps(result, sort_keys=True))\n"
        "PY"
    )
    return json.loads(_exec(sb, script, timeout=30).strip())


class ModalForkPointProvider:
    def __init__(self, sandbox: Any, app: Any):
        self._sandbox = sandbox
        self._app = app
        self._snapshots: dict[str, Any] = {}
        self._restored: Any | None = None
        self.restore_calls = 0

    def capture(self, state: dict[str, Any], mode: str) -> dict[str, Any]:
        if mode != "filesystem":
            raise ValueError("Modal live boundary probe supports filesystem mode only")
        snapshot = self._sandbox.snapshot_filesystem()
        self._snapshots[snapshot.object_id] = snapshot
        return {
            "snapshot_id": snapshot.object_id,
            "snapshot_mode": "filesystem",
            "snapshot_digest": digest_json(
                {
                    "snapshot_id": snapshot.object_id,
                    "query_sha": state["query_py_sha256"],
                    "history_hash": state["history_prefix_sha256"],
                }
            ),
            "snapshot_restore_ref": f"modal-image://{snapshot.object_id}",
            "snapshot_retention": "modal-default-ttl",
            "network_policy": "block_network=True",
            "secret_policy": "secrets=[]",
            "resource_policy": "cpu=0.5,memory=1024,timeout=900",
        }

    def restore(self, snapshot_id: str) -> dict[str, Any]:
        self.restore_calls += 1
        if snapshot_id not in self._snapshots:
            raise KeyError(snapshot_id)
        import modal

        self._restored = modal.Sandbox.create(
            "sleep",
            "infinity",
            image=self._snapshots[snapshot_id],
            app=self._app,
            block_network=True,
            secrets=[],
            cpu=0.5,
            memory=1024,
            timeout=300,
            workdir="/app",
            tags={"chronos_plan": "002", "purpose": "live_boundary_restore"},
        )
        _exec(self._restored, _ensure_mongo_command(), timeout=60)
        query_sha = _exec(
            self._restored, "sha256sum /app/query.py | awk '{print $1}'"
        ).strip()
        grader = _exec(
            self._restored,
            "python3 -m pytest task_assets/test_outputs.py -q > /tmp/grade.log 2>&1; "
            "rc=$?; tail -20 /tmp/grade.log; exit $rc",
            timeout=180,
        )
        security = _security_probe(self._restored)
        inventory = _surface_inventory(self._restored)
        return {
            "task_state_root": "/",
            "query_py_sha256": query_sha,
            "restored_grade_output_sha256": digest_json(grader),
            "restored_sandbox_probe": "query hash and pytest grader executed after restore",
            "security_probe": security,
            "surface_inventory": inventory,
        }

    def cleanup(self, snapshot_id: str) -> None:
        self._snapshots.pop(snapshot_id, None)

    def close(self) -> None:
        if self._restored is not None:
            self._restored.terminate()


def _negative_restore_checks(
    *,
    record: dict[str, Any],
    provider: ModalForkPointProvider,
    source: dict[str, Any],
    history: list[dict[str, Any]],
) -> dict[str, Any]:
    checks = []
    cases = [
        (
            "boundary_mismatch",
            lambda: restore_forkpoint(
                record=record,
                provider=provider,
                expected_boundary_token=boundary_token(source, "wrong-boundary"),
                history_prefix=history,
                grader_digest=source["grader_digest"],
            ),
        ),
        (
            "history_mismatch",
            lambda: restore_forkpoint(
                record=record,
                provider=provider,
                expected_boundary_token=record["boundary_token"],
                history_prefix=[{"role": "assistant", "content": "different"}],
                grader_digest=source["grader_digest"],
            ),
        ),
        (
            "grader_mismatch",
            lambda: restore_forkpoint(
                record=record,
                provider=provider,
                expected_boundary_token=record["boundary_token"],
                history_prefix=history,
                grader_digest="different",
            ),
        ),
        (
            "state_restore_failed",
            lambda: restore_forkpoint(
                record={**record, "snapshot_mode": "memory"},
                provider=provider,
                expected_boundary_token=record["boundary_token"],
                history_prefix=history,
                grader_digest=source["grader_digest"],
            ),
        ),
    ]
    for expected, call in cases:
        before = provider.restore_calls
        try:
            call()
        except ForkPointError as exc:
            after = provider.restore_calls
            checks.append(
                {
                    "case": expected,
                    "error_class": exc.error_class,
                    "handoff_created": False,
                    "provider_restore_called": after != before,
                }
            )
            continue
        raise AssertionError(f"negative restore check did not fail: {expected}")
    return {"status": "pass", "checks": checks}


def run_live_boundary_probe() -> dict[str, Any]:
    import modal

    source = load_source_trace(ROOT / "docs" / "plans" / "repo-map" / "STATUS.json")
    image_identity = run_image_identity_probe()
    source = {
        **source,
        "environment_image_digest": image_identity["environment_image_digest"],
    }
    events = _trace_events()
    app = modal.App.lookup("chronos-plan-002", create_if_missing=True)
    sb = modal.Sandbox.create(
        "sleep",
        "infinity",
        image=_image(),
        app=app,
        block_network=True,
        secrets=[],
        cpu=0.5,
        memory=1024,
        timeout=900,
        workdir="/app",
        tags={"chronos_plan": "002", "purpose": "live_boundary_capture"},
    )
    provider = ModalForkPointProvider(sb, app)
    try:
        _exec(sb, _setup_command(), timeout=180)
        replay = _replay(events, sb)
        query_sha = _exec(sb, "sha256sum /app/query.py | awk '{print $1}'").strip()
        quiesce = _quiesce(sb)
        history = _history_prefix(replay)
        task_state = {
            "task_state_root": "/",
            "query_py_sha256": query_sha,
            "history_prefix_sha256": digest_json(history),
            "completed_action_boundary": HUD_STEP_ID,
            "last_replayed_tool_id": _last_replayed_id(replay),
            "quiesce": quiesce,
        }
        with tempfile.TemporaryDirectory(prefix="forkpoint-live-boundary-") as tmp:
            store = ForkPointStore(Path(tmp))
            record = capture_forkpoint(
                source=source,
                hud_step_id=HUD_STEP_ID,
                history_prefix=history,
                task_state=task_state,
                snapshot_mode="filesystem",
                provider=provider,
                store=store,
            )
            record = store.get(record["fork_point_id"])
            handoff = restore_forkpoint(
                record=record,
                provider=provider,
                expected_boundary_token=boundary_token(source, HUD_STEP_ID),
                history_prefix=history,
                grader_digest=source["grader_digest"],
            )
            negative_checks = _negative_restore_checks(
                record=record,
                provider=provider,
                source=source,
                history=history,
            )
        result = {
            "status": "live-boundary-rerun-forkpoint-pass",
            "hud_trace_id": source["hud_trace_id"],
            "fork_point_id": record["fork_point_id"],
            "hud_step_id": HUD_STEP_ID,
            "boundary_token": record["boundary_token"],
            "history_hash": record["history_hash"],
            "history_prefix_ref": record["history_prefix_ref"],
            "snapshot_id": record["snapshot_id"],
            "snapshot_mode": record["snapshot_mode"],
            "snapshot_digest": record["snapshot_digest"],
            "snapshot_restore_ref": record["snapshot_restore_ref"],
            "snapshot_retention": record["snapshot_retention"],
            "query_py_sha256": query_sha,
            "restored_query_py_sha256": handoff["task_visible_probe"][
                "query_py_sha256"
            ],
            "restored_grade_output_sha256": handoff["task_visible_probe"][
                "restored_grade_output_sha256"
            ],
            "environment_image_digest": handoff["environment_image_digest"],
            "image_identity_ref": "docs/plans/evidence/002/artifacts/image-identity.json",
            "base_image_digest": image_identity["base_image"]["manifest_digest"],
            "replayed_tool_count": len(replay["replayed"]),
            "skipped_tool_count": len(replay["skipped"]),
            "replayed_tools_sha256": digest_json(replay),
            "quiesce": quiesce,
            "handoff_keys": sorted(handoff),
            "network_policy": record["network_policy"],
            "secret_policy": record["secret_policy"],
            "resource_policy": record["resource_policy"],
            "source_evidence_refs": record["source_evidence_refs"],
            "security_probe": handoff["task_visible_probe"]["security_probe"],
            "surface_inventory": handoff["task_visible_probe"]["surface_inventory"],
            "negative_restore_checks": negative_checks,
            "limitations": [
                "This is an orchestrated rerun from the accepted trace export with a retained Modal sandbox handle.",
                "It is not the already-finished historical sandbox instance from the original HUD run.",
                "Raw tool commands and outputs are not committed; history and replay evidence are hash-only.",
                "Environment image identity combines Docker Hub base manifest, source tree, and Modal recipe; it is not a Modal-internal built image manifest.",
            ],
        }
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        path = EVIDENCE / "live-boundary-forkpoint.json"
        path.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        record_path = EVIDENCE / "forkpoint-record.json"
        record_path.write_text(
            json.dumps(record, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return result
    finally:
        provider.close()
        sb.terminate()


def main() -> int:
    result = run_live_boundary_probe()
    print(
        "PASS live-boundary-forkpoint "
        f"fork_point={result['fork_point_id']} snapshot={result['snapshot_id']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
