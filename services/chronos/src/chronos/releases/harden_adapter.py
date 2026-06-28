"""Thin harden-v0 source adapter."""

from __future__ import annotations

import ast
import json
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from chronos.witnesses.local_env import credential_presence, load_local_env

from .harden_inspection import (
    inspect_fixer_artifact_layouts,
    inspect_hacker_refusal_loops,
    inspect_solver_validation_results,
)
from .models import ReleaseError, digest_json, utc_now

DEFAULT_ANTHROPIC_HARDEN_MODEL = "anthropic/claude-haiku-4-5"


def inspect_harden_config(config_path: Path) -> dict[str, Any]:
    """Read harden-v0 config/result schema from source without importing it."""

    if not config_path.exists():
        raise ReleaseError(
            "harden_unavailable", f"missing harden-v0 config: {config_path}"
        )
    harden_root = config_path.parents[1]
    tree = ast.parse(config_path.read_text(encoding="utf-8"))
    fields: dict[str, str] = {}
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == "HardenConfig":
            for item in node.body:
                if isinstance(item, ast.AnnAssign) and isinstance(
                    item.target, ast.Name
                ):
                    fields[item.target.id] = ast.unparse(item.annotation)
            break
    if not fields:
        raise ReleaseError("harden_schema_unavailable", "HardenConfig class not found")
    required = {
        "max_iterations",
        "hacker_retries",
        "replay_retries",
        "replay_enabled",
        "legitimate_threshold",
    }
    missing = sorted(required - set(fields))
    if missing:
        raise ReleaseError(
            "harden_schema_unavailable", f"HardenConfig missing {missing}"
        )
    return {
        "schema_version": 1,
        "config_path": str(config_path),
        "harden_config_fields": fields,
        "iteration_bounds": {
            "max_iterations": _literal_default(tree, "HardenConfig", "max_iterations"),
            "hacker_retries": _literal_default(tree, "HardenConfig", "hacker_retries"),
            "replay_retries": _literal_default(tree, "HardenConfig", "replay_retries"),
            "replay_enabled": _literal_default(tree, "HardenConfig", "replay_enabled"),
            "legitimate_threshold": _literal_default(
                tree, "HardenConfig", "legitimate_threshold"
            ),
        },
        "result_json_schema": inspect_harden_result_schema(harden_root),
    }


def prepare_harden_task_source(
    *,
    task_source: Path,
    tasks_root: Path,
    task_id: str,
) -> Path:
    """Copy an explicit task source into harden-v0's tasks-dir/task-id layout."""

    if not task_source.is_dir():
        raise ReleaseError(
            "harden_unavailable",
            f"harden task source is not a directory: {task_source}",
        )
    required = ["instruction.md", "tests", "environment"]
    missing = [name for name in required if not (task_source / name).exists()]
    if missing:
        raise ReleaseError(
            "harden_unavailable", f"harden task source missing {missing}"
        )
    target = tasks_root / task_id
    if target.exists():
        shutil.rmtree(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(task_source, target)
    return target


def run_harden_v0(
    *,
    repo_root: Path,
    harden_root: Path,
    task_id: str,
    task_source: Path,
    output_root: Path,
    max_iterations: int,
    timeout_seconds: int,
    hacker_retries: int = 1,
    solver_precheck_retries: int = 1,
    replay_retries: int = 1,
    hacker_max_turns: int | None = None,
    hacker_model: str | None = None,
    fixer_model: str | None = None,
    solver_model: str | None = None,
) -> dict[str, Any]:
    """Run the upstream harden-v0 CLI through this repo's optional dependency boundary."""

    _validate_total_attempts(
        hacker_retries=hacker_retries,
        solver_precheck_retries=solver_precheck_retries,
        replay_retries=replay_retries,
    )
    load_local_env(repo_root)
    selected_models = select_harden_models(
        hacker_model=hacker_model,
        fixer_model=fixer_model,
        solver_model=solver_model,
    )
    require_selected_model_credentials(selected_models)
    started_at = utc_now()
    run_id = "run-" + re.sub(r"[^0-9A-Za-z]+", "", started_at)
    run_root = output_root / run_id
    tasks_root = run_root / "tasks"
    task_copy = prepare_harden_task_source(
        task_source=task_source, tasks_root=tasks_root, task_id=task_id
    )
    harden_output = run_root / "harden-output"
    command = [
        "uv",
        "run",
        "--extra",
        "harden-v0",
        "python",
        "-c",
        (
            "import sys; "
            f"sys.path.insert(0, {str(harden_root)!r}); "
            "from chronos.releases.harden_runtime_patch import install as _install_harden_patch; "
            "_install_harden_patch(); "
            "from harden.__main__ import main; "
            "main()"
        ),
        "--task-id",
        task_id,
        "--tasks-dir",
        str(tasks_root),
        "--output-dir",
        str(harden_output),
        "--max-iterations",
        str(max_iterations),
        "--hacker-retries",
        str(hacker_retries),
        "--solver-precheck-retries",
        str(solver_precheck_retries),
        "--replay-retries",
        str(replay_retries),
        "--replay-enabled",
        "--no-legitimate-marker",
        "--summary-model",
        "",
        "--log-level",
        "INFO",
    ]
    if hacker_max_turns is not None:
        command.extend(["--hacker-max-turns", str(hacker_max_turns)])
    command.extend(["--hacker-model", selected_models["hacker_model"]])
    command.extend(["--fixer-model", selected_models["fixer_model"]])
    command.extend(["--solver-model", selected_models["solver_model"]])
    try:
        completed = subprocess.run(
            command,
            cwd=repo_root,
            text=True,
            capture_output=True,
            timeout=timeout_seconds,
            check=False,
        )
        timed_out = False
    except subprocess.TimeoutExpired as exc:
        completed = subprocess.CompletedProcess(
            command,
            returncode=124,
            stdout=exc.stdout or "",
            stderr=exc.stderr or "",
        )
        timed_out = True

    result_path = harden_output / task_id / "result.json"
    result_json = None
    if result_path.exists():
        result_json = json.loads(result_path.read_text(encoding="utf-8"))
    fixer_artifact_layouts = inspect_fixer_artifact_layouts(harden_output, task_id)
    solver_validation_results = inspect_solver_validation_results(
        harden_output, task_id
    )
    hacker_refusal_loops = inspect_hacker_refusal_loops(harden_output, task_id)
    record = {
        "schema_version": 1,
        "adapter": "chronos.releases.harden_adapter.run_harden_v0",
        "started_at": started_at,
        "completed_at": utc_now(),
        "task_id": task_id,
        "task_source": str(task_source),
        "task_copy": str(task_copy),
        "harden_root": str(harden_root),
        "output_root": str(output_root),
        "run_id": run_id,
        "run_root": str(run_root),
        "command_argv": command,
        "selected_models": selected_models,
        "credential_presence": credential_presence(
            (
                "GEMINI_API_KEY",
                "GOOGLE_API_KEY",
                "ANTHROPIC_API_KEY",
                "MODAL_TOKEN_ID",
                "MODAL_TOKEN_SECRET",
            )
        ),
        "returncode": completed.returncode,
        "timed_out": timed_out,
        "stdout_digest": digest_json({"stdout": completed.stdout}),
        "stderr_digest": digest_json({"stderr": completed.stderr}),
        "result_path": str(result_path),
        "result_json": result_json,
        "fixer_artifact_layouts": fixer_artifact_layouts,
        "solver_validation_results": solver_validation_results,
        "hacker_refusal_loops": hacker_refusal_loops,
    }
    blocker = harden_result_blocker(
        result_json,
        fixer_artifact_layouts,
        solver_validation_results,
        hacker_refusal_loops,
    )
    if blocker is not None:
        record["harden_blocker"] = blocker
    record["content_digest"] = digest_json(record)
    return record


def _validate_total_attempts(
    *,
    hacker_retries: int,
    solver_precheck_retries: int,
    replay_retries: int,
) -> None:
    """harden-v0 retry flags are total attempts; 1 attempt means zero retries."""

    attempt_counts = {
        "hacker_retries": hacker_retries,
        "solver_precheck_retries": solver_precheck_retries,
        "replay_retries": replay_retries,
    }
    invalid = {name: value for name, value in attempt_counts.items() if value < 1}
    if invalid:
        raise ReleaseError(
            "harden_attempts_disabled",
            "harden-v0 retry flags are total attempt counts; use 1 for one attempt with zero retry attempts. "
            f"Invalid values: {invalid}",
        )


def harden_result_blocker(
    result_json: dict[str, Any] | None,
    layouts: list[dict[str, Any]],
    solver_validation_results: list[dict[str, Any]],
    hacker_refusal_loops: list[dict[str, Any]] | None = None,
) -> dict[str, Any] | None:
    """Classify the current harden-v0 blocking condition."""

    if hacker_refusal_loops:
        return {
            "code": "harden_hacker_model_refusal_loop",
            "status": "blocked",
            "reason": (
                "harden-v0's hacker role produced repeated refusal messages instead of valid "
                "action JSON; the run cannot be treated as a release-gate attempt."
            ),
            "hacker_refusal_loops": hacker_refusal_loops,
        }
    if not result_json or not layouts:
        return None
    iterations = result_json.get("iterations")
    if not isinstance(iterations, list):
        return None
    has_fix_failed = any(
        isinstance(item, dict) and item.get("outcome") == "fix_failed"
        for item in iterations
    )
    terminal_iteration = next(
        (
            item
            for item in reversed(iterations)
            if isinstance(item, dict) and item.get("outcome")
        ),
        None,
    )
    replay_failures = [
        {
            "iteration": item.get("iteration"),
            "outcome": item.get("outcome"),
            "replay_reward": item.get("replay_reward"),
        }
        for item in iterations
        if isinstance(item, dict)
        and item.get("outcome") == "replay_broke_fix"
        and isinstance(item.get("replay_reward"), (int, float))
        and item.get("replay_reward") >= 1.0
    ]
    if terminal_iteration and terminal_iteration.get("outcome") == "fixed":
        return None
    if (
        replay_failures
        and terminal_iteration
        and terminal_iteration.get("outcome") == "replay_broke_fix"
    ):
        return {
            "code": "harden_replay_broke_candidate_fix",
            "status": "blocked",
            "reason": (
                "harden-v0's terminal candidate patch reached targeted replay, but the recorded "
                "replay still reproduced the exploit reward, so the candidate was rejected "
                "before ReleaseProof."
            ),
            "replay_failures": replay_failures,
        }
    if not has_fix_failed:
        return None
    failed_validation = [
        item
        for item in solver_validation_results
        if isinstance(item.get("reward"), (int, float)) and item.get("reward") < 1.0
    ]
    if failed_validation:
        return {
            "code": "harden_candidate_broke_solver_validation",
            "status": "blocked",
            "reason": (
                "harden-v0 applied the fixer patch to the validation surface, but solver validation "
                "failed, so the candidate patch was rejected before replay or ReleaseProof."
            ),
            "solver_validation_results": failed_validation,
        }
    drifted = [
        item
        for item in layouts
        if item.get("layout_status") == "nested_logs_artifacts"
        and item.get("changed_files")
    ]
    if not drifted:
        return None
    return {
        "code": "harden_fixer_artifact_layout_drift",
        "status": "blocked",
        "reason": (
            "harden-v0 expected the fixer git repo at trial_dir/artifacts, but Harbor "
            "exported the committed /logs/artifacts repo at trial_dir/artifacts/logs/artifacts; "
            "the observed patch is diagnostic only until harden-v0 applies and validates it."
        ),
        "affected_trial_dirs": [item["trial_dir"] for item in drifted],
        "changed_files": sorted(
            {path for item in drifted for path in item.get("changed_files", [])}
        ),
    }


def select_harden_models(
    *,
    hacker_model: str | None,
    fixer_model: str | None,
    solver_model: str | None,
) -> dict[str, str]:
    """Select harden-v0 models without falling back to Gemini/Google."""

    import os

    fallback = (
        os.environ.get("H2F2H_HARDEN_MODEL")
        or os.environ.get("H2F2H_HACKER_MODEL")
        or os.environ.get("FORKPROOF_BRANCH_MODEL")
        or DEFAULT_ANTHROPIC_HARDEN_MODEL
    )
    return {
        "hacker_model": hacker_model
        or os.environ.get("H2F2H_HACKER_MODEL")
        or fallback,
        "fixer_model": fixer_model or os.environ.get("H2F2H_FIXER_MODEL") or fallback,
        "solver_model": solver_model
        or os.environ.get("H2F2H_SOLVER_MODEL")
        or fallback,
    }


def require_selected_model_credentials(models: dict[str, str]) -> None:
    """Fail before harden-v0 if the selected provider credentials are absent."""

    import os

    for role, model in models.items():
        lowered = model.lower()
        if ("gemini" in lowered or lowered.startswith("google/")) and not (
            os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        ):
            raise ReleaseError(
                "harden_credentials_missing",
                f"{role} selected Gemini/Google model without key",
            )
        if ("anthropic" in lowered or "claude" in lowered) and not os.environ.get(
            "ANTHROPIC_API_KEY"
        ):
            raise ReleaseError(
                "harden_credentials_missing",
                f"{role} selected Anthropic model without key",
            )


def inspect_harden_result_schema(harden_root: Path) -> dict[str, Any]:
    """Read harden-v0 result.json shape from loop.py and CLAUDE.md."""

    loop_path = harden_root / "harden" / "loop.py"
    docs_path = harden_root / "CLAUDE.md"
    if not loop_path.exists():
        raise ReleaseError(
            "harden_schema_unavailable", f"missing harden-v0 loop: {loop_path}"
        )
    if not docs_path.exists():
        raise ReleaseError(
            "harden_schema_unavailable", f"missing harden-v0 docs: {docs_path}"
        )
    loop_tree = ast.parse(loop_path.read_text(encoding="utf-8"))
    implementation_fields = _assigned_dict_keys(loop_tree, "result")
    status_values = sorted(
        _subscript_string_assignments(loop_tree, "result", "status") | {"unknown"}
    )
    docs_text = docs_path.read_text(encoding="utf-8")
    documented_fields = sorted(
        set(
            re.findall(
                r'^\s*"([a-zA-Z_][a-zA-Z0-9_]*)":', docs_text, flags=re.MULTILINE
            )
        )
    )
    output_paths = sorted(set(re.findall(r"<output_dir>[^`\n]*", docs_text)))
    required = {"task_id", "status", "iterations", "oracle", "kernelbench_mode"}
    missing = sorted(required - set(implementation_fields))
    if missing:
        raise ReleaseError(
            "harden_schema_unavailable", f"harden result skeleton missing {missing}"
        )
    return {
        "schema_version": 1,
        "loop_path": str(loop_path),
        "docs_path": str(docs_path),
        "implementation_fields": implementation_fields,
        "documented_fields": documented_fields,
        "status_values": status_values,
        "output_paths": output_paths,
    }


def _assigned_dict_keys(tree: ast.AST, name: str) -> list[str]:
    for node in ast.walk(tree):
        value = None
        matches = False
        if isinstance(node, ast.Assign):
            value = node.value
            matches = any(
                isinstance(target, ast.Name) and target.id == name
                for target in node.targets
            )
        elif isinstance(node, ast.AnnAssign):
            value = node.value
            matches = isinstance(node.target, ast.Name) and node.target.id == name
        if matches and isinstance(value, ast.Dict):
            keys = [
                key.value
                for key in value.keys
                if isinstance(key, ast.Constant) and isinstance(key.value, str)
            ]
            return sorted(keys)
    return []


def _subscript_string_assignments(tree: ast.AST, name: str, key: str) -> set[str]:
    values: set[str] = set()
    for node in ast.walk(tree):
        if not isinstance(node, ast.Assign):
            continue
        if not isinstance(node.value, ast.Constant) or not isinstance(
            node.value.value, str
        ):
            continue
        for target in node.targets:
            if (
                isinstance(target, ast.Subscript)
                and isinstance(target.value, ast.Name)
                and target.value.id == name
                and isinstance(target.slice, ast.Constant)
                and target.slice.value == key
            ):
                values.add(node.value.value)
    return values


def _literal_default(tree: ast.AST, class_name: str, field_name: str) -> Any:
    for node in tree.body:
        if isinstance(node, ast.ClassDef) and node.name == class_name:
            for item in node.body:
                if (
                    isinstance(item, ast.AnnAssign)
                    and isinstance(item.target, ast.Name)
                    and item.target.id == field_name
                    and item.value is not None
                ):
                    return ast.literal_eval(item.value)
    return None
