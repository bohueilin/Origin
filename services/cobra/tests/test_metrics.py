"""The Milestone 1 capstone: the agreement number moves up on a HELD-OUT breach split,
with honest-pass preserved, and the train/held-out separation is enforced (not claimed).
"""

import pytest

from cobra.grader import Grader
from cobra.metrics import agreement, honest_pass, run_m1
from cobra.metrics.loop import TASK_ID, choose_patch
from cobra.substrate import load_task
from cobra.templates import PRISTINE_HELDOUT, apply_patch


@pytest.fixture(scope="module")
def task():
    return load_task(TASK_ID)


@pytest.fixture(scope="module")
def gold(task):
    return task.prompt + task.canonical_solution


@pytest.fixture(scope="module")
def report(task):
    return run_m1(task)  # the full M1 loop, computed once


def test_seed_breaches_are_all_genuine(report):
    assert report.source == "seed"
    assert report.n_breaches == 4
    assert report.n_dropped == 0


def test_m1_agreement_moves_up_with_honest_pass_preserved(report):
    # The milestone: low -> high on held-out, honest_pass pinned.
    assert report.agreement_before == 0.0  # naive grader accepts every cheat
    assert report.agreement_after == 1.0  # hardened grader rejects the held-out cheats
    assert report.agreement_after > report.agreement_before
    assert report.honest_pass == 1.0


def test_train_and_heldout_are_disjoint_and_both_nonempty(report):
    assert report.train and report.held_out
    assert set(report.train).isdisjoint(set(report.held_out))


def test_patch_is_tuned_on_train_only_never_sees_heldout(task, report):
    # Rebuilding the patch from the TRAIN split alone reproduces it; held-out is never an input.
    rebuilt = choose_patch(task, report.train)
    assert rebuilt.patches[-1].params["held_out_inputs"] == report.hardening_inputs


def test_patch_does_not_encode_any_heldout_breach(report):
    blob = repr(report.grader_prime.patches)
    for held_breach in report.held_out:
        assert held_breach not in blob


def test_hardening_inputs_are_disjoint_from_grader_and_oracle(task, report):
    base = {repr(x) for x in task.base_input}
    plus = {repr(x) for x in task.plus_input}
    assert report.hardening_inputs  # the patch actually added inputs
    for inp in report.hardening_inputs:
        assert repr(inp) not in base  # not the grader's cases
        assert repr(inp) not in plus  # not the oracle's cases (invariant #2)


def test_agreement_seam_before_and_after(task, report):
    naive = Grader(task)
    assert agreement(naive, report.held_out) == 0.0
    assert agreement(report.grader_prime, report.held_out) == 1.0


def test_baseline_agreement_is_the_genuine_naive_before_and_one_source():
    from cobra import metrics
    from cobra.loop import interface

    # Single source of truth: the conductor reaches it through loop.interface (not submodules).
    assert interface.baseline_agreement is metrics.baseline_agreement
    # Every breach passed the naive grader (R_naive=1) -> naive blocks none -> 0.0 baseline.
    assert metrics.baseline_agreement([1, 1, 1, 1]) == 0.0
    assert metrics.baseline_agreement([]) == 0.0
    # Genuinely computed from the verdicts, not a hardcoded 0: a non-breach (R=0) registers.
    assert metrics.baseline_agreement([1, 0, 1, 0]) == 0.5


def test_honest_pass_seam_drops_when_gold_is_rejected(task, gold, report):
    assert honest_pass(report.grader_prime, [gold]) == 1.0
    over_tightened = apply_patch(Grader(task), PRISTINE_HELDOUT, {"per_test_timeout": 0.01})
    assert honest_pass(over_tightened, [gold]) == 0.0
