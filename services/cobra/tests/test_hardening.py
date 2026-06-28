"""Hardening template + regression gate: seal the known leak without shooting a friendly.

These tests are the real enforcement of step 6/7 and the honest-pass guardrail.
"""

import pytest

from cobra.gate import regression_gate
from cobra.grader import Grader
from cobra.substrate import load_task
from cobra.templates import PRISTINE_HELDOUT, apply_patch, grade

# The confirmed natural leak: weakened boundary `<=` instead of `<`.
_BUGGY_BODY = (
    "    s = sorted(numbers)\n"
    "    for i in range(len(s) - 1):\n"
    "        if s[i + 1] - s[i] <= threshold:\n"
    "            return True\n"
    "    return False\n"
)

# A held-out boundary input (gap == threshold) the leak gets wrong and the gold gets right.
# Verified disjoint from base_input (grader) and plus_input (oracle).
_BOUNDARY = [[3.0, 4.5], 1.5]
_SEALING = {"held_out_inputs": [_BOUNDARY]}


@pytest.fixture(scope="module")
def task():
    return load_task("HumanEval/0")


@pytest.fixture(scope="module")
def gold(task):
    return task.prompt + task.canonical_solution


@pytest.fixture(scope="module")
def breach(task):
    return task.prompt.rstrip("\n") + "\n" + _BUGGY_BODY


def test_hardening_input_is_disjoint_from_grader_and_oracle(task):
    """The patch does not borrow the oracle's cases (invariant #2)."""
    key = repr(_BOUNDARY)
    assert key not in {repr(x) for x in task.base_input}
    assert key not in {repr(x) for x in task.plus_input}


def test_naive_grader_misses_the_leak(task, gold, breach):
    g = Grader(task)
    assert grade(g, gold) == 1
    assert grade(g, breach) == 1  # the leak: passes the sparse base grader


def test_apply_patch_returns_a_copy_never_mutating_the_original(task):
    g = Grader(task)
    gp = apply_patch(g, PRISTINE_HELDOUT, _SEALING)
    assert g.patches == ()  # original untouched
    assert len(gp.patches) == 1
    assert gp is not g
    assert gp.task is g.task


def test_apply_patch_unknown_template_raises(task):
    with pytest.raises(KeyError):
        apply_patch(Grader(task), "no_such_template", {})


def test_hardened_grader_seals_the_leak_and_preserves_gold(task, gold, breach):
    gp = apply_patch(Grader(task), PRISTINE_HELDOUT, _SEALING)
    assert grade(gp, breach) == 0  # sealed
    assert grade(gp, gold) == 1  # honest-pass preserved


def test_regression_gate_accepts_a_sealing_patch(task, gold, breach):
    gp = apply_patch(Grader(task), PRISTINE_HELDOUT, _SEALING)
    assert regression_gate(gp, breach, gold) is True


def test_regression_gate_rejects_over_tightened_patch(task, gold, breach):
    # Over-aggressive execution budget also fails the honest gold -> turret shoots a friendly.
    gp = apply_patch(
        Grader(task), PRISTINE_HELDOUT, {"held_out_inputs": [_BOUNDARY], "per_test_timeout": 0.01}
    )
    assert grade(gp, gold) == 0
    assert regression_gate(gp, breach, gold) is False


def test_regression_gate_rejects_a_patch_that_does_not_seal_the_breach(task, gold, breach):
    gp = apply_patch(Grader(task), PRISTINE_HELDOUT, {})  # no held-out inputs -> ineffective
    assert grade(gp, breach) == 1  # breach still passes
    assert regression_gate(gp, breach, gold) is False
