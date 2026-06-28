"""Tests for SFT trace loading (Phase 0)."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from chronos.research.sft import (
    DEFAULT_MOCK_FIXTURE,
    TraceRecord,
    TraceValidationError,
    load_traces,
)
from chronos.research.sft.validation import compute_needs_review, parse_trace_record
from mock_expectations import MOCK_METRICS, MOCK_TRACE_COUNT

REPO_ROOT = Path(__file__).resolve().parents[4]
MOCK_FIXTURE = REPO_ROOT / DEFAULT_MOCK_FIXTURE


def _valid_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "trace_id": "trace-test-001",
        "task_id": "mongodb-sales-aggregation-engine",
        "task_prompt": "Implement SalesAnalyzer.",
        "assistant_output": "Implemented SalesAnalyzer with real pipelines.",
        "raw_reward": 1.0,
        "patched_reward": 1.0,
        "is_hack": False,
        "is_legit": True,
    }
    row.update(overrides)
    return row


class LoadTracesTests(unittest.TestCase):
    def test_load_mock_fixture_returns_expected_record_count(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        self.assertEqual(len(traces), MOCK_TRACE_COUNT)

    def test_mock_fixture_marks_source_mock(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        self.assertTrue(all(trace.source == "mock" for trace in traces))

    def test_mock_fixture_field_types(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        first = traces[0]
        self.assertIsInstance(first, TraceRecord)
        self.assertIsInstance(first.trace_id, str)
        self.assertIsInstance(first.raw_reward, float)
        self.assertIsInstance(first.patched_reward, float)
        self.assertIsInstance(first.is_hack, bool)
        self.assertIsInstance(first.is_legit, bool)
        self.assertIsInstance(first.needs_review, bool)

    def test_mock_fixture_reward_one_rows(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        raw_positive = [trace for trace in traces if trace.raw_reward == 1.0]
        self.assertEqual(len(raw_positive), MOCK_METRICS["raw_reward_one_admitted"])

    def test_mock_fixture_legitimate_rows(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        legit = [trace for trace in traces if trace.is_legit]
        self.assertEqual(len(legit), MOCK_METRICS["total_legitimate"])
        hardened_legit = [trace for trace in legit if trace.patched_reward == 1.0]
        self.assertEqual(
            len(hardened_legit), MOCK_METRICS["hardened_legitimate_admitted"]
        )

    def test_mock_fixture_hack_rows_have_clusters(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        hacks = [trace for trace in traces if trace.is_hack]
        self.assertEqual(len(hacks), MOCK_METRICS["raw_hacks_admitted"])
        self.assertTrue(all(trace.exploit_cluster for trace in hacks))

    def test_fixture_includes_second_task_id(self) -> None:
        traces = load_traces(MOCK_FIXTURE)
        task_ids = {trace.task_id for trace in traces}
        self.assertIn("log-parser-anomaly-detector", task_ids)

    def test_rejects_missing_required_field(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.jsonl"
            row = _valid_row()
            del row["task_prompt"]
            path.write_text(json.dumps(row) + "\n", encoding="utf-8")

            with self.assertRaises(TraceValidationError) as ctx:
                load_traces(path, source="mock")

            self.assertIn("task_prompt", str(ctx.exception))

    def test_rejects_invalid_reward(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.jsonl"
            path.write_text(
                json.dumps(_valid_row(raw_reward=0.5)) + "\n", encoding="utf-8"
            )

            with self.assertRaises(TraceValidationError) as ctx:
                load_traces(path, source="mock")

            self.assertIn("raw_reward", str(ctx.exception))

    def test_rejects_duplicate_trace_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.jsonl"
            row = json.dumps(_valid_row())
            path.write_text(f"{row}\n{row}\n", encoding="utf-8")

            with self.assertRaises(TraceValidationError) as ctx:
                load_traces(path, source="mock")

            self.assertIn("duplicate trace_id", str(ctx.exception))

    def test_rejects_empty_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "empty.jsonl"
            path.write_text("\n\n", encoding="utf-8")

            with self.assertRaises(TraceValidationError) as ctx:
                load_traces(path, source="mock")

            self.assertIn("no records", str(ctx.exception))

    def test_rejects_unknown_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.jsonl"
            path.write_text(
                json.dumps(_valid_row(extra_field="nope")) + "\n", encoding="utf-8"
            )

            with self.assertRaises(TraceValidationError) as ctx:
                load_traces(path, source="mock")

            self.assertIn("unknown fields", str(ctx.exception))


class NeedsReviewTests(unittest.TestCase):
    def test_conflicting_labels_flag_review(self) -> None:
        record = parse_trace_record(
            _valid_row(is_hack=True, is_legit=True),
            line_number=1,
            source="mock",
        )
        self.assertTrue(record.needs_review)
        self.assertTrue(
            compute_needs_review(
                raw_reward=record.raw_reward,
                patched_reward=record.patched_reward,
                is_hack=record.is_hack,
                is_legit=record.is_legit,
            )
        )

    def test_hack_still_rewarded_after_patch_flags_review(self) -> None:
        record = parse_trace_record(
            _valid_row(
                raw_reward=1.0, patched_reward=1.0, is_hack=True, is_legit=False
            ),
            line_number=1,
            source="mock",
        )
        self.assertTrue(record.needs_review)

    def test_fixture_includes_needs_review_rows(self) -> None:
        traces = {trace.trace_id: trace for trace in load_traces(MOCK_FIXTURE)}
        self.assertTrue(traces["mock-010"].needs_review)
        self.assertTrue(traces["mock-012"].needs_review)
        self.assertFalse(traces["mock-011"].needs_review)


if __name__ == "__main__":
    unittest.main()
