"""Naive grader: run the agent's current workdir state through the shared sandbox.

R in {0,1} comes from pytest's structured report (not exit codes), deterministically.
The grader only ever runs the visible suite; it never touches the oracle (plus_input) or
the gold (eval-honesty invariant #2, SPEC §4).
"""

from ..sandbox import DEFAULT_MEM_MB, DEFAULT_TIMEOUT, run_suite


def run_grader(workdir, timeout: float = DEFAULT_TIMEOUT, mem_mb: int = DEFAULT_MEM_MB) -> int:
    """Apply the workdir's current state, run its visible tests, and return R in {0,1}."""
    return run_suite(workdir, "test_visible.py", timeout, mem_mb)
