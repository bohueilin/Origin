"""Compatibility wrapper for shared qabench normalization."""

from chronos.research.canonical.qabench import (
    QABenchTrajectory,
    iter_qabench_training_candidates,
)

__all__ = ["QABenchTrajectory", "iter_qabench_training_candidates"]
