"""Manifest-backed public build-asset policy integration checks."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from chronos.qabench.materialize import (
    load_build_asset_policies,
    load_manifest,
    materialize,
)


def _write_task_source(tasks: Path, task_id: str, *, local_input: bool) -> None:
    original = tasks / task_id / "claude-opus-4.6" / "original_task"
    context = original / "environment"
    tests = original / "tests"
    context.mkdir(parents=True)
    tests.mkdir()
    dockerfile = "FROM ubuntu:24.04\n"
    if local_input:
        dockerfile += "COPY files/generate_audio.py /tmp/generate_audio.py\n"
        generator = context / "files" / "generate_audio.py"
        generator.parent.mkdir()
        generator.write_text("print('fixture waveform')\n", encoding="utf-8")
    (context / "Dockerfile").write_text(dockerfile, encoding="utf-8")
    (tests / "test_outputs.py").write_text("def test_fixture(): pass\n", encoding="utf-8")


def _write_manifest(
    path: Path, *, include_synth_policy: bool
) -> None:
    public_build_assets: dict[str, list[str]] = {"plain-task": []}
    if include_synth_policy:
        public_build_assets["synthesize-harmonic-wav-in-c"] = [
            "files/generate_audio.py"
        ]
    path.write_text(
        json.dumps(
            {
                "terminal_wrench_revision": "fixture-revision",
                "public_build_assets": public_build_assets,
                "tasks": ["plain-task", "synthesize-harmonic-wav-in-c"],
            }
        ),
        encoding="utf-8",
    )


def _materialize_manifest(manifest: Path, tasks: Path, destination: Path):
    task_ids, revision = load_manifest(manifest)
    return materialize(
        tasks,
        task_ids,
        destination,
        revision=revision,
        with_hud=False,
        build_asset_policies=load_build_asset_policies(manifest),
    )


def test_manifest_policy_plans_every_declared_task_with_local_input(
    tmp_path: Path,
) -> None:
    tasks = tmp_path / "tasks"
    _write_task_source(tasks, "plain-task", local_input=False)
    _write_task_source(tasks, "synthesize-harmonic-wav-in-c", local_input=True)
    manifest = tmp_path / "tasks.json"
    _write_manifest(manifest, include_synth_policy=True)

    results = _materialize_manifest(manifest, tasks, tmp_path / "output")

    assert [result.task_id for result in results] == [
        "plain-task",
        "synthesize-harmonic-wav-in-c",
    ]
    assert all(result.deployable for result in results)
    assert (
        tmp_path / "output" / "synthesize-harmonic-wav-in-c" / "files" / "generate_audio.py"
    ).read_text(encoding="utf-8") == "print('fixture waveform')\n"


def test_manifest_without_policy_rejects_declared_local_input_before_publish(
    tmp_path: Path,
) -> None:
    tasks = tmp_path / "tasks"
    _write_task_source(tasks, "plain-task", local_input=False)
    _write_task_source(tasks, "synthesize-harmonic-wav-in-c", local_input=True)
    manifest = tmp_path / "tasks.json"
    _write_manifest(manifest, include_synth_policy=False)
    destination = tmp_path / "output"

    with pytest.raises(ValueError, match="reviewed public build-asset policy"):
        _materialize_manifest(manifest, tasks, destination)

    assert not destination.exists()
