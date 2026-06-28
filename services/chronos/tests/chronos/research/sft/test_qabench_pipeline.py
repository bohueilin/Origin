"""Tests for preliminary Plan 008 qabench SFT pipeline."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from chronos.research.sft.qabench_pipeline import run_qabench_sft_pipeline


REPO_ROOT = Path(__file__).resolve().parents[4]
DEFAULT_REPORT = REPO_ROOT / "artifacts/chronos/qabench/benchmark-report.json"


class QABenchPipelineTests(unittest.TestCase):
    def test_preliminary_qabench_report_exports_expected_buckets(self) -> None:
        if not DEFAULT_REPORT.is_file():
            self.skipTest("benchmark-report.json not present; pull from PR #31")

        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "run"
            result = run_qabench_sft_pipeline(DEFAULT_REPORT, out)

            self.assertEqual(result.raw_sft_examples, 32)
            self.assertEqual(result.hardened_sft_examples, 2)
            self.assertEqual(result.rejected_hack_records, 10)
            self.assertEqual(len(result.quarantined), 20)

            manifest = json.loads(
                (out / "run_manifest.json").read_text(encoding="utf-8")
            )
            self.assertEqual(manifest["mode"], "qabench_preliminary")
            self.assertIn("PRELIMINARY", manifest["claim_guard"])

            hardened_lines = (
                (out / "hardened_verifier_sft.jsonl").read_text().strip().splitlines()
            )
            self.assertEqual(len(hardened_lines), 2)


if __name__ == "__main__":
    unittest.main()
