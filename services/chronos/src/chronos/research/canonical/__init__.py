"""Shared canonical Chronos artifact loaders for research training paths."""

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.canonical.inputs import (
    LoadedArtifact,
    assert_manifest_lists_artifact,
    assert_manifest_complete,
    load_qabench_report,
    load_release_proof,
)
from chronos.research.canonical.qabench import (
    QABenchTrajectory,
    iter_qabench_training_candidates,
)
from chronos.research.canonical.releaseproof import (
    ReleaseCaseResult,
    ReleaseGateIndex,
    assert_qabench_reward_matches_release,
    build_release_gate_index,
)
from chronos.research.canonical.types import RecordOrigin, RefereeVerdict

__all__ = [
    "CanonicalInputError",
    "LoadedArtifact",
    "QABenchTrajectory",
    "ReleaseCaseResult",
    "ReleaseGateIndex",
    "RecordOrigin",
    "RefereeVerdict",
    "assert_manifest_lists_artifact",
    "assert_manifest_complete",
    "assert_qabench_reward_matches_release",
    "build_release_gate_index",
    "iter_qabench_training_candidates",
    "load_qabench_report",
    "load_release_proof",
]
