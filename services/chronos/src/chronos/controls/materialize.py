"""Resolve Terminal Wrench task paths and fixture locations."""

from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_TASK_ID = "mongodb-sales-aggregation-engine"
DEFAULT_MODEL = "gemini-3.1-pro"
PINNED_REVISION = "d8a29613235a0ef56a8b70b3142626a533da28c2"


def repo_root() -> Path:
    return REPO_ROOT


def fixture_root(task_id: str = DEFAULT_TASK_ID) -> Path:
    return repo_root() / "fixtures" / "chronos" / task_id


def read_env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def terminal_wrench_root() -> Path:
    return Path(
        read_env("H2F2H_TERMINAL_WRENCH_PATH", ".external/terminal-wrench")
    ).resolve()


def task_id() -> str:
    return read_env("H2F2H_TERMINAL_WRENCH_TASK_ID", DEFAULT_TASK_ID)


def task_model() -> str:
    return read_env("H2F2H_TERMINAL_WRENCH_MODEL", DEFAULT_MODEL)


def original_task_dir() -> Path:
    return terminal_wrench_root() / "tasks" / task_id() / task_model() / "original_task"


def grader_path() -> Path:
    return original_task_dir() / "tests" / "test_outputs.py"


def verifier_harness_path() -> Path:
    return original_task_dir() / "tests" / "test.sh"


def dockerfile_path() -> Path:
    return original_task_dir() / "environment" / "Dockerfile"


def reference_solution_path() -> Path:
    return original_task_dir() / "solution" / "solve.sh"


def hud_env_path() -> Path:
    return repo_root() / "envs" / task_id() / "env.py"


def hud_grader_assets_dir() -> Path:
    return repo_root() / "envs" / task_id() / "task_assets"


def solution_path(path_label: str) -> Path:
    return fixture_root() / path_label / "query.py"
