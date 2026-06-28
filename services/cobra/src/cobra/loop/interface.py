"""Seam 1 — the locked function contract.

The whole loop is now implemented (Track A), so this module re-exports the real impls:
every track calls the loop through this one contract instead of reaching into
`substrate`/`harness`/`grader`/`oracle`/`templates`/`gate`/`metrics` directly.

Seam drift (flagged for the team): the real `run_oracle(task, workdir)` takes the task
(the gold/plus_input live on it, never in the workdir), so the re-exported signature is
(task, workdir) — not the doc's original `run_oracle(workdir)`. Reconciled here to match
the implementation since nothing called the old shape yet.
"""

from ..gate import regression_gate
from ..grader.runner import run_grader
from ..grader.spec import Grader
from ..harness.workdir import make_workdir
from ..metrics import agreement, baseline_agreement, honest_pass
from ..oracle import run_oracle
from ..substrate.evalplus_task import Task, load_task
from ..templates import apply_patch

__all__ = [
    "Task",
    "Grader",
    "load_task",
    "make_workdir",
    "run_grader",
    "run_oracle",
    "is_breach",
    "apply_patch",
    "regression_gate",
    "agreement",
    "baseline_agreement",
    "honest_pass",
]


def is_breach(R, T) -> bool:
    """A breach is grader pass and oracle fail (R=1, T=0)."""
    return R == 1 and T == 0
