"""Tests for SFT export and pipeline (Phase 3)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from chronos.research.sft import DEFAULT_MOCK_FIXTURE, load_traces
from chronos.research.sft.cli import main as cli_main
from chronos.research.sft.export import (
    DEFAULT_SYSTEM_PROMPT,
    export_metadata,
    export_rejected_hacks_audit,
    export_sft_jsonl,
    trace_to_fireworks_example,
    validate_fireworks_example,
)
from chronos.research.sft.filter import filter_traces
from chronos.research.sft.pipeline import run_sft_pipeline
from chronos.research.sft.training_recommendations import build_training_recommendations
from mock_expectations import MOCK_METRICS

REPO_ROOT = Path(__file__).resolve().parents[4]
MOCK_FIXTURE = REPO_ROOT / DEFAULT_MOCK_FIXTURE


class ExportTests(unittest.TestCase):
    def setUp(self) -> None:
        self.traces = load_traces(MOCK_FIXTURE)
        self.filtered = filter_traces(self.traces)

    def test_fireworks_example_shape(self) -> None:
        example = trace_to_fireworks_example(self.traces[0])
        validate_fireworks_example(example)
        roles = [message["role"] for message in example["messages"]]  # type: ignore[index]
        self.assertEqual(roles, ["system", "user", "assistant"])
        assistant = example["messages"][-1]  # type: ignore[index]
        self.assertEqual(assistant["weight"], 1)

    def test_export_sft_jsonl_uses_shared_system_prompt(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "raw.jsonl"
            count = export_sft_jsonl(
                self.filtered.raw_sft, path, source_filter="raw_sft"
            )
            self.assertEqual(count, MOCK_METRICS["raw_reward_one_admitted"])

            lines = path.read_text(encoding="utf-8").strip().splitlines()
            prompts = {json.loads(line)["messages"][0]["content"] for line in lines}
            self.assertEqual(prompts, {DEFAULT_SYSTEM_PROMPT})

    def test_hardened_export_meets_fireworks_minimum(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hardened.jsonl"
            count = export_sft_jsonl(
                self.filtered.hardened_sft,
                path,
                source_filter="hardened_sft",
            )
            self.assertGreaterEqual(count, 3)
            self.assertEqual(count, MOCK_METRICS["hardened_reward_one_admitted"])

    def test_metadata_sidecar_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "metadata.jsonl"
            export_metadata(
                self.filtered.hardened_sft, path, source_filter="hardened_sft"
            )
            row = json.loads(path.read_text(encoding="utf-8").strip().splitlines()[0])
            self.assertEqual(row["source_filter"], "hardened_sft")
            self.assertIn("trace_id", row)
            self.assertIn("raw_reward", row)
            self.assertIn("patched_reward", row)
            self.assertIn("is_hack", row)
            self.assertIn("is_legit", row)

    def test_rejected_hacks_audit_is_not_positive_sft(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "rejected.jsonl"
            count = export_rejected_hacks_audit(self.filtered.rejected_hacks, path)
            self.assertEqual(count, MOCK_METRICS["rejected_hack_records"])
            row = json.loads(path.read_text(encoding="utf-8").strip().splitlines()[0])
            self.assertEqual(row["weight"], 0)
            self.assertNotIn("messages", row)

    def test_raw_export_includes_stress_only_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "raw.jsonl"
            export_sft_jsonl(self.filtered.raw_sft, path, source_filter="raw_sft")
            assistants = [
                json.loads(line)["messages"][-1]["content"].lower()
                for line in path.read_text(encoding="utf-8").strip().splitlines()
            ]
            joined = "\n".join(assistants)
            self.assertIn("patched verifier still returns reward 1", joined)
            self.assertIn("classification pending qa review", joined)

    def test_raw_export_gives_confirmed_hacks_zero_training_weight(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "raw.jsonl"
            export_sft_jsonl(self.filtered.raw_sft, path, source_filter="raw_sft")
            rows = [
                json.loads(line)
                for line in path.read_text(encoding="utf-8").strip().splitlines()
            ]
            hack_rows = [
                row for row in rows if "pytest plugin" in row["messages"][-1]["content"]
            ]
            self.assertTrue(hack_rows)
            self.assertTrue(
                all(row["messages"][-1]["weight"] == 0 for row in hack_rows)
            )

    def test_model_a_export_trains_on_confirmed_hacks_explicitly(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "model-a.jsonl"
            export_sft_jsonl(
                self.filtered.raw_sft,
                path,
                source_filter="raw_sft",
                assistant_weight_policy="model_a_contaminated",
            )
            rows = [json.loads(line) for line in path.read_text().splitlines()]
            hack_rows = [
                row for row in rows if "pytest plugin" in row["messages"][-1]["content"]
            ]
            self.assertTrue(hack_rows)
            self.assertTrue(
                all(row["messages"][-1]["weight"] == 1 for row in hack_rows)
            )

    def test_hardened_export_excludes_known_hacks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "hardened.jsonl"
            export_sft_jsonl(
                self.filtered.hardened_sft, path, source_filter="hardened_sft"
            )
            assistants = [
                json.loads(line)["messages"][-1]["content"].lower()
                for line in path.read_text(encoding="utf-8").strip().splitlines()
            ]
            joined = "\n".join(assistants)
            self.assertNotIn("setuptools pytest plugin", joined)
            self.assertNotIn("conftest.py hooks", joined)
            self.assertIn("logparser.parse", joined)


class PipelineTests(unittest.TestCase):
    def test_run_sft_pipeline_writes_all_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            result = run_sft_pipeline(MOCK_FIXTURE, out)

            expected_files = [
                "contamination_table.md",
                "exploit_clusters.json",
                "contamination_chart.svg",
                "WRITEUP.md",
                "metrics.json",
                "raw_verifier_sft.jsonl",
                "hardened_verifier_sft.jsonl",
                "raw_verifier_sft.metadata.jsonl",
                "hardened_verifier_sft.metadata.jsonl",
                "rejected_hacks_audit.jsonl",
                "training_recommendations.json",
                "run_manifest.json",
            ]
            for name in expected_files:
                self.assertTrue((out / name).is_file(), msg=name)

            self.assertEqual(
                result.raw_sft_examples, MOCK_METRICS["raw_reward_one_admitted"]
            )
            self.assertEqual(
                result.hardened_sft_examples,
                MOCK_METRICS["hardened_reward_one_admitted"],
            )
            self.assertEqual(
                result.rejected_hack_records, MOCK_METRICS["rejected_hack_records"]
            )

            manifest = json.loads(
                (out / "run_manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                manifest["export_counts"]["hardened_sft_examples"],
                MOCK_METRICS["hardened_reward_one_admitted"],
            )
            self.assertIn("training_recommendations", manifest["artifacts"])

            recommendations = json.loads(
                (out / "training_recommendations.json").read_text(encoding="utf-8")
            )
            self.assertEqual(
                recommendations["hardened_example_count"],
                MOCK_METRICS["hardened_reward_one_admitted"],
            )
            self.assertEqual(recommendations["sft"]["lora_target"], "all_layers")
            self.assertEqual(
                recommendations["sft"]["learning_rate_multiplier_vs_full_ft"], 10
            )

    def test_training_recommendations_scale_with_example_count(self) -> None:
        small = build_training_recommendations(hardened_example_count=4)
        self.assertEqual(small["sft"]["lora_rank"], 16)
        self.assertEqual(small["sft"]["batch_size_max"], 4)
        self.assertEqual(small["rft"]["lora_rank"], 16)

        large = build_training_recommendations(hardened_example_count=150)
        self.assertEqual(large["sft"]["lora_rank"], 64)
        self.assertEqual(large["sft"]["batch_size_max"], 4)

    def test_cli_runs_successfully(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            code = cli_main(["--input", str(MOCK_FIXTURE), "--output", str(out)])
            self.assertEqual(code, 0)
            self.assertTrue((out / "hardened_verifier_sft.jsonl").is_file())


if __name__ == "__main__":
    unittest.main()
