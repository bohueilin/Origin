"""Replay accepted HUD trace tool calls into a live Modal sandbox and snapshot it."""

from __future__ import annotations

import json
import textwrap
from pathlib import Path
from typing import Any

from .core import digest_json, load_source_trace

ROOT = Path(__file__).resolve().parents[3]
ENV_DIR = ROOT / "envs" / "mongodb-sales-aggregation-engine"
EVIDENCE = ROOT / "docs" / "plans" / "evidence" / "002" / "artifacts"


QUERY_STUB = '''\
"""Implement SalesAnalyzer here (see the task prompt)."""


class SalesAnalyzer:
    def __init__(self, db_url: str, db_name: str):
        raise NotImplementedError

    def get_top_performing_products(
        self, start_date: str, end_date: str, limit: int = 3
    ) -> dict:
        raise NotImplementedError
'''


def _ensure_mongo_command() -> str:
    return textwrap.dedent(
        """
        if python3 - <<'PY' >/tmp/mongo-ping.log 2>&1
        from pymongo import MongoClient
        MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=1000).admin.command('ping')
        PY
        then
          exit 0
        fi
        rm -f /data/db/mongod.lock
        mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db
        python3 - <<'PY'
        import time
        from pymongo import MongoClient
        last = None
        for _ in range(30):
            try:
                MongoClient('mongodb://localhost:27017', serverSelectionTimeoutMS=1000).admin.command('ping')
                raise SystemExit(0)
            except Exception as exc:
                last = exc
                time.sleep(1)
        raise SystemExit(f'mongod did not become ready: {last}')
        PY
        """
    )


def _trace_events() -> list[dict[str, Any]]:
    from hud.utils.platform import PlatformClient

    source = load_source_trace(ROOT / "docs" / "plans" / "repo-map" / "STATUS.json")
    data = PlatformClient.from_settings().get(f"/trace/{source['hud_trace_id']}/events")
    events = data.get("events", data if isinstance(data, list) else [])
    if not events:
        raise RuntimeError("HUD trace export returned no events")
    return events


def _image():
    import modal

    return modal.Image.from_dockerfile(ENV_DIR / "Dockerfile.hud", context_dir=ENV_DIR)


def _exec(sb: Any, command: str, *, timeout: int = 120, check: bool = True) -> str:
    proc = sb.exec("bash", "-lc", command, workdir="/app", timeout=timeout)
    proc.wait()
    output = proc.stdout.read() + proc.stderr.read()
    if check and proc.returncode != 0:
        raise RuntimeError(
            f"sandbox command failed rc={proc.returncode}: {output[-1000:]}"
        )
    return output


def _setup_command() -> str:
    return (
        textwrap.dedent(
            """
            set -eu
            mkdir -p /app/task_assets /data/db /var/log /protected
            cp /app/task_assets/orders.json /app/task_assets/products.json /protected/
            cat > /app/query.py <<'PY'
            """
        )
        + QUERY_STUB
        + textwrap.dedent(
            """\
            PY
            """
        )
        + _ensure_mongo_command()
        + textwrap.dedent(
            """\
            python3 /app/task_assets/init_data.py
            """
        )
    )


def _apply_edit(sb: Any, args: dict[str, Any]) -> None:
    command = args.get("command")
    path = args.get("path")
    if command in {"view", None}:
        return
    if command == "str_replace":
        old = args["old_str"]
        new = args["new_str"]
        payload = json.dumps({"path": path, "old": old, "new": new})
        script = (
            "python3 - <<'PY'\n"
            "import json\n"
            f"p=json.loads({payload!r})\n"
            "path=p['path']; old=p['old']; new=p['new']\n"
            "text=open(path).read()\n"
            "if old not in text: raise SystemExit('old_str not found')\n"
            "open(path,'w').write(text.replace(old,new,1))\n"
            "PY"
        )
        _exec(sb, script)
        return
    raise RuntimeError(f"unsupported edit command: {command}")


def _replay(events: list[dict[str, Any]], sb: Any) -> dict[str, Any]:
    replayed: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    for event in events:
        if event.get("kind") == "scenario_evaluate":
            break
        if event.get("kind") != "tool_call":
            continue
        args = event.get("arguments") or {}
        tool = event.get("tool_name")
        item = {
            "seq": event.get("seq"),
            "id": event.get("id"),
            "tool": tool,
            "args_sha256": digest_json(args),
            "expected_error": bool(event.get("error")),
        }
        if tool == "bash":
            _exec(sb, args["command"], timeout=300, check=not event.get("error"))
            replayed.append(item)
        elif tool == "str_replace_based_edit_tool" and not event.get("error"):
            _apply_edit(sb, args)
            replayed.append(item)
        else:
            skipped.append(item)
    return {"replayed": replayed, "skipped": skipped}


def run_trace_replay_probe() -> dict[str, Any]:
    import modal

    events = _trace_events()
    source = load_source_trace(ROOT / "docs" / "plans" / "repo-map" / "STATUS.json")
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
        tags={"chronos_plan": "002", "purpose": "trace_replay_snapshot"},
    )
    restored = None
    try:
        _exec(sb, _setup_command(), timeout=180)
        replay = _replay(events, sb)
        query_sha = _exec(sb, "sha256sum /app/query.py | awk '{print $1}'").strip()
        grade_out = _exec(
            sb,
            "python3 -m pytest task_assets/test_outputs.py -q > /tmp/grade.log 2>&1; "
            "rc=$?; tail -20 /tmp/grade.log; exit $rc",
            timeout=180,
        )
        snapshot = sb.snapshot_filesystem()
        sb.terminate()
        restored = modal.Sandbox.create(
            "sleep",
            "infinity",
            image=snapshot,
            app=app,
            block_network=True,
            secrets=[],
            cpu=0.5,
            memory=1024,
            timeout=300,
            workdir="/app",
            tags={"chronos_plan": "002", "purpose": "trace_replay_restore"},
        )
        _exec(restored, _ensure_mongo_command(), timeout=60)
        restored_query_sha = _exec(
            restored, "sha256sum /app/query.py | awk '{print $1}'"
        ).strip()
        restored_grade = _exec(
            restored,
            "python3 -m pytest task_assets/test_outputs.py -q > /tmp/grade.log 2>&1; "
            "rc=$?; tail -20 /tmp/grade.log; exit $rc",
            timeout=180,
        )
        result = {
            "status": "trace-replay-filesystem-roundtrip-pass",
            "hud_trace_id": source["hud_trace_id"],
            "boundary": "after last replayed tool_call before scenario_evaluate",
            "snapshot_id": snapshot.object_id,
            "snapshot_mode": "filesystem",
            "snapshot_digest": digest_json(
                {"snapshot_id": snapshot.object_id, "query_sha": query_sha}
            ),
            "query_py_sha256": query_sha,
            "restored_query_py_sha256": restored_query_sha,
            "grade_output_sha256": digest_json(grade_out),
            "restored_grade_output_sha256": digest_json(restored_grade),
            "replayed_tool_count": len(replay["replayed"]),
            "skipped_tool_count": len(replay["skipped"]),
            "replayed_tools_sha256": digest_json(replay),
            "network_policy": "block_network=True",
            "secret_policy": "secrets=[]",
            "resource_policy": "cpu=0.5,memory=1024,timeout=900",
            "limitations": [
                "Replay uses exported accepted trace actions in a fresh Modal sandbox, not the original historical sandbox handle.",
                "Raw tool commands and outputs are not committed; replay evidence is hash-only.",
            ],
        }
        EVIDENCE.mkdir(parents=True, exist_ok=True)
        path = EVIDENCE / "trace-replay-snapshot.json"
        path.write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8"
        )
        return result
    finally:
        if restored is not None:
            restored.terminate()
        else:
            sb.terminate()


def main() -> int:
    result = run_trace_replay_probe()
    print(
        "PASS trace-replay-filesystem "
        f"snapshot={result['snapshot_id']} replayed={result['replayed_tool_count']}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
