"""The mapped payloads carry real (canonical) provenance and hold the frontend invariants.

This integration is stacked on the Plan 003/005 work (PR #27); these tests assert
the payloads source the real committed producer records — the two discovered
branch runs, the sealed Exploit Witness, and the passing ReleaseProof — plus the
React Flow layout invariants that keep the tree from flashing/zooming, and honest
`TBD` markers where no validated producer exists.
"""

from __future__ import annotations

import json
from pathlib import Path

from chronos.api import mapping

VALID_STATUSES = {
    "pending",
    "running",
    "rewarded",
    "qa_review",
    "dead_end",
    "duplicate",
    "promising",
    "verifying",
    "witness",
    "control",
    "control_pass",
    "snapshot",
}
VALID_CLUSTERS = {"whitespace", "pytest", "control"}


def _raw(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


# --- ForkPoint + controls: real -------------------------------------------


def test_forkpoint_threads_real_snapshot_and_grader_digests() -> None:
    record = _raw(mapping.FORKPOINT_RECORD)
    fp = mapping.build_fork_point()
    assert fp["snapshotDigest"] == record["snapshot_digest"]
    assert fp["graderDigest"] == record["grader_digest"]
    assert fp["forkPointId"] == record["fork_point_id"]
    assert fp["snapshotMode"] in {"directory", "filesystem", "memory", "vm-filesystem"}


def test_controls_are_real_and_path_diverse() -> None:
    raw = _raw(mapping.CONTROLS_FILE)
    real_grader = raw["controls"][0]["grader_digest"]
    controls = mapping.build_controls()
    assert len(controls) == len(raw["controls"]) >= 3
    assert {c["solutionPathLabel"] for c in controls} == {"path-a", "path-b", "path-c"}
    for c in controls:
        assert c["graderDigest"] == real_grader
        assert len(c["contentDigest"]) == 64


# --- Branches: real branch runs overlaid + layout invariants ---------------


def test_real_branch_runs_are_overlaid_onto_the_tree() -> None:
    b08 = _raw(mapping.BRANCH_08)
    b11 = _raw(mapping.BRANCH_11)
    branches = {b["runId"]: b for b in mapping.build_branches()}

    witness_node = branches["run-whitespace"]
    assert witness_node["branchId"] == b08["branch_id"]
    assert witness_node["seed"] == b08["seed"]
    assert witness_node["model"] == b08["model"]
    assert witness_node["status"] == "witness"

    nonhack_node = branches["run-pytest11"]
    assert nonhack_node["branchId"] == b11["branch_id"]
    assert nonhack_node["seed"] == b11["seed"]
    # branch-11 is rewarded but classified non-hack
    assert nonhack_node["qa"]["isRewardHacking"] is False


def test_branches_hold_react_flow_layout_invariants() -> None:
    branches = mapping.build_branches()
    ids = {b["runId"].replace("run-", "") for b in branches}
    assert "layeredFallback" in ids  # store default selection target
    for b in branches:
        bid = b["runId"].replace("run-", "")
        assert b["runId"] == f"run-{bid}"
        assert isinstance(b["layout"]["x"], (int, float))
        assert isinstance(b["layout"]["y"], (int, float))
        assert b["status"] in VALID_STATUSES
        assert b["clusterId"] in VALID_CLUSTERS
        assert b["seed"] != 0
        parent = b["parentNodeId"]
        assert parent is None or parent in ids


def test_branches_thread_real_fork_provenance() -> None:
    record = _raw(mapping.FORKPOINT_RECORD)
    for b in mapping.build_branches():
        assert b["graderDigest"] == record["grader_digest"]
        assert b["environmentVersion"] == record["environment_version"]
        assert b["parentForkPointId"] == record["fork_point_id"]


# --- Witness overlay: the real sealed witness ------------------------------


def test_witness_overlay_is_the_real_sealed_witness() -> None:
    sealed = _raw(mapping.SEALED_WITNESS)
    overlay = mapping.build_witness_overlay()["whitespace"]
    assert overlay["witnessId"] == sealed["witness_id"]
    assert overlay["sourceBranchId"] == sealed["source_branch_id"]
    assert overlay["exploitMechanism"] == sealed["exploit_mechanism"]
    assert overlay["clusterId"] == sealed["cluster_id"]
    assert overlay["contentDigest"] == sealed["content_digest"]


# --- ProofSet + release: real ids and the real passing verdict --------------


def test_proofset_uses_the_real_plan005_proof_set_id() -> None:
    proof = _raw(mapping.RELEASE_PROOF)
    controls = {c["controlId"] for c in mapping.build_controls()}
    ps = mapping.build_proof_set()
    assert ps["proofSetId"] == proof["proof_set_id"]
    for cid in ps["legitimateControlIds"]:
        assert cid in controls
    assert ps["exploitWitnessIds"] == ["whitespace"]


def test_release_is_the_real_passing_gate() -> None:
    proof = _raw(mapping.RELEASE_PROOF)
    results = _raw(mapping.RELEASE_RESULTS)
    bundle = mapping.build_release_bundle()
    assert "release" not in bundle
    assert bundle["environmentV2"] == proof["environment_v2"]
    assert bundle["graderV2Digest"] == proof["grader_v2_digest"]
    assert bundle["releaseProofId"] == proof["release_proof_id"]
    assert proof["witnesses_killed"] == 1
    assert proof["controls_preserved"] == 3
    assert {case["status"] for case in proof["subversion_results"]} == {"blocked"}
    # gate passes at every iteration: no surviving witness or broken control
    for it in ("1", "2", "3"):
        assert bundle["survivingWitnessByIteration"][it] == []
        assert bundle["brokenControlByIteration"][it] == []
    # the patch metadata is content-addressed by the release candidate
    patch = bundle["patches"]["1"]
    assert patch["filePath"] == "task_assets/test_outputs.py"
    assert patch["patchDigest"] == results["release_candidate"]["content_digest"]
    assert patch["rationale"]  # mandatory subversion cases


# --- Replay: real digests from the sealed-witness replays ------------------


def test_replay_evidence_is_real() -> None:
    rec = _raw(mapping.REPLAY_RECORD)
    sealed = _raw(mapping.SEALED_WITNESS)
    replay = mapping.build_replay_evidence()
    assert replay["snapshotDigest"] == rec["snapshot_digest"]
    assert replay["replayAttempts"] == len(sealed["replay_checks"])
    assert (
        replay["verifierOutputDigest"]
        == sealed["replay_checks"][0]["verifier_output_digest"]
    )
    assert replay["digestMatch"] is True


# --- Honesty: validated release values are concrete ------------------------


def test_validated_v2_values_are_not_tbd() -> None:
    bundle = mapping.build_release_bundle()
    assert bundle["graderV2Digest"] != "TBD"
    assert bundle["environmentV2"] != "TBD"


def test_build_all_has_every_route() -> None:
    assert set(mapping.build_all()) == {
        "forkpoint",
        "controls",
        "branches",
        "witnesses",
        "proofset",
        "release",
        "replay", "benchmark",
    }
