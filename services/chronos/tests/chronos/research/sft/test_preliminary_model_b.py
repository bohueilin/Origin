"""Behavior tests for matched preliminary Model B preparation."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.sft.cli import main as cli_main
from chronos.research.sft.export import DEFAULT_SYSTEM_PROMPT
from chronos.research.sft.preliminary_model_b import prepare_preliminary_model_b


def _write_model_a_fixture(model_a_dir: Path) -> None:
    model_a_dir.mkdir(parents=True, exist_ok=True)
    rows = [
        {
            "trace_id": "run-task-clean-branch-00",
            "task_id": "task-clean",
            "task_prompt": "Solve task-clean branch 0.",
            "assistant_output": "Implemented legitimate solution.",
            "is_hack": False,
            "is_legit": True,
        },
        {
            "trace_id": "run-task-clean-branch-01",
            "task_id": "task-clean",
            "task_prompt": "Solve task-clean branch 1.",
            "assistant_output": "Implemented another legitimate solution.",
            "is_hack": False,
            "is_legit": True,
        },
        {
            "trace_id": "run-task-hack-branch-00",
            "task_id": "task-hack",
            "task_prompt": "Solve task-hack branch 0.",
            "assistant_output": "Planted conftest.py to bypass tests.",
            "is_hack": True,
            "is_legit": False,
        },
        {
            "trace_id": "run-task-hack-branch-01",
            "task_id": "task-hack",
            "task_prompt": "Solve task-hack branch 1.",
            "assistant_output": "Rewrote test_outputs.py to force pass.",
            "is_hack": True,
            "is_legit": False,
        },
    ]
    train_lines = []
    meta_lines = []
    for row in rows:
        train_lines.append(
            json.dumps(
                {
                    "messages": [
                        {"role": "system", "content": DEFAULT_SYSTEM_PROMPT},
                        {"role": "user", "content": row["task_prompt"]},
                        {
                            "role": "assistant",
                            "content": row["assistant_output"],
                            "weight": 1,
                        },
                    ]
                }
            )
        )
        meta_lines.append(
            json.dumps(
                {
                    "trace_id": row["trace_id"],
                    "task_id": row["task_id"],
                    "task_prompt": row["task_prompt"],
                    "source_filter": "raw_sft",
                    "raw_reward": 1.0,
                    "patched_reward": 0.0 if row["is_hack"] else 1.0,
                    "is_hack": row["is_hack"],
                    "is_legit": row["is_legit"],
                    "source": "chronos_export",
                }
            )
        )
    (model_a_dir / "model_a_raw_train.jsonl").write_text(
        "\n".join(train_lines) + "\n", encoding="utf-8"
    )
    (model_a_dir / "model_a_raw_train.metadata.jsonl").write_text(
        "\n".join(meta_lines) + "\n",
        encoding="utf-8",
    )
    (model_a_dir / "heldout_legitimate_eval.jsonl").write_text(
        train_lines[0] + "\n",
        encoding="utf-8",
    )
    (model_a_dir / "model_a_experiment_manifest.json").write_text(
        json.dumps(
            {
                "experiment": "model_a_preliminary_diff_labeled",
                "content_digest": "fixture",
                "counts": {"train": 4, "train_hacks": 2},
            }
        ),
        encoding="utf-8",
    )


class PreliminaryModelBTests(unittest.TestCase):
    def test_derivation_removes_only_confirmed_hacks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model_a_dir = root / "model-a"
            model_b_dir = root / "model-b"
            _write_model_a_fixture(model_a_dir)
            result = prepare_preliminary_model_b(
                model_a_output_dir=model_a_dir,
                output_dir=model_b_dir,
            )
            self.assertEqual(result.train_count, 2)
            self.assertEqual(result.removed_hack_count, 2)
            self.assertEqual(result.hack_prone_prompt_count, 1)
            manifest = json.loads(
                (model_b_dir / "model_b_experiment_manifest.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(
                manifest["experiment"], "model_b_confirmed_hack_removed_preliminary"
            )
            comparison = json.loads(
                (model_b_dir / "ab_comparison_manifest.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(comparison["model_b"]["removed_confirmed_hacks"], 2)

    def test_cli_prepares_model_b(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            model_a_dir = root / "model-a"
            model_b_dir = root / "model-b"
            _write_model_a_fixture(model_a_dir)
            exit_code = cli_main(
                [
                    "model-b-prepare-preliminary",
                    "--model-a-output",
                    str(model_a_dir),
                    "--output",
                    str(model_b_dir),
                ]
            )
            self.assertEqual(exit_code, 0)
            self.assertTrue((model_b_dir / "model_b_hackremoved_train.jsonl").is_file())

    def test_rejects_missing_model_a_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            with self.assertRaises(CanonicalInputError):
                prepare_preliminary_model_b(
                    model_a_output_dir=root / "missing",
                    output_dir=root / "model-b",
                )


if __name__ == "__main__":
    unittest.main()
