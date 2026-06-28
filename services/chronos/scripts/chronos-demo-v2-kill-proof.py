"""Prove the hardened v2 grader kills the Witness and preserves controls at runtime.

Reproduces the exact Plan 005 release-verification harness (_DockerVerifierRunner:
agent writes /app, hardened tests served read-only at /tests, reward from
/tests/test.sh) on a freshly-materialized v2 tree, in real mongo:7.0 containers.
This closes the "served-runtime kill-parity unproven" gap for Plan 006's publish
preparation. No HUD upload is performed.
"""

from __future__ import annotations

import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, "src")

from chronos.releases.harden_task_materializer import materialize_harden_task_source
from chronos.releases.models import digest_json, utc_now
from chronos.releases.release_results import (
    _DockerVerifierRunner,
    _file_digest,
    _tree_digest,
)

ROOT = Path(".").resolve()
EXPECTED_GRADER_V2 = "c0d86aebeb2ee774e5d39cd70537c70643ca190a0769270ceaf4b5e333d0e908"
WITNESS_REF = "docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json"
CONTROLS_REF = "fixtures/chronos/mongodb-sales-aggregation-engine/controls.json"
OUT_REF = "artifacts/chronos/demo/publish/v2-runtime-kill-proof.json"


def main() -> int:
    proofset = json.loads(
        Path("docs/plans/evidence/005/integration-release-preflight.json").read_text()
    )
    proofset = proofset.get("proofset") or proofset
    witness = json.loads(Path(WITNESS_REF).read_text())
    controls = json.loads(Path(CONTROLS_REF).read_text())["controls"]

    with tempfile.TemporaryDirectory(prefix="chronos-v2-source-") as tmp:
        rec = materialize_harden_task_source(
            proof_set=proofset,
            task_id="mongodb-sales-aggregation-engine",
            task_assets_source=ROOT / "envs/mongodb-sales-aggregation-engine",
            output_root=Path(tmp),
        )
        source = Path(rec["task_source"])
        grader_v2 = digest_json(
            {
                "tests/test.sh": _file_digest(source / "tests" / "test.sh"),
                "tests": _tree_digest(source / "tests"),
            }
        )
        if grader_v2 != EXPECTED_GRADER_V2:
            print(
                f"FAIL: regenerated grader_v2_digest {grader_v2} != ReleaseProof {EXPECTED_GRADER_V2}"
            )
            return 2

        candidate = {
            "release_candidate_id": "releasecandidate-294df1726b8a5ed0",
            "source_path": str(source),
            "environment_v2": "mongodb-sales-aggregation-engine:c2ee704d5c4e653e",
            "grader_v2_digest": grader_v2,
        }
        trace_root = Path(tmp) / "verification"
        runner = _DockerVerifierRunner(
            repo_root=ROOT,
            candidate=candidate,
            trace_root=trace_root,
            control_solution_target="query.py",
            docker_image="mongo:7.0",
        )

        print(
            "=== witness (exploit) against hardened v2 -> expect reward 0 ===",
            flush=True,
        )
        w = runner.witness_result(witness)
        print(f"witness {w['case_id']}: reward={w['reward']}", flush=True)

        control_results = []
        for control in controls:
            print(
                f"=== control {control['control_id']} -> expect reward 1 ===",
                flush=True,
            )
            c = runner.control_result(control)
            print(f"control {c['case_id']}: reward={c['reward']}", flush=True)
            control_results.append(c)

        witness_killed = w["reward"] == 0.0
        controls_preserved = all(c["reward"] == 1.0 for c in control_results)
        record = {
            "schema_version": 1,
            "kind": "hardened-v2-runtime-kill-proof",
            "harness": "_DockerVerifierRunner (mongo:7.0; agent writes /app, hardened tests served read-only /tests, reward from /tests/test.sh)",
            "environment_v2": candidate["environment_v2"],
            "grader_v2_digest": grader_v2,
            "grader_v2_digest_matches_releaseproof": grader_v2 == EXPECTED_GRADER_V2,
            "witness_id": w["case_id"],
            "witness_reward_v2": w["reward"],
            "witness_killed": witness_killed,
            "control_rewards_v2": {c["case_id"]: c["reward"] for c in control_results},
            "controls_preserved": controls_preserved,
            "kill_parity_pass": witness_killed and controls_preserved,
            "upload_performed": False,
            "verified_at": utc_now(),
        }
        record["content_digest"] = digest_json(record)
        out = ROOT / OUT_REF
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(record, indent=2, sort_keys=True) + "\n")
        print(f"\nWROTE {OUT_REF}")
        print(
            f"KILL_PARITY_PASS={record['kill_parity_pass']} "
            f"(witness_killed={witness_killed}, controls_preserved={controls_preserved})"
        )
        return 0 if record["kill_parity_pass"] else 2


if __name__ == "__main__":
    raise SystemExit(main())
