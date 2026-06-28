"""Compatibility wrapper for shared canonical artifact loaders."""

from chronos.research.canonical.inputs import (
    LoadedArtifact,
    assert_manifest_complete,
    load_qabench_report,
    load_release_proof,
)

__all__ = [
    "LoadedArtifact",
    "assert_manifest_complete",
    "load_qabench_report",
    "load_release_proof",
]
