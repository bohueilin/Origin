"""Tests for SFT trace filtering (Phase 1)."""

from __future__ import annotations

import unittest
from pathlib import Path

from chronos.research.sft import DEFAULT_MOCK_FIXTURE, filter_traces, load_traces
from chronos.research.sft.filter import (
    FilterResult,
    is_excluded,
    is_hardened_sft,
    is_raw_sft,
    is_rejected_hack,
)
from chronos.research.sft.validation import parse_trace_record
from mock_expectations import (
    MOCK_BUCKETS,
    MOCK_METRICS,
    MOCK_NEEDS_REVIEW,
    MOCK_WARNINGS,
)

REPO_ROOT = Path(__file__).resolve().parents[4]
MOCK_FIXTURE = REPO_ROOT / DEFAULT_MOCK_FIXTURE


def _trace(**overrides: object):
    row = {
        "trace_id": "trace-filter-test",
        "task_id": "mongodb-sales-aggregation-engine",
        "task_prompt": "Implement SalesAnalyzer.",
        "assistant_output": "Done.",
        "raw_reward": 1.0,
        "patched_reward": 1.0,
        "is_hack": False,
        "is_legit": True,
    }
    row.update(overrides)
    return parse_trace_record(row, line_number=1, source="mock")


class FilterRuleTests(unittest.TestCase):
    def test_legitimate_solution_in_raw_and_hardened(self) -> None:
        trace = _trace(trace_id="legit")
        self.assertTrue(is_raw_sft(trace))
        self.assertTrue(is_hardened_sft(trace))
        self.assertFalse(is_rejected_hack(trace))
        self.assertFalse(is_excluded(trace))

    def test_hack_in_raw_and_rejected(self) -> None:
        trace = _trace(
            trace_id="hack",
            patched_reward=0.0,
            is_hack=True,
            is_legit=False,
        )
        self.assertTrue(is_raw_sft(trace))
        self.assertFalse(is_hardened_sft(trace))
        self.assertTrue(is_rejected_hack(trace))
        self.assertFalse(is_excluded(trace))

    def test_failure_is_excluded(self) -> None:
        trace = _trace(
            trace_id="fail", raw_reward=0.0, patched_reward=0.0, is_legit=False
        )
        self.assertFalse(is_raw_sft(trace))
        self.assertFalse(is_hardened_sft(trace))
        self.assertFalse(is_rejected_hack(trace))
        self.assertTrue(is_excluded(trace))

    def test_hack_still_rewarded_goes_to_raw_only(self) -> None:
        trace = _trace(trace_id="broken-verifier", is_hack=True, is_legit=False)
        self.assertTrue(is_raw_sft(trace))
        self.assertFalse(is_hardened_sft(trace))
        self.assertFalse(is_rejected_hack(trace))
        self.assertFalse(is_excluded(trace))
        self.assertTrue(trace.needs_review)

    def test_ambiguous_raw_one_stays_in_raw_only_with_warning(self) -> None:
        trace = _trace(
            trace_id="ambiguous",
            patched_reward=0.0,
            is_hack=False,
            is_legit=False,
        )
        self.assertTrue(is_raw_sft(trace))
        self.assertFalse(is_hardened_sft(trace))
        self.assertFalse(is_rejected_hack(trace))
        self.assertFalse(is_excluded(trace))

        result = filter_traces([trace])
        self.assertEqual(len(result.raw_sft), 1)
        self.assertEqual(len(result.excluded), 0)
        self.assertTrue(any("ambiguous" in warning for warning in result.warnings))


class FilterTracesTests(unittest.TestCase):
    def setUp(self) -> None:
        self.traces = load_traces(MOCK_FIXTURE)
        self.result = filter_traces(self.traces)
        self.by_id = {trace.trace_id: trace for trace in self.traces}

    def test_mock_fixture_bucket_counts(self) -> None:
        self.assertEqual(
            len(self.result.raw_sft), MOCK_METRICS["raw_reward_one_admitted"]
        )
        self.assertEqual(
            len(self.result.hardened_sft), MOCK_METRICS["hardened_reward_one_admitted"]
        )
        self.assertEqual(
            len(self.result.rejected_hacks), MOCK_METRICS["rejected_hack_records"]
        )
        self.assertEqual(len(self.result.excluded), len(MOCK_BUCKETS["excluded"]))

    def test_mock_fixture_bucket_membership(self) -> None:
        self.assertEqual(
            {t.trace_id for t in self.result.raw_sft}, MOCK_BUCKETS["raw_sft"]
        )
        self.assertEqual(
            {t.trace_id for t in self.result.hardened_sft}, MOCK_BUCKETS["hardened_sft"]
        )
        self.assertEqual(
            {t.trace_id for t in self.result.rejected_hacks},
            MOCK_BUCKETS["rejected_hacks"],
        )
        self.assertEqual(
            {t.trace_id for t in self.result.excluded}, MOCK_BUCKETS["excluded"]
        )

    def test_no_overlap_between_hardened_and_rejected(self) -> None:
        hardened_ids = {trace.trace_id for trace in self.result.hardened_sft}
        rejected_ids = {trace.trace_id for trace in self.result.rejected_hacks}
        self.assertEqual(hardened_ids & rejected_ids, set())

    def test_every_trace_accounted_for(self) -> None:
        self.assertEqual(len(self.result.all_bucketed), len(self.traces))

    def test_needs_review_rows_emit_warnings(self) -> None:
        broken = _trace(trace_id="broken-verifier", is_hack=True, is_legit=False)
        result = filter_traces([broken])
        self.assertTrue(any("needs_review" in warning for warning in result.warnings))

    def test_stress_rows_flag_needs_review(self) -> None:
        for trace_id in MOCK_NEEDS_REVIEW:
            self.assertTrue(self.by_id[trace_id].needs_review, msg=trace_id)

    def test_stress_rows_emit_fixture_warnings(self) -> None:
        warning_text = "\n".join(self.result.warnings)
        for trace_id in MOCK_WARNINGS:
            self.assertIn(trace_id, warning_text)

    def test_hack_still_rewarded_after_patch_is_raw_only(self) -> None:
        trace_id = "mock-010"
        self.assertIn(trace_id, {t.trace_id for t in self.result.raw_sft})
        self.assertNotIn(trace_id, {t.trace_id for t in self.result.hardened_sft})
        self.assertNotIn(trace_id, {t.trace_id for t in self.result.rejected_hacks})

    def test_second_task_legit_is_hardened(self) -> None:
        trace = self.by_id["mock-013"]
        self.assertEqual(trace.task_id, "log-parser-anomaly-detector")
        self.assertIn(trace.trace_id, {t.trace_id for t in self.result.hardened_sft})

    def test_filter_result_is_immutable_tuple_buckets(self) -> None:
        self.assertIsInstance(self.result, FilterResult)
        self.assertIsInstance(self.result.raw_sft, tuple)


if __name__ == "__main__":
    unittest.main()
