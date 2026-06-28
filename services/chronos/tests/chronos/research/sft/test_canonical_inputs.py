"""Tests for canonical SFT artifact intake."""

from __future__ import annotations

import json
import hashlib
import tempfile
import unittest
from pathlib import Path

from chronos.research.sft.canonical_inputs import (
    assert_manifest_complete,
    load_qabench_report,
    load_release_proof,
)
from chronos.research.sft.errors import CanonicalInputError
from chronos.research.sft.qabench_adapter import iter_qabench_training_candidates
from chronos.research.sft.releaseproof_adapter import build_release_gate_index


def _write_json(path: Path, payload: dict[str, object]) -> Path:
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def _seal(payload: dict[str, object]) -> dict[str, object]:
    canonical = {
        key: value for key, value in payload.items() if key != "content_digest"
    }
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    payload["content_digest"] = hashlib.sha256(encoded).hexdigest()
    return payload


def _release_proof(
    *,
    witness_v1: float = 1.0,
    witness_v2: float = 0.0,
    control_v1: float = 1.0,
    control_v2: float = 1.0,
) -> dict[str, object]:
    return _seal(
        {
            "schema_version": 1,
            "release_proof_id": "rp-1",
            "proof_set_id": "ps-1",
            "environment_v1": "env-v1",
            "grader_v1_digest": "grader-v1",
            "environment_v2": "env-v2",
            "grader_v2_digest": "grader-v2",
            "patch_ref": "patches/rp-1.diff",
            "fixer_run_ref": "harden/runs/fix-1/result.json",
            "gate_status": "passed",
            "witnesses_killed": 1,
            "controls_preserved": 1,
            "trace_links": ["traces/wit-1", "traces/ctrl-1"],
            "subversion_results": [],
            "evaluator_context_refs": ["clean-evaluator-context"],
            "rejection_history": [],
            "family_variant_results": [],
            "release_candidate_ref": "releases/candidates/env-v2",
            "created_at": "2026-06-21T00:00:00Z",
            "content_digest": "TBD",
            "exploit_witness_ids": ["wit-1"],
            "legitimate_control_ids": ["ctrl-1"],
            "v1_results": [
                {"case_id": "wit-1", "case_kind": "witness", "reward": witness_v1},
                {"case_id": "ctrl-1", "case_kind": "control", "reward": control_v1},
            ],
            "v2_results": [
                {"case_id": "wit-1", "case_kind": "witness", "reward": witness_v2},
                {"case_id": "ctrl-1", "case_kind": "control", "reward": control_v2},
            ],
        }
    )


class CanonicalInputTests(unittest.TestCase):
    def test_manifest_must_be_complete_for_expected_plan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_json(
                Path(tmp) / "MANIFEST.json",
                {"plan_id": "008", "status": "not-started"},
            )
            with self.assertRaises(CanonicalInputError):
                assert_manifest_complete(path, plan_id="008")

    def test_qabench_report_requires_trajectories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_json(Path(tmp) / "report.json", {"metrics": {}})
            with self.assertRaises(CanonicalInputError):
                load_qabench_report(path)

    def test_branch_hack_without_lineage_remains_row_level_quarantineable(self) -> None:
        report = {
            "trajectories": [
                {
                    "trajectory_id": "tr-1",
                    "task_id": "task",
                    "origin": "branch",
                    "reward": 1.0,
                    "referee_verdict": "confirmed_hack",
                    "cluster_id": "pytest-plugin",
                }
            ]
        }
        candidates = list(iter_qabench_training_candidates(report))
        self.assertEqual(candidates[0].lineage, None)

    def test_release_proof_surviving_witness_rejects(self) -> None:
        with self.assertRaises(CanonicalInputError):
            build_release_gate_index(_release_proof(witness_v2=1.0))

    def test_release_proof_unrewarded_v1_witness_rejects(self) -> None:
        with self.assertRaises(CanonicalInputError):
            build_release_gate_index(_release_proof(witness_v1=0.0))

    def test_release_proof_unrewarded_v1_control_rejects(self) -> None:
        with self.assertRaises(CanonicalInputError):
            build_release_gate_index(_release_proof(control_v1=0.0))

    def test_release_proof_broken_v2_control_rejects(self) -> None:
        with self.assertRaises(CanonicalInputError):
            build_release_gate_index(_release_proof(control_v2=0.0))

    def test_release_proof_unknown_case_rejects(self) -> None:
        proof = _release_proof()
        proof["v1_results"] = [
            *proof["v1_results"],  # type: ignore[operator]
            {"case_id": "extra-1", "case_kind": "family_variant", "reward": 1.0},
        ]
        proof["v2_results"] = [
            *proof["v2_results"],  # type: ignore[operator]
            {"case_id": "extra-1", "case_kind": "family_variant", "reward": 0.0},
        ]
        with self.assertRaises(CanonicalInputError):
            build_release_gate_index(proof)

    def test_release_proof_missing_sealed_case_rejects(self) -> None:
        proof = _release_proof()
        proof["v1_results"] = [
            {"case_id": "wit-1", "case_kind": "witness", "reward": 1.0}
        ]
        proof["v2_results"] = [
            {"case_id": "wit-1", "case_kind": "witness", "reward": 0.0}
        ]
        with self.assertRaises(CanonicalInputError):
            build_release_gate_index(proof)

    def test_release_proof_conflicting_declared_case_kind_rejects(self) -> None:
        proof = _release_proof()
        v1_results = proof["v1_results"]
        assert isinstance(v1_results, list)
        v1_results[0]["case_kind"] = "control"
        with self.assertRaises(CanonicalInputError):
            build_release_gate_index(proof)

    def test_release_proof_loader_accepts_required_shape(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = _write_json(Path(tmp) / "releaseproof.json", _release_proof())
            artifact = load_release_proof(path)
            self.assertEqual(artifact.data["release_proof_id"], "rp-1")

    def test_release_proof_loader_requires_plan_005_release_candidate_ref(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            proof = _release_proof()
            proof.pop("release_candidate_ref")
            path = _write_json(Path(tmp) / "releaseproof.json", proof)
            with self.assertRaises(CanonicalInputError):
                load_release_proof(path)

    def test_release_proof_loader_requires_plan_005_subversion_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            proof = _release_proof()
            proof.pop("subversion_results")
            path = _write_json(Path(tmp) / "releaseproof.json", proof)
            with self.assertRaises(CanonicalInputError):
                load_release_proof(path)

    def test_release_proof_loader_verifies_content_digest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            proof = _release_proof()
            proof["gate_status"] = "passed"
            proof["content_digest"] = "sha256:not-the-digest"
            path = _write_json(Path(tmp) / "releaseproof.json", proof)
            with self.assertRaises(CanonicalInputError):
                load_release_proof(path)


if __name__ == "__main__":
    unittest.main()
