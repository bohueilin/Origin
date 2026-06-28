"""Immutability checks for sealed control records."""

import json

import pytest

from chronos.controls.freeze import (
    controls_manifest_path,
    seal_phase1,
    verify_sealed_digests,
)
from chronos.controls.grade_local import grade_all_controls
from chronos.controls.task_identity import verify_task_identity


@pytest.fixture(scope="module", autouse=True)
def _prepare_phase1_manifest() -> None:
    verify_task_identity()
    grade_all_controls()
    seal_phase1()


def test_sealed_digests_match_solution_files() -> None:
    verify_sealed_digests()


def test_phase1_fields_are_present() -> None:
    manifest = json.loads(controls_manifest_path().read_text(encoding="utf-8"))
    assert manifest["phase"] == 1
    assert len(manifest["controls"]) == 3
    for control in manifest["controls"]:
        assert control["content_digest"]
        assert control["grader_digest"]
        assert control["solution_path_label"] in {"path-a", "path-b", "path-c"}
