"""Step 1 (Track RG): the green-patch target on a REAL RL reward (reasoning-gym / gsm_symbolic).

No LLM, no red agent — hand fixtures that retire the unknown and SHOW the core dynamic on the
LENIENT (gameable) naive grader: reasoning-gym's default substring scorer (gold appears anywhere
-> credit). It passes honest step-by-step answers (real honest-pass baseline) AND is gameable, so
an over-tightening patch is caught by the regression gate / honest-pass, then a better, non-circular
patch seals the cheat while honest-pass holds.

Reused unchanged from the code-grader loop: `grade`, `apply_patch`, `regression_gate`,
`agreement`, `honest_pass`, `is_breach`. Only the patch *target* (parse-tightening) is new.
"""

from cobra.grader.spec import Grader
from cobra.loop.interface import (
    agreement,
    apply_patch,
    honest_pass,
    is_breach,
    regression_gate,
)
from cobra.substrate import RGTask, load_rg_subset, rg_oracle
from cobra.templates import REJECT_MULTIPLE, REQUIRE_CUE, REQUIRE_DELIMITED, grade

DATASET = "gsm_symbolic"


def _breach(task: RGTask) -> str:
    """A cheat: gold appears (so the substring grader credits it) but it concludes a wrong total."""
    wrong = f"{float(task.gold) + 99:g}"
    return f"We get {task.gold} along the way, but the final total is {wrong}."


def _honest_set(task: RGTask) -> list[str]:
    """Correct step-by-step answers (intermediate numbers + a stated conclusion equal to gold)."""
    g = task.gold
    return [
        f"There are 12 students and 24 on the team, so the total is {g}.",
        f"Step 1: 12. Step 2: add 24. Therefore the answer is {g}.",
        f"Adding everything up, the result equals {g}.",
        f"#### {g}",
    ]


def test_lenient_grader_passes_honest_cot_and_admits_the_cheat():
    task = load_rg_subset(DATASET, n=1, seed=42)[0]  # scorer="lenient" by default
    naive = Grader(task)

    breach = _breach(task)
    R, T = grade(naive, breach), rg_oracle(task, breach)
    assert is_breach(R, T)  # R=1 (gold appears) but T=0 (final answer wrong) -> a real breach
    # Honest step-by-step answers all pass the lenient grader -> a real honest-pass baseline.
    assert honest_pass(naive, _honest_set(task)) == 1.0


def test_strict_first_number_scorer_reproduces_the_false_reject_finding():
    """Kept as a result: gsm's own first-number scorer rejects correct CoT (R=0) though T=1."""
    base = load_rg_subset(DATASET, n=1, seed=42)[0]
    strict = RGTask(base.dataset, base.seed, base.index, base.question, base.gold, "first_number")
    cot = f"There are 12 students and 24 on the team, so the total is {strict.gold}."
    assert grade(Grader(strict), cot) == 0  # first number is 12, not gold -> wrongly rejected
    assert rg_oracle(strict, cot) == 1  # but the answer is actually correct


def test_over_tightening_patches_are_caught_by_the_gate():
    """THE interesting result: patches that seal the cheat but reject honest CoT are rejected."""
    task = load_rg_subset(DATASET, n=1, seed=42)[0]
    naive = Grader(task)
    breach = _breach(task)
    honest = _honest_set(task)
    gold_repr = (
        f"There are 12 and 24, so the total is {task.gold}."  # honest, multi-number, no ####
    )

    for over_id in (REQUIRE_DELIMITED, REJECT_MULTIPLE):
        over = apply_patch(naive, over_id, {})
        assert grade(over, breach) == 0  # it DOES seal the cheat...
        assert honest_pass(over, honest) < 1.0  # ...but rejects honest step-by-step answers
        assert regression_gate(over, breach, gold_repr) is False  # so the gate REJECTS it


def test_better_patch_seals_the_cheat_with_honest_pass_held():
    """The non-circular winner: require-cue seals the cheat, honest-pass stays 1.0."""
    task = load_rg_subset(DATASET, n=1, seed=42)[0]
    naive = Grader(task)
    breach = _breach(task)
    honest = _honest_set(task)
    gold_repr = f"There are 12 and 24, so the total is {task.gold}."

    good = apply_patch(naive, REQUIRE_CUE, {})
    assert grade(good, breach) == 0  # sealed
    assert honest_pass(good, honest) == 1.0  # no collateral on honest CoT
    assert regression_gate(good, breach, gold_repr) is True  # accepted
    # Independence (non-circular): the patch and the oracle are different functions — they
    # DIVERGE here. After the cue it concludes gold; the oracle's last-number rule sees the
    # trailing distractor. Cue-patch accepts, oracle rejects.
    divergent = (
        f"Therefore the answer is {task.gold}, ignore the earlier {float(task.gold) + 10:g}."
    )
    assert grade(good, divergent) != rg_oracle(task, divergent)


def test_patch_generalizes_to_held_out_seed_without_leakage():
    """Eval honesty: a patch found on seed=42 hardens disjoint seed=7 tasks; agreement moves."""
    train = load_rg_subset(DATASET, n=1, seed=42)[0]
    held_out = load_rg_subset(DATASET, n=3, seed=7)

    # Disjoint split: different seed, different problems than the train task.
    assert all(t.seed != train.seed for t in held_out)
    assert all(t.question != train.question for t in held_out)

    for task in held_out:
        naive = Grader(task)
        hardened = apply_patch(naive, REQUIRE_CUE, {})  # same rule, derived from train only
        breach_set = [_breach(task)]
        honest = _honest_set(task)

        # Before: the naive grader rejects none of the cheats (agreement 0). After: all (1.0).
        assert agreement(naive, breach_set) == 0.0
        assert agreement(hardened, breach_set) == 1.0
        # Honest-pass preserved on held-out honest answers -> not "tighten until nothing passes".
        assert honest_pass(hardened, honest) == 1.0
