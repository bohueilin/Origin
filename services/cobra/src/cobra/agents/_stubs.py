"""DEV STUBS (Track B, local-only). Swap for `cobra.loop.interface` at first
integration (~hour 5), when Track A's real grader/harness lands.

B.0 prescribes a trivial stub grader so the red-agent loop can be built before the
real grader exists. These are CONSTANTS — they assert nothing about real breaches;
that confirmation happens against Track A's deterministic grader/oracle. Never let a
stub leak into the metric path (eval honesty is Track A's, measured for real).
"""

from __future__ import annotations

from pathlib import Path


def stub_run_grader(workdir: Path) -> int:
    """DEV: pretend the visible tests pass. Real: interface.run_grader."""
    return 1


def stub_run_oracle(workdir: Path) -> int:
    """DEV: pretend the oracle fails (breach shape R=1,T=0). Real: interface.run_oracle."""
    return 0
