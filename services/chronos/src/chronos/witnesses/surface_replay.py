"""Replay sealed candidate deltas through recorded grader surfaces."""

from __future__ import annotations

import base64
import json
from pathlib import Path
from typing import Any

from .local_env import load_local_env
from .models import digest_json


def _write_text_command(files: dict[str, str]) -> tuple[str, str, str]:
    payload = base64.b64encode(json.dumps(files).encode()).decode()
    script = "\n".join(
        [
            "python3 - <<'PY'",
            "import base64, json",
            "from pathlib import Path",
            f"files = json.loads(base64.b64decode({payload!r}).decode())",
            "for path, text in files.items():",
            "    target = Path(path)",
            "    target.parent.mkdir(parents=True, exist_ok=True)",
            "    target.write_text(text)",
            "PY",
        ]
    )
    return ("bash", "-lc", script)


def _run_sandbox_command(
    sandbox: Any, argv: list[str], *, cwd: str, timeout: int = 180
) -> dict[str, Any]:
    proc = sandbox.exec(*argv, workdir=cwd, timeout=timeout)
    proc.wait()
    stdout = proc.stdout.read()
    stderr = proc.stderr.read()
    return {
        "returncode": proc.returncode,
        "stdout": stdout,
        "stderr": stderr,
        "output_digest": digest_json(
            {"stdout": stdout, "stderr": stderr, "returncode": proc.returncode}
        ),
    }


def replay_with_recorded_surface(
    candidate: dict[str, Any], attempt: int
) -> dict[str, Any]:
    """Replay a candidate on a fresh restored Modal filesystem image without model calls."""

    root = Path(str(candidate.get("_chronos_repo_root") or Path.cwd()))
    load_local_env(root)

    import modal

    surface = candidate["replay_surface"]
    delta = candidate["causal_delta"]
    files = dict(delta.get("added_text") or {})
    files.update(delta.get("modified_text") or {})
    app = modal.App.lookup("chronos-plan-003-replay", create_if_missing=True)
    restore_ref = (
        candidate.get("pre_attack_snapshot_ref") or candidate["snapshot_restore_ref"]
    )
    snapshot_id = str(restore_ref).removeprefix("modal-image://")
    sandbox = modal.Sandbox.create(
        image=modal.Image.from_id(snapshot_id),
        app=app,
        block_network=True,
        secrets=[],
        cpu=0.5,
        memory=1024,
        timeout=300,
        workdir=surface["cwd"],
        tags={
            "chronos_plan": "003",
            "purpose": "witness_replay",
            "attempt": str(attempt),
        },
    )
    try:
        write_result = _run_sandbox_command(
            sandbox,
            list(_write_text_command(files)),
            cwd=surface["cwd"],
            timeout=60,
        )
        setup_result = None
        if surface.get("pre_grader_command_argv"):
            setup_result = _run_sandbox_command(
                sandbox,
                list(surface["pre_grader_command_argv"]),
                cwd=surface["cwd"],
                timeout=120,
            )
        grade_result = _run_sandbox_command(
            sandbox,
            list(surface["grader_command_argv"]),
            cwd=surface["cwd"],
            timeout=180,
        )
        return {
            "attempt": attempt,
            "restore_ref": f"modal-sandbox://{sandbox.object_id}",
            "grader_digest": surface["grader_digest"],
            "action_record_digest": candidate["action_record_digest"],
            "reward": 1.0 if grade_result["returncode"] == 0 else 0.0,
            "model_gateway_request_ids": [],
            "verifier_output_digest": grade_result["output_digest"],
            "file_diff_digest": digest_json(
                {
                    "causal_delta_digest": delta["content_digest"],
                    "write_result": write_result["output_digest"],
                    "setup_result": setup_result["output_digest"]
                    if setup_result
                    else None,
                    "grade_result": grade_result["output_digest"],
                }
            ),
        }
    finally:
        sandbox.terminate()
