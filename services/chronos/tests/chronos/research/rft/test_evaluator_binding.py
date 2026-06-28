"""Behavior tests for the sealed Plan 005 v2 evaluator binding."""

from __future__ import annotations

import hashlib
import json
import tempfile
from pathlib import Path

import pytest

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.rft.evaluator_binding import prepare_sealed_v2_evaluator_binding


RELEASE_PROOF = Path(
    "artifacts/chronos/releases/release-proofs/releaseproof-30e03914472631dd.json"
)
PLAN_005_MANIFEST = Path("docs/plans/evidence/005/MANIFEST.json")


def _seal(payload: dict[str, object]) -> dict[str, object]:
    canonical = {
        key: value for key, value in payload.items() if key != "content_digest"
    }
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    payload["content_digest"] = hashlib.sha256(encoded).hexdigest()
    return payload


def test_real_releaseproof_binds_v2_identity_and_regressions() -> None:
    with tempfile.TemporaryDirectory() as tmp:
        output = Path(tmp) / "binding.json"
        result = prepare_sealed_v2_evaluator_binding(
            release_proof_path=RELEASE_PROOF,
            plan_005_manifest_path=PLAN_005_MANIFEST,
            output_path=output,
        )

        payload = json.loads(output.read_text())
        assert result.release_proof_id == "releaseproof-30e03914472631dd"
        assert result.witness_count == 1
        assert result.control_count == 3
        assert result.subversion_probe_count == 6
        assert payload["status"] == "prepared_not_registered"
        assert payload["binding"]["environment_v2"] == (
            "mongodb-sales-aggregation-engine:c2ee704d5c4e653e"
        )
        assert payload["binding"]["grader_v2_digest"] == (
            "c0d86aebeb2ee774e5d39cd70537c70643ca190a0769270ceaf4b5e333d0e908"
        )
        assert payload["security"]["trusted_test_roots"] == ["/tests"]
        assert payload["security"]["untrusted_writable_roots"] == ["/app"]
        assert (
            payload["security"]["reward_record_policy"]["agent_writable_reward_paths"]
            == []
        )
        assert payload["provider_registration"]["status"] == "not_run"
        assert payload["training"]["status"] == "not_run"


def test_binding_rejects_agent_writable_trusted_tests() -> None:
    proof = json.loads(RELEASE_PROOF.read_text())
    contexts = proof["evaluator_context_refs"]
    assert isinstance(contexts, list)
    context = contexts[0]
    assert isinstance(context, dict)
    context["untrusted_writable_roots"] = ["/app", "/tests"]
    _seal(proof)

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        release = root / "release.json"
        release.write_text(json.dumps(proof), encoding="utf-8")
        manifest = root / "005.json"
        manifest.write_text(
            json.dumps(
                {
                    "schema_version": 1,
                    "plan_id": "005",
                    "status": "complete",
                    "artifacts": [{"ref": str(release)}],
                }
            ),
            encoding="utf-8",
        )

        with pytest.raises(CanonicalInputError, match="overlaps agent-writable"):
            prepare_sealed_v2_evaluator_binding(
                release_proof_path=release,
                plan_005_manifest_path=manifest,
                output_path=root / "binding.json",
            )
