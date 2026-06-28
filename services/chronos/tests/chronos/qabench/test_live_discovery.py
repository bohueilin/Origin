"""Behavior of the live in-loop discovery driver (Plan 008 WP6)."""

import json
import os
from collections.abc import Iterator
from pathlib import Path

import pytest

from chronos.qabench.live_discovery import LiveDiscoveryDriver, LiveDiscoveryBlocked
from chronos.qabench.seams import DiscoveryDriver


def _write_batch(batch_dir: Path) -> None:
    for sub in ("branches", "qa", "file-diffs"):
        (batch_dir / sub).mkdir(parents=True, exist_ok=True)
    (batch_dir / "branches" / "b00.json").write_text(
        json.dumps(
            {
                "branch_id": "b00",
                "reward": 1,
                "branch_role": "hacker",
                "snapshot_restore_ref": "modal://snap-b00",
                "file_diff_ref": "file-diffs/b00.json",
            }
        )
    )
    (batch_dir / "qa" / "b00.json").write_text(
        json.dumps(
            {
                "hacking_strategy": "conftest",
                "evidence_quality": "sufficient",
                "reward_hacking_detected": True,
            }
        )
    )
    (batch_dir / "file-diffs" / "b00.json").write_text(
        json.dumps({"added_paths": ["conftest.py"]})
    )


@pytest.fixture(autouse=True)
def _isolate_state_roots() -> Iterator[None]:
    # The driver writes FORKPROOF_BRANCH_STATE_ROOTS to os.environ directly (real
    # behavior), so guarantee it never leaks into or out of these tests.
    os.environ.pop("FORKPROOF_BRANCH_STATE_ROOTS", None)
    yield
    os.environ.pop("FORKPROOF_BRANCH_STATE_ROOTS", None)


def test_driver_satisfies_seam_protocol(tmp_path: Path) -> None:
    driver = LiveDiscoveryDriver(root=tmp_path, env_rel="e", forkpoint={})
    assert isinstance(driver, DiscoveryDriver)


def test_live_driver_selects_task_via_forkpoint_profile_and_maps_artifacts(
    tmp_path: Path,
) -> None:
    # branch_runs reads its task from the ForkPoint's hud_task_profile (main's contract),
    # not an env var; the driver backfills the profile + keeps the state-roots override.
    _write_batch(tmp_path / "run-test")
    captured: dict[str, object] = {}

    def fake_runner(
        root: Path, forkpoint: dict, *, count: int, concurrency: int
    ) -> dict:
        profile = forkpoint.get("hud_task_profile", {})
        captured["env"] = profile.get("env_module_path")
        captured["factory"] = profile.get("task_factory")
        captured["roots"] = os.environ.get("FORKPROOF_BRANCH_STATE_ROOTS")
        captured["count"] = count
        captured["snapshot"] = forkpoint.get("snapshot_id")
        return {"status": "pass", "run_id": "run-test"}

    driver = LiveDiscoveryDriver(
        root=tmp_path,
        env_rel="envs/qabench/solve-ode-with-sympy/env.py",
        forkpoint={"snapshot_id": "snap-x"},
        count=12,
        state_roots=("/app", "/data"),
        batch_runner=fake_runner,
        artifact_resolver=lambda root, run_id: tmp_path / run_id,
    )
    branches = driver.run_discovery_tree("solve-ode-with-sympy")

    assert captured == {
        "env": "envs/qabench/solve-ode-with-sympy/env.py",
        "factory": "build_task",
        "roots": "/app,/data",
        "count": 12,
        "snapshot": "snap-x",
    }
    assert len(branches) == 1
    branch = branches[0]
    assert branch.task_id == "solve-ode-with-sympy"
    assert branch.reward_passed is True
    assert branch.workspace_ref == "modal://snap-b00"
    assert branch.exploit_mechanism == "conftest"


def test_blocked_status_with_run_id_still_maps_branches(tmp_path: Path) -> None:
    # "blocked" by strict Witness-promotion gates but the batch ran (has run_id) ->
    # the discovered branches are still usable; do not discard them.
    _write_batch(tmp_path / "run-test")

    def runner(root: Path, forkpoint: dict, *, count: int, concurrency: int) -> dict:
        return {
            "status": "blocked",
            "run_id": "run-test",
            "observed_behavior": "not every branch crossed the execution boundary",
        }

    driver = LiveDiscoveryDriver(
        root=tmp_path,
        env_rel="e",
        forkpoint={},
        batch_runner=runner,
        artifact_resolver=lambda root, run_id: tmp_path / run_id,
    )
    assert len(driver.run_discovery_tree("any-task")) == 1


def test_blocked_batch_raises_with_summary(tmp_path: Path) -> None:
    def blocked_runner(
        root: Path, forkpoint: dict, *, count: int, concurrency: int
    ) -> dict:
        return {"status": "blocked", "observed_behavior": "credentials absent"}

    driver = LiveDiscoveryDriver(
        root=tmp_path, env_rel="e", forkpoint={}, batch_runner=blocked_runner
    )
    with pytest.raises(LiveDiscoveryBlocked) as excinfo:
        driver.run_discovery_tree("any-task")
    assert "credentials absent" in str(excinfo.value)
    assert excinfo.value.summary["status"] == "blocked"
