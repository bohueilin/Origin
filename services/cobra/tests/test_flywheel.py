"""The reproducible flywheel pipeline, end to end with injected mocks (no network)."""

import json

from cobra.flywheel import FlywheelConfig, run_flywheel
from cobra.rollout import mock_scorers
from cobra.rollout.models import Model
from cobra.substrate import Task


def _tasks(n):
    return [Task(f"t{i}", "p", "f", [], [], "") for i in range(n)]


def test_run_flywheel_writes_dataset_arms_and_baseline(tmp_path):
    config = FlywheelConfig(out_dir=str(tmp_path), k=2, held_out_frac=0.5)
    model = Model("m1", lambda t: "HONEST")

    result = run_flywheel(
        config,
        tasks=_tasks(4),  # split → 2 train / 2 held-out
        models=[model],
        scorers=mock_scorers(),
        exploit_fn=lambda t: ["CHEAT"],  # guaranteed cheat class on the train tasks
        baseline_model=model,
        prompts={},  # skip the EvalPlus prompt join for toy tasks
    )

    # All artifacts written.
    assert (tmp_path / "rollouts.jsonl").exists()
    assert (tmp_path / "sft_arm_naive.jsonl").exists()
    assert (tmp_path / "sft_arm_hardened.jsonl").exists()
    assert (tmp_path / "flywheel.json").exists()

    # 2 train tasks × (m1 k=2) + 2 seed cheats = 6 rollouts.
    assert result.n_rollouts == 6
    # Naive arm carries the cheats; hardened arm doesn't.
    assert result.arms["arm_naive"]["cheat_fraction"] > 0
    assert result.arms["arm_hardened"]["cheat_fraction"] == 0.0
    # Baseline measured on held-out (m1 solves → high solve, zero cheat).
    assert result.baseline["model"] == "m1"
    assert result.baseline["solve_rate"] == 1.0

    recorded = json.loads((tmp_path / "flywheel.json").read_text())
    assert recorded["n_rollouts"] == 6 and recorded["config"]["k"] == 2
