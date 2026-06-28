#!/usr/bin/env python3
"""Run an exact repository command recorded by Wave 1."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
from pathlib import Path

from common import PLAN_DIR, ROOT, ValidationError, load_json, print_errors

PLAN_004_COMMANDS = {"plan-004-tests", "integration-controls"}
PLAN_004_DEFAULT_TASK_ID = "mongodb-sales-aggregation-engine"
PLAN_004_DEFAULT_MODEL = "gemini-3.1-pro"
PLAN_004_TASK_FILES = (
    "tests/test_outputs.py",
    "tests/test.sh",
    "environment/Dockerfile",
)


def _resolve_from_cwd(value: str, cwd: Path) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path.resolve()
    return (cwd / path).resolve()


def _check_plan_004_prerequisites(command: str, cwd: Path, env: dict[str, str]) -> None:
    if command not in PLAN_004_COMMANDS:
        return

    terminal_wrench = _resolve_from_cwd(
        env.get("H2F2H_TERMINAL_WRENCH_PATH", ".external/terminal-wrench"),
        cwd,
    )
    task_id = env.get("H2F2H_TERMINAL_WRENCH_TASK_ID", PLAN_004_DEFAULT_TASK_ID)
    model = env.get("H2F2H_TERMINAL_WRENCH_MODEL", PLAN_004_DEFAULT_MODEL)
    original_task = terminal_wrench / "tasks" / task_id / model / "original_task"
    missing = [
        str(original_task / relative)
        for relative in PLAN_004_TASK_FILES
        if not (original_task / relative).is_file()
    ]

    if missing:
        missing_block = "\n  - ".join(missing)
        raise ValidationError(
            f"command {command!r} is missing Plan 004 external prerequisite files:\n"
            f"  - {missing_block}\n"
            "Run `scripts/bootstrap_external_deps.sh` from the repository root, "
            "or set `H2F2H_TERMINAL_WRENCH_PATH` to a checkout containing the "
            "pinned Terminal Wrench task sources. `.external/` is intentionally "
            "gitignored and must not be committed."
        )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", help="Command key in repo-map/COMMANDS.json")
    args = parser.parse_args()

    try:
        path = PLAN_DIR / "repo-map" / "COMMANDS.json"
        data = load_json(path)
        if data.get("status") != "accepted":
            raise ValidationError(f"{path}: status is not accepted")
        commands = data.get("commands")
        if not isinstance(commands, dict) or args.command not in commands:
            raise ValidationError(f"{path}: unknown command {args.command!r}")
        entry = commands[args.command]
        if not isinstance(entry, dict):
            raise ValidationError(f"{path}: command entry must be an object")
        status = entry.get("status")
        if status == "not-applicable":
            reason = entry.get("reason")
            if not reason:
                raise ValidationError(f"{path}: not-applicable command lacks reason")
            print(f"SKIP: {args.command}: {reason}")
            return 0
        if status != "verified":
            raise ValidationError(f"{path}: command {args.command!r} is not verified")
        argv = entry.get("argv")
        if (
            not isinstance(argv, list)
            or not argv
            or not all(isinstance(item, str) and item for item in argv)
        ):
            raise ValidationError(
                f"{path}: command argv must be a non-empty string list"
            )
        cwd_raw = entry.get("cwd", ".")
        if not isinstance(cwd_raw, str):
            raise ValidationError(f"{path}: cwd must be a string")
        cwd = (ROOT / cwd_raw).resolve()
        try:
            cwd.relative_to(ROOT.resolve())
        except ValueError as exc:
            raise ValidationError(f"{path}: cwd escapes repository root") from exc
        if not cwd.exists():
            raise ValidationError(f"{path}: cwd does not exist: {cwd}")
        extra_env = entry.get("env", {})
        if not isinstance(extra_env, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in extra_env.items()
        ):
            raise ValidationError(f"{path}: env must be a string-to-string object")
        env = os.environ.copy()
        env.update(extra_env)
        timeout = entry.get("timeout_seconds")
        if timeout is not None and (not isinstance(timeout, int) or timeout <= 0):
            raise ValidationError(f"{path}: timeout_seconds must be positive integer")
        _check_plan_004_prerequisites(args.command, cwd, env)
        print(f"RUN: {args.command}: cwd={cwd_raw} argv={argv}", flush=True)
        completed = subprocess.run(argv, cwd=cwd, env=env, timeout=timeout, check=False)
        return int(completed.returncode)
    except subprocess.TimeoutExpired:
        print(f"ERROR: mapped command {args.command!r} timed out", file=sys.stderr)
        return 124
    except ValidationError as exc:
        return print_errors([str(exc)])


if __name__ == "__main__":
    raise SystemExit(main())
