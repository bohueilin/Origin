"""Tests for mapped command prerequisite checks."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / "docs" / "plans" / "scripts"
sys.path.insert(0, str(SCRIPTS))

from common import ValidationError  # noqa: E402
from run_mapped import _check_plan_004_prerequisites  # noqa: E402


def test_plan_004_prerequisite_error_names_bootstrap_remedy(tmp_path: Path) -> None:
    with pytest.raises(ValidationError) as excinfo:
        _check_plan_004_prerequisites("plan-004-tests", tmp_path, {})

    message = str(excinfo.value)
    assert ".external/terminal-wrench" in message
    assert "tests/test_outputs.py" in message
    assert "scripts/bootstrap_external_deps.sh" in message
    assert "H2F2H_TERMINAL_WRENCH_PATH" in message
    assert "must not be committed" in message


def test_plan_004_prerequisite_accepts_custom_terminal_wrench_path(
    tmp_path: Path,
) -> None:
    original_task = (
        tmp_path
        / "terminal-wrench"
        / "tasks"
        / "mongodb-sales-aggregation-engine"
        / "gemini-3.1-pro"
        / "original_task"
    )
    for relative in (
        "tests/test_outputs.py",
        "tests/test.sh",
        "environment/Dockerfile",
    ):
        path = original_task / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("placeholder\n", encoding="utf-8")

    _check_plan_004_prerequisites(
        "integration-controls",
        tmp_path,
        {"H2F2H_TERMINAL_WRENCH_PATH": str(tmp_path / "terminal-wrench")},
    )


def test_non_plan_004_command_skips_external_prerequisites(tmp_path: Path) -> None:
    _check_plan_004_prerequisites("lint", tmp_path, {})
