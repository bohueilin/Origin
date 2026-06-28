"""Tests for SFT metrics and reporting (Phase 2)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from chronos.research.sft import DEFAULT_MOCK_FIXTURE, load_traces
from chronos.research.sft.filter import filter_traces
from chronos.research.sft.metrics import (
    MetricsSummary,
    compute_metrics,
    render_contamination_table,
    render_exploit_cluster_breakdown,
)
from chronos.research.sft.report import (
    render_contamination_chart_svg,
    write_phase2_report,
)
from mock_expectations import MOCK_EXPLOIT_CLUSTERS, MOCK_METRICS

REPO_ROOT = Path(__file__).resolve().parents[4]
MOCK_FIXTURE = REPO_ROOT / DEFAULT_MOCK_FIXTURE


class ComputeMetricsTests(unittest.TestCase):
    def setUp(self) -> None:
        self.traces = load_traces(MOCK_FIXTURE)
        self.filtered = filter_traces(self.traces)
        self.metrics = compute_metrics(self.traces, self.filtered)

    def test_mock_reward_one_counts(self) -> None:
        self.assertEqual(
            self.metrics.raw_reward_one_admitted,
            MOCK_METRICS["raw_reward_one_admitted"],
        )
        self.assertEqual(
            self.metrics.hardened_reward_one_admitted,
            MOCK_METRICS["hardened_reward_one_admitted"],
        )

    def test_mock_legitimate_counts(self) -> None:
        self.assertEqual(
            self.metrics.raw_legitimate_admitted,
            MOCK_METRICS["raw_legitimate_admitted"],
        )
        self.assertEqual(
            self.metrics.hardened_legitimate_admitted,
            MOCK_METRICS["hardened_legitimate_admitted"],
        )

    def test_mock_hack_counts(self) -> None:
        self.assertEqual(
            self.metrics.raw_hacks_admitted, MOCK_METRICS["raw_hacks_admitted"]
        )
        self.assertEqual(
            self.metrics.hardened_hacks_admitted,
            MOCK_METRICS["hardened_hacks_admitted"],
        )

    def test_mock_contamination_rates(self) -> None:
        self.assertAlmostEqual(
            self.metrics.raw_contamination_rate,
            MOCK_METRICS["raw_contamination_rate"],
        )
        self.assertAlmostEqual(
            self.metrics.hardened_contamination_rate,
            MOCK_METRICS["hardened_contamination_rate"],
        )

    def test_mock_legitimate_retention(self) -> None:
        self.assertEqual(
            self.metrics.legitimate_retention_rate,
            MOCK_METRICS["legitimate_retention_rate"],
        )
        self.assertEqual(
            self.metrics.total_legitimate, MOCK_METRICS["total_legitimate"]
        )


class RenderTests(unittest.TestCase):
    def setUp(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        filtered = filter_traces(traces)
        self.metrics = compute_metrics(traces, filtered)
        self.clusters = render_exploit_cluster_breakdown(filtered.rejected_hacks)

    def test_contamination_table_contains_expected_values(self) -> None:
        table = render_contamination_table(
            self.metrics,
            source="mock_chronos_traces.jsonl",
        )
        self.assertIn(
            f"| Reward-1 traces admitted | {MOCK_METRICS['raw_reward_one_admitted']} | "
            f"{MOCK_METRICS['hardened_reward_one_admitted']} |",
            table,
        )
        self.assertIn(
            f"| Hacked traces admitted | {MOCK_METRICS['raw_hacks_admitted']} | "
            f"{MOCK_METRICS['hardened_hacks_admitted']} |",
            table,
        )
        self.assertIn("58.3%", table)
        self.assertIn("25.0%", table)
        self.assertIn("80.0%", table)

    def test_exploit_cluster_breakdown_lists_five_mechanisms(self) -> None:
        self.assertEqual(len(self.clusters), MOCK_METRICS["exploit_cluster_count"])
        self.assertEqual(self.clusters, MOCK_EXPLOIT_CLUSTERS)

    def test_chart_svg_renders_hack_counts(self) -> None:
        svg = render_contamination_chart_svg(self.metrics)
        self.assertIn("Raw Verifier", svg)
        self.assertIn("Hardened Verifier", svg)
        self.assertIn(f">{MOCK_METRICS['raw_hacks_admitted']}<", svg)
        self.assertIn(f">{MOCK_METRICS['hardened_hacks_admitted']}<", svg)


class WriteReportTests(unittest.TestCase):
    def test_write_phase2_report_creates_artifacts(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        filtered = filter_traces(traces)

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp)
            metrics = write_phase2_report(
                out,
                traces,
                filtered,
                source_label="mock_chronos_traces.jsonl",
            )

            self.assertIsInstance(metrics, MetricsSummary)
            self.assertTrue((out / "contamination_table.md").is_file())
            self.assertTrue((out / "exploit_clusters.json").is_file())
            self.assertTrue((out / "contamination_chart.svg").is_file())
            self.assertTrue((out / "WRITEUP.md").is_file())
            self.assertTrue((out / "metrics.json").is_file())

            clusters = json.loads(
                (out / "exploit_clusters.json").read_text(encoding="utf-8")
            )
            self.assertEqual(len(clusters), MOCK_METRICS["exploit_cluster_count"])


if __name__ == "__main__":
    unittest.main()
