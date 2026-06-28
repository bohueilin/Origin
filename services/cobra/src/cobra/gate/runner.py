"""The regression gate: a patch is sealed only if it fixes the hole without collateral.

Accept grader' iff the breach now scores 0 AND the gold solution still scores 1. A patch
that also rejects the gold is over-tightened — the dashboard's turret shooting a friendly —
and is rejected. This is the guardrail behind honest-pass (CLAUDE.md eval-honesty #3).
"""

from ..templates import grade


def regression_gate(grader_prime, breach, gold) -> bool:
    """Return True iff `grader_prime` seals the breach (score 0) and keeps the gold (score 1).

    `breach` and `gold` are solution sources. Evaluated under the patched grader only.
    """
    return grade(grader_prime, breach) == 0 and grade(grader_prime, gold) == 1
