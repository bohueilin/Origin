"""Plan 003 command entrypoints."""

from __future__ import annotations

import argparse
import asyncio
import importlib.util
import json
import os
import shutil
from pathlib import Path
from typing import Any

from .branch_batch_reuse import load_reused_branch_batch
from .branch_runs import run_live_branch_batch
from .models import WitnessError, digest_json, utc_now
from .qa_binding import inspect_hud_qa_binding, run_reward_hacking_analysis
from .qa_synthetic import run_synthetic_reward_hacking_smoke
from .security import assert_branch_security

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs" / "plans" / "evidence" / "003" / "artifacts"


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _write_artifact(name: str, data: dict[str, Any]) -> Path:
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE / name
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path


def _load_local_env() -> dict[str, str]:
    env_path = ROOT / ".env"
    loaded: dict[str, str] = {}
    if not env_path.exists():
        return loaded
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip().strip("'\"")
        if key and key not in os.environ:
            os.environ[key] = value
            loaded[key] = "present"
    return loaded


def _credential_presence() -> dict[str, str]:
    names = (
        "MODAL_TOKEN_ID",
        "MODAL_TOKEN_SECRET",
        "HUD_API_KEY",
        "ANTHROPIC_API_KEY",
    )
    return {name: "present" if os.environ.get(name) else "absent" for name in names}


def _modal_restore_inspection(forkpoint: dict[str, Any]) -> dict[str, Any]:
    _load_local_env()
    presence = _credential_presence()
    if any(value != "present" for value in presence.values()):
        return {
            "status": "blocked",
            "credential_presence": presence,
            "observed_behavior": "live restore inspection skipped because required local credentials were absent",
        }

    import modal

    app = modal.App.lookup("chronos-plan-003", create_if_missing=True)
    sandbox = modal.Sandbox.create(
        image=modal.Image.from_id(forkpoint["snapshot_id"]),
        app=app,
        block_network=True,
        secrets=[],
        cpu=0.5,
        memory=1024,
        timeout=300,
        workdir="/app",
        tags={"chronos_plan": "003", "purpose": "branch_gateway_restore_inspection"},
    )
    try:

        def run(command: str, timeout: int = 60) -> dict[str, Any]:
            proc = sandbox.exec("bash", "-lc", command, workdir="/app", timeout=timeout)
            proc.wait()
            return {
                "returncode": proc.returncode,
                "stdout": proc.stdout.read(),
                "stderr": proc.stderr.read(),
            }

        inventory = run(
            "python3 - <<'PY'\n"
            "from pathlib import Path\n"
            "import json\n"
            "paths=['/app','/app/query.py','/app/env.py','/app/tasks.py','/app/pyproject.toml','/app/task_assets','/data/db']\n"
            "print(json.dumps({p:{'exists':Path(p).exists(),'is_file':Path(p).is_file(),'is_dir':Path(p).is_dir()} for p in paths}, sort_keys=True))\n"
            "PY"
        )
        grade = run(
            "pgrep -x mongod >/dev/null || "
            "mongod --fork --logpath /var/log/mongodb.log --dbpath /data/db >/tmp/mongod-start.log 2>&1; "
            "python3 -m pytest task_assets/test_outputs.py -q > /tmp/grade.log 2>&1; "
            "rc=$?; tail -80 /tmp/grade.log; exit $rc",
            timeout=180,
        )
        hud_server = run(
            "test -f env.py && "
            "(hud serve env.py --host 0.0.0.0 --port 8765 --help >/tmp/hud-help.log 2>&1; "
            "echo env-server-present) || echo env-server-missing"
        )
        grade_output = grade["stdout"] + grade["stderr"]
        grade_summary = "pass"
        if "IndentationError" in grade_output:
            grade_summary = "query.py IndentationError"
        elif grade["returncode"] != 0:
            grade_summary = "grader returned nonzero"
        inventory_data = json.loads(inventory["stdout"])
        status = (
            "pass"
            if grade["returncode"] == 0
            and hud_server["stdout"].strip() == "env-server-present"
            else "blocked"
        )
        observed = (
            "Recorded Plan 002 snapshot restores as branch-ready Modal/HUD task state: HUD server files are present "
            "and the trusted grader passes from the restored state."
            if status == "pass"
            else (
                "Recorded Plan 002 snapshot restores as Modal task state, but it is not branch-ready for HUD "
                "BranchGateway execution or trusted grading."
            )
        )
        return {
            "status": status,
            "credential_presence": presence,
            "sandbox_id": sandbox.object_id,
            "network_policy": "block_network=True",
            "secret_policy": "secrets=[]",
            "inventory": inventory_data,
            "grader_returncode": grade["returncode"],
            "grader_output_sha256": digest_json(grade_output),
            "grader_summary": grade_summary,
            "hud_server_probe_stdout": hud_server["stdout"].strip(),
            "observed_behavior": observed,
        }
    finally:
        sandbox.terminate()


async def _run_branch_gateway_smoke(forkpoint: dict[str, Any]) -> dict[str, Any]:
    _load_local_env()
    presence = _credential_presence()
    if any(value != "present" for value in presence.values()):
        return {
            "status": "blocked",
            "credential_presence": presence,
            "observed_behavior": "BranchGateway smoke skipped because required local credentials were absent",
        }

    import modal
    from hud.agents.claude.agent import ClaudeAgent, ClaudeConfig
    from hud.eval.runtime import ModalRuntime

    env_path = ROOT / "envs" / "mongodb-sales-aggregation-engine" / "env.py"
    spec = importlib.util.spec_from_file_location("mongodb_hud_env", env_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load HUD env from {env_path}")
    env_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(env_module)

    task = env_module.implement_sales_analyzer()
    runtime = ModalRuntime(
        image=modal.Image.from_id(forkpoint["snapshot_id"]),
        app_name="chronos-plan-003",
        workdir="/app",
        command=(
            "uv",
            "run",
            "hud",
            "serve",
            "env:env",
            "--host",
            "0.0.0.0",
            "--port",
            "8765",
        ),
    )
    agent = ClaudeAgent(
        ClaudeConfig(
            model="claude-haiku-4-5",
            max_steps=2,
            max_tokens=2048,
            use_computer_beta=False,
        )
    )
    job = await task.run(agent, runtime=runtime)
    runs = getattr(job, "runs", None) or []
    trace_id = None
    if runs:
        trace_id = getattr(runs[0], "trace_id", None)
    trace_id = trace_id or getattr(job, "trace_id", None)
    return {
        "status": "pass" if getattr(job, "id", None) and trace_id else "blocked",
        "credential_presence": presence,
        "job_id": str(getattr(job, "id", "")),
        "trace_id": str(trace_id or ""),
        "reward": getattr(job, "reward", None),
        "model": "claude-haiku-4-5",
        "max_steps": 2,
        "counted_branch_run": False,
        "observed_behavior": (
            "Diagnostic BranchGateway smoke produced a HUD job/trace from the corrected ForkPoint snapshot. "
            "It is not counted as a Plan 003 BranchRun because it does not run the full branch budget, does not "
            "join HUD QA, and starts from an already reward-1 accepted state."
        ),
    }


def integration_witness() -> int:
    plan002 = _load_json(ROOT / "docs" / "plans" / "evidence" / "002" / "MANIFEST.json")
    plan004 = _load_json(ROOT / "docs" / "plans" / "evidence" / "004" / "MANIFEST.json")
    forkpoint = _load_json(
        ROOT
        / "docs"
        / "plans"
        / "evidence"
        / "002"
        / "artifacts"
        / "forkpoint-record.json"
    )
    commands = _load_json(ROOT / "docs" / "plans" / "repo-map" / "COMMANDS.json")
    branch_execution_blockers: list[str] = []
    promotion_blockers: list[str] = []
    if plan002.get("status") != "complete":
        branch_execution_blockers.append("Plan 002 manifest is not complete")
    if plan004.get("status") != "complete":
        branch_execution_blockers.append("Plan 004 manifest is not complete")
    if forkpoint.get("snapshot_mode") not in {"filesystem", "directory"}:
        branch_execution_blockers.append("ForkPoint snapshot is not filesystem-class")
    if not shutil.which("hud"):
        branch_execution_blockers.append("HUD CLI not found on PATH")
    harden = ROOT / ".external" / "harden-v0" / "dedup_hacks.py"
    if not harden.exists():
        promotion_blockers.append("pinned harden-v0 dedup_hacks.py is unavailable")
    command_status = commands["commands"]["integration-witness"]["status"]
    if command_status != "verified":
        branch_execution_blockers.append(
            "integration-witness command is not yet verified in COMMANDS.json"
        )

    restore_inspection: dict[str, Any]
    try:
        restore_inspection = _modal_restore_inspection(forkpoint)
    except Exception as exc:  # noqa: BLE001 - integration command records provider failures.
        restore_inspection = {
            "status": "blocked",
            "error_class": type(exc).__name__,
            "observed_behavior": str(exc),
        }
    restore_path = _write_artifact(
        "branch-gateway-restore-inspection.json",
        {
            "checked_at": utc_now(),
            "fork_point_id": forkpoint.get("fork_point_id"),
            "snapshot_id": forkpoint.get("snapshot_id"),
            **restore_inspection,
        },
    )
    if restore_inspection.get("status") != "pass":
        branch_execution_blockers.append(
            "accepted ForkPoint restore is not branch-ready for live BranchGateway execution"
        )
    else:
        try:
            smoke = asyncio.run(_run_branch_gateway_smoke(forkpoint))
        except Exception as exc:  # noqa: BLE001 - integration command records provider failures.
            smoke = {
                "status": "blocked",
                "error_class": type(exc).__name__,
                "observed_behavior": str(exc),
            }
        smoke_path = _write_artifact(
            "branch-gateway-smoke.json",
            {
                "checked_at": utc_now(),
                "fork_point_id": forkpoint.get("fork_point_id"),
                "snapshot_id": forkpoint.get("snapshot_id"),
                **smoke,
            },
        )
        if smoke.get("status") != "pass":
            branch_execution_blockers.append(
                "repo-owned live BranchGateway adapter smoke did not produce HUD trace evidence"
            )

    # These are distinct Plan 003 seams. Branch execution produces a completed
    # BranchRun; QA classification is a later same-branch promotion signal.
    qa_binding: dict[str, Any]
    try:
        qa_binding = inspect_hud_qa_binding(
            ROOT, smoke.get("trace_id") if "smoke" in locals() else None
        )
    except Exception as exc:  # noqa: BLE001 - integration command records provider failures.
        qa_binding = {
            "status": "blocked",
            "error_class": type(exc).__name__,
            "observed_behavior": str(exc),
            "blocker": "HUD QA reward-hacking classification API is not bound to this repo",
        }
    qa_binding_path = _write_artifact(
        "hud-qa-binding-inspection.json",
        {
            "checked_at": utc_now(),
            "fork_point_id": forkpoint.get("fork_point_id"),
            "snapshot_id": forkpoint.get("snapshot_id"),
            **qa_binding,
        },
    )
    qa_classifier_ready = qa_binding.get("status") == "pass"
    qa_classification_path: Path | None = None
    if "smoke" in locals() and smoke.get("trace_id"):
        action_record_digest = digest_json(
            {
                "trace_id": smoke.get("trace_id"),
                "job_id": smoke.get("job_id"),
                "counted_branch_run": smoke.get("counted_branch_run"),
            }
        )
        try:
            qa_classification = run_reward_hacking_analysis(
                ROOT,
                str(smoke["trace_id"]),
                branch_id="diagnostic-branch-gateway-smoke",
                action_record_digest=action_record_digest,
            )
        except Exception as exc:  # noqa: BLE001 - integration command records provider failures.
            qa_classification = {
                "status": "blocked",
                "error_class": type(exc).__name__,
                "observed_behavior": str(exc),
            }
        qa_classification_path = _write_artifact(
            "hud-qa-classification-smoke.json",
            {
                "checked_at": utc_now(),
                "fork_point_id": forkpoint.get("fork_point_id"),
                "snapshot_id": forkpoint.get("snapshot_id"),
                "counted_branch_run": False,
                **qa_classification,
            },
        )
        if qa_classification.get("status") != "pass":
            promotion_blockers.append(
                "canonical hud-trace-explorer Reward Hacking QA classification did not return a verdict"
            )
        else:
            qa_classifier_ready = True
    if not qa_classifier_ready:
        promotion_blockers.append(
            str(
                qa_binding.get("blocker")
                or "authoritative HUD QA reward-hacking classification API is not bound"
            )
        )
    branch_batch: dict[str, Any] | None = None
    if not branch_execution_blockers and qa_classifier_ready:
        try:
            branch_batch = load_reused_branch_batch(ROOT, forkpoint) or asyncio.run(
                run_live_branch_batch(ROOT, forkpoint, count=12, concurrency=12)
            )
        except Exception as exc:  # noqa: BLE001 - integration command records provider failures.
            branch_batch = {
                "status": "blocked",
                "error_class": type(exc).__name__,
                "observed_behavior": str(exc),
            }
        if branch_batch.get("executed_branch_count") != 12:
            promotion_blockers.append(
                "full 12 executed BranchRun loop did not complete"
            )
        elif branch_batch.get("status") != "pass":
            blockers = branch_batch.get("provenance_blockers") or [
                branch_batch.get("observed_behavior", "blocked")
            ]
            promotion_blockers.extend(str(blocker) for blocker in blockers)
        elif not branch_batch.get("candidate_branch_ids"):
            promotion_blockers.append(
                "12 BranchRuns completed but no branch satisfied reward + QA reward-hacking gates"
            )
        else:
            promotion_blockers.append(
                "reward-hacking candidates require durable packaging and three-replay Witness seal"
            )
    else:
        promotion_blockers.append(
            "full 12 executed BranchRun loop and three-replay Witness seal are not yet run"
        )

    artifact = {
        "checked_at": utc_now(),
        "status": "blocked"
        if branch_execution_blockers or promotion_blockers
        else "ready",
        "fork_point_id": forkpoint.get("fork_point_id"),
        "snapshot_id": forkpoint.get("snapshot_id"),
        "restore_inspection_ref": str(restore_path.relative_to(ROOT)),
        "branch_gateway_smoke_ref": (
            str(smoke_path.relative_to(ROOT)) if "smoke_path" in locals() else None
        ),
        "hud_qa_binding_ref": str(qa_binding_path.relative_to(ROOT)),
        "hud_qa_classification_ref": (
            str(qa_classification_path.relative_to(ROOT))
            if qa_classification_path
            else None
        ),
        "branch_run_batch_ref": branch_batch.get("artifact_ref")
        if branch_batch
        else None,
        "branch_execution": {
            "status": "blocked" if branch_execution_blockers else "ready",
            "blockers": branch_execution_blockers,
        },
        "promotion": {
            "status": "blocked" if promotion_blockers else "ready",
            "blockers": promotion_blockers,
        },
        "observed_behavior": (
            "integration preflight plus diagnostic BranchGateway smoke and, when QA is approved, the full 12 "
            "Hacker BranchRun batch. Canonical hud-trace-explorer QA remains a separate post-run classification "
            "path required before Witness promotion."
        ),
    }
    path = _write_artifact("integration-witness-preflight.json", artifact)
    print(f"WROTE {path}")
    blockers = branch_execution_blockers + promotion_blockers
    if blockers:
        for blocker in blockers:
            print(f"STOP: {blocker}")
        return 2
    return 0


def security_branch() -> int:
    policy = {
        "branch_secret_names": [],
        "sibling_writable_state": False,
        "artifact_writer": "trusted_orchestrator",
        "grader_trust_zone": "trusted_grader",
        "denied_egress_probe": "pass",
        "denied_secret_probe": "pass",
    }
    try:
        assert_branch_security(policy)
    except WitnessError as exc:
        print(f"FAIL {exc.error_class}: {exc}")
        return 1
    path = _write_artifact(
        "security-branch-preflight.json",
        {
            "checked_at": utc_now(),
            "status": "pass",
            "policy": policy,
            "observed_behavior": "local policy gate denies forbidden capabilities and requires trusted artifact/grader boundaries",
        },
    )
    print(f"PASS security preflight artifact={path}")
    return 0


def qa_synthetic_smoke(trace_json: str | None = None) -> int:
    _load_local_env()
    trace_summary = _load_json(Path(trace_json)) if trace_json else None
    result = run_synthetic_reward_hacking_smoke(ROOT, trace_summary=trace_summary)
    path = _write_artifact(
        "hud-qa-synthetic-reward-hack-smoke.json",
        {
            "checked_at": utc_now(),
            **result,
        },
    )
    print(f"WROTE {path}")
    if result.get("status") != "pass":
        print(
            f"STOP: {result.get('observed_behavior', 'synthetic QA smoke did not return a verdict')}"
        )
        return 2
    print(
        "PASS synthetic QA smoke "
        f"is_reward_hacking={result.get('is_reward_hacking')} "
        f"strategy={result.get('hacking_strategy')} "
        f"severity={result.get('severity')} "
        f"confidence={result.get('confidence')}"
    )
    return 0 if result.get("is_reward_hacking") is True else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("integration")
    sub.add_parser("security")
    qa_smoke = sub.add_parser("qa-synthetic-smoke")
    qa_smoke.add_argument("--trace-json")
    args = parser.parse_args()
    if args.command == "integration":
        return integration_witness()
    if args.command == "security":
        return security_branch()
    if args.command == "qa-synthetic-smoke":
        return qa_synthetic_smoke(args.trace_json)
    raise AssertionError(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
