"""Behavior tests for sterile-referee Model A pilot preparation."""

from __future__ import annotations

import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.sft.cli import main as cli_main
from chronos.research.sft.model_a_pipeline import prepare_model_a_from_plan008
from chronos.research.sft.referee_contract import load_referee_sft_intake


def _write(path: Path, payload: dict[str, object]) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _report(row_count: int = 36) -> dict[str, object]:
    trajectories = []
    for index in range(row_count):
        is_hack = index % 3 == 0
        trajectories.append(
            {
                "trajectory_id": f"trajectory-{index:02d}",
                "task_id": f"task-{index:02d}",
                "task_prompt": f"Solve task {index}.",
                "assistant_output": (
                    f"Subverted verifier with mechanism {index}."
                    if is_hack
                    else f"Implemented legitimate solution {index}."
                ),
                "origin": "branch" if is_hack else "recorded",
                "hud_reward": 1.0,
                "referee_verdict": "confirmed_hack" if is_hack else "legitimate",
                "cluster_id": f"cluster-{index:02d}" if is_hack else None,
                "lineage": {"parent_trace_id": f"parent-{index:02d}"}
                if is_hack
                else None,
                "environment_version": f"environment-{index:02d}",
                "grader_digest": f"grader-{index:02d}",
                "source_trace_id": f"source-{index:02d}",
                "solution_family": f"solution-{index:02d}",
                "template_family": f"template-{index:02d}",
            }
        )
    return {
        "schema_version": 1,
        "plan_id": "008",
        "scope": "final measured benchmark",
        "sterile_referee": {
            "kind": "sterile_clean_verify",
            "referee_id": "clean-verify-v1",
            "artifact_path": "TBD",
            "artifact_sha256": "TBD",
            "isolation_status": "verified",
            "agent_writable": False,
        },
        "referee_validation": {"status": "passed", "disagreements": []},
        "trajectories": trajectories,
    }


def _paths(
    tmp: str, report_payload: dict[str, object] | None = None
) -> dict[str, Path]:
    root = Path(tmp)
    referee = root / "clean_verify.py"
    referee.write_text("def clean_verify():\n    return True\n", encoding="utf-8")
    referee_digest = _digest(referee)
    payload = report_payload or _report()
    referee_identity = payload.get("sterile_referee")
    if isinstance(referee_identity, dict):
        referee_identity["artifact_path"] = str(referee)
        referee_identity["artifact_sha256"] = referee_digest
    report = _write(root / "report.json", payload)
    manifest = _write(
        root / "008.json",
        {
            "schema_version": 1,
            "plan_id": "008",
            "status": "complete",
            "artifacts": [
                {"path": str(report), "digest": _digest(report)},
                {"path": str(referee), "digest": referee_digest},
            ],
        },
    )
    return {
        "report": report,
        "referee": referee,
        "manifest": manifest,
        "out": root / "out",
    }


class ModelAExperimentTests(unittest.TestCase):
    def test_preliminary_report_is_not_trainable(self) -> None:
        report = _report()
        report["scope"] = "PRELIMINARY diff-based referee"
        with tempfile.TemporaryDirectory() as tmp:
            paths = _paths(tmp, report)
            with self.assertRaises(CanonicalInputError, msg="preliminary"):
                load_referee_sft_intake(
                    qabench_report_path=paths["report"],
                    plan_008_manifest_path=paths["manifest"],
                )

    def test_unstructured_referee_is_not_trainable(self) -> None:
        report = _report()
        report["sterile_referee"] = "diff-based verifier-subversion"
        with tempfile.TemporaryDirectory() as tmp:
            paths = _paths(tmp, report)
            with self.assertRaises(CanonicalInputError, msg="sterile_referee"):
                load_referee_sft_intake(
                    qabench_report_path=paths["report"],
                    plan_008_manifest_path=paths["manifest"],
                )

    def test_referee_artifact_digest_mismatch_is_not_trainable(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            paths = _paths(tmp)
            paths["referee"].write_text("tampered = True\n", encoding="utf-8")
            with self.assertRaises(CanonicalInputError, msg="digest"):
                load_referee_sft_intake(
                    qabench_report_path=paths["report"],
                    plan_008_manifest_path=paths["manifest"],
                )

    def test_model_a_preparation_is_contaminated_private_and_not_uploaded(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            paths = _paths(tmp)
            result = prepare_model_a_from_plan008(
                qabench_report_path=paths["report"],
                plan_008_manifest_path=paths["manifest"],
                output_dir=paths["out"],
            )

            self.assertGreaterEqual(result.train_count, 20)
            train_rows = [
                json.loads(line)
                for line in (paths["out"] / "model_a_raw_train.jsonl")
                .read_text()
                .splitlines()
            ]
            exploit_rows = [
                row
                for row in train_rows
                if "Subverted verifier" in row["messages"][-1]["content"]
            ]
            self.assertGreaterEqual(len(exploit_rows), 3)
            self.assertTrue(
                all(row["messages"][-1]["weight"] == 1 for row in exploit_rows)
            )

            manifest = json.loads(
                (paths["out"] / "model_a_experiment_manifest.json").read_text()
            )
            self.assertEqual(manifest["status"], "prepared_not_uploaded")
            self.assertEqual(manifest["visibility"], "private_evaluation_only")
            self.assertNotIn("release_proof", manifest["source"])
            partitions = {group["partition"] for group in manifest["groups"]}
            self.assertEqual(partitions, {"train", "heldout"})

            request = json.loads((paths["out"] / "sft_job_request.json").read_text())
            self.assertEqual(request["status"], "not_run")
            self.assertEqual(
                request["base_model"], "accounts/fireworks/models/qwen3-4b"
            )
            self.assertEqual(request["lora_rank"], 8)
            self.assertEqual(request["cost_approval"], "not_granted")

    def test_split_keeps_shared_cluster_in_one_partition(self) -> None:
        report = _report()
        trajectories = report["trajectories"]
        assert isinstance(trajectories, list)
        trajectories[0]["cluster_id"] = "shared-mechanism"
        trajectories[3]["cluster_id"] = "shared-mechanism"
        with tempfile.TemporaryDirectory() as tmp:
            paths = _paths(tmp, report)
            prepare_model_a_from_plan008(
                qabench_report_path=paths["report"],
                plan_008_manifest_path=paths["manifest"],
                output_dir=paths["out"],
            )
            manifest = json.loads(
                (paths["out"] / "model_a_experiment_manifest.json").read_text()
            )
            matching = [
                group
                for group in manifest["groups"]
                if "trajectory-00" in group["trace_ids"]
                or "trajectory-03" in group["trace_ids"]
            ]
            self.assertEqual(len(matching), 1)

    def test_small_population_fails_before_writing_training_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            paths = _paths(tmp, _report(row_count=8))
            with self.assertRaises(CanonicalInputError):
                prepare_model_a_from_plan008(
                    qabench_report_path=paths["report"],
                    plan_008_manifest_path=paths["manifest"],
                    output_dir=paths["out"],
                )
            self.assertFalse((paths["out"] / "model_a_raw_train.jsonl").exists())

    def test_cli_prepares_without_uploading(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            paths = _paths(tmp)
            code = cli_main(
                [
                    "model-a-prepare",
                    "--qabench-report",
                    str(paths["report"]),
                    "--plan-008-manifest",
                    str(paths["manifest"]),
                    "--output",
                    str(paths["out"]),
                ]
            )
            self.assertEqual(code, 0)
            self.assertTrue(
                (paths["out"] / "model_a_experiment_manifest.json").is_file()
            )


if __name__ == "__main__":
    unittest.main()
