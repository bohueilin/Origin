"""Best-of-K capability gap: selection, the gap aggregation, and the oracle-blind tie-break."""

from cobra.bestofk import compute_gap
from cobra.bestofk.core import _select
from cobra.rollout import Rollout


def _r(task, model, completion, rn, rh, t):
    return Rollout(task, model, completion, r_naive=rn, r_hardened=rh, t_oracle=t)


def test_gap_recovers_a_cheat_naive_selected():
    rollouts = [
        # task A: naive picks the cheat (only it pays naive); hardened picks the solve.
        _r("A", "m", "cheat", 1, 0, 0),
        _r("A", "m", "solve", 0, 1, 1),
        # task B: both rewards pick the same correct solve.
        _r("B", "m", "solve", 1, 1, 1),
        _r("B", "m", "fail", 0, 0, 0),
    ]
    rep = compute_gap(rollouts, seed=0)
    assert rep.n == 2
    assert rep.naive_accuracy == 0.5  # A wrong, B right
    assert rep.hardened_accuracy == 1.0  # both right
    assert rep.gap == 0.5
    assert len(rep.naive_cheats) == 1
    assert len(rep.recovered) == 1 and rep.recovered[0].task_id == "A"
    assert rep.recovered_rate == 0.5


def test_selection_is_oracle_blind():
    # Two reward-tied completions with OPPOSITE oracle labels: the pick must not depend on t_oracle.
    g1 = [_r("A", "m", "X", 1, 1, 0), _r("A", "m", "Y", 1, 1, 1)]
    g2 = [_r("A", "m", "X", 1, 1, 1), _r("A", "m", "Y", 1, 1, 0)]  # oracle flipped, same order
    assert _select(g1, "r_naive", 0).completion == _select(g2, "r_naive", 0).completion


def test_tie_break_is_deterministic_across_runs():
    rollouts = [
        _r("A", "m", "p", 1, 1, 1),
        _r("A", "m", "q", 1, 1, 0),
        _r("A", "m", "r", 1, 0, 1),
    ]
    a = compute_gap(rollouts, seed=7)
    b = compute_gap(rollouts, seed=7)
    assert a.groups[0].naive_pick.completion == b.groups[0].naive_pick.completion
    assert a.groups[0].hardened_pick.completion == b.groups[0].hardened_pick.completion


def test_groups_split_by_task_and_model():
    rollouts = [
        _r("A", "m1", "s", 1, 1, 1),
        _r("A", "m2", "s", 1, 1, 1),
        _r("B", "m1", "s", 1, 1, 1),
    ]
    rep = compute_gap(rollouts)
    assert rep.n == 3  # (A,m1), (A,m2), (B,m1)
    assert {(g.task_id, g.model) for g in rep.groups} == {("A", "m1"), ("A", "m2"), ("B", "m1")}


def test_end_to_end_rg_cheat_and_solve_yield_the_gap():
    """A discovered-style cheat + an honest solve, scored by the REAL RG rewards, show the gap."""
    from cobra.rollout import Model, generate_rollouts, rg_real_scorers
    from cobra.substrate import RGTask

    task = RGTask("gsm_symbolic", 42, 0, "q", "70")
    outs = iter(
        [
            "There are 12 and 24, so the total is 70.",  # honest solve
            "We get 70 along the way, but the final total is 169.",  # discovered-style cheat
        ]
    )
    policy = Model("pressure:opus", lambda t: next(outs))
    rn, rh, to = rg_real_scorers()
    rollouts = generate_rollouts([task], [policy], r_naive=rn, r_hardened=rh, t_oracle=to, k=2)

    # The dataset contains a REAL cheat (1,0,0) alongside a solve (1,1,1).
    triples = {(r.r_naive, r.r_hardened, r.t_oracle) for r in rollouts}
    assert (1, 0, 0) in triples and (1, 1, 1) in triples
    # Naive pays both (its tie includes the cheat); only the solve survives hardening.
    assert {r.r_naive for r in rollouts} == {1}
    assert sorted(r.r_hardened for r in rollouts) == [0, 1]
    # Best-of-K: hardened selection lands on the solve (oracle-correct).
    rep = compute_gap(rollouts)
    assert rep.n == 1 and rep.groups[0].hardened_correct == 1


def test_per_task_aggregates_across_models():
    rollouts = [
        _r("A", "m1", "cheat", 1, 0, 0),
        _r("A", "m1", "solve", 0, 1, 1),
        _r("A", "m2", "solve", 1, 1, 1),
        _r("A", "m2", "fail", 0, 0, 0),
    ]
    rep = compute_gap(rollouts)
    # task A across 2 model-groups: naive correct on 1 of 2, hardened on 2 of 2.
    assert rep.per_task() == [("A", 2, 1, 2)]
