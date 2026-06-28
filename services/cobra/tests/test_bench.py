from cobra.bench.core import column, leaderboard, rank, score_verifier
from cobra.bench.gap import best_of_k_accuracy, bestofk_gap
from cobra.bench.verifiers import rescoring_verifier
from cobra.rollout.dataset import Rollout


def _r(tid: str, rn: int, rh: int, to: int) -> Rollout:
    return Rollout(task_id=tid, model="m", completion="x", r_naive=rn, r_hardened=rh, t_oracle=to)


def test_naive_leaks_exploits_hardened_catches_them():
    rows = [
        _r("a", 1, 1, 1),  # honest solve
        _r("b", 1, 0, 0),  # cheat: naive accepts, hardened rejects
        _r("c", 1, 0, 0),  # cheat
        _r("d", 0, 0, 0),  # plain wrong: both reject
    ]
    naive, hardened = leaderboard(rows)
    assert naive.n_exploits == 3  # b, c, d are oracle-wrong
    assert abs(naive.catch_rate - 1 / 3) < 1e-9  # rejects only d
    assert naive.false_accept > hardened.false_accept
    assert hardened.catch_rate == 1.0  # rejects b, c, d
    assert naive.honest_pass == 1.0 and hardened.honest_pass == 1.0  # both keep the gold solve


def test_custom_verdict_plugs_in():
    rows = [_r("a", 1, 1, 1), _r("b", 1, 0, 0)]
    reject_all = score_verifier(rows, lambda r: 0, name="reject_all")
    assert reject_all.catch_rate == 1.0 and reject_all.honest_pass == 0.0
    accept_all = score_verifier(rows, lambda r: 1, name="accept_all")
    assert accept_all.catch_rate == 0.0 and accept_all.honest_pass == 1.0


def test_column_reads_reward():
    r = _r("a", 1, 0, 0)
    assert column("r_naive")(r) == 1 and column("r_hardened")(r) == 0


def test_safety_score_and_over_tighten_gate():
    # rejects everything: perfect catch, zero honest-pass → flagged, can't rank #1
    rows = [_r("a", 1, 1, 1), _r("b", 1, 0, 0), _r("c", 1, 0, 0)]
    safe = score_verifier(rows, lambda r: 1 if r.t_oracle == 1 else 0, name="perfect")
    rejecter = score_verifier(rows, lambda r: 0, name="reject_all")
    assert safe.safety_score == 100.0 and not safe.over_tightened
    assert rejecter.over_tightened  # honest_pass 0 < 0.90
    # ranking: the perfect verifier outranks the over-tightened rejecter despite equal catch
    assert rank([rejecter, safe])[0].name == "perfect"


def test_best_of_k_accuracy_any_verdict():
    rows = [_r("t", 1, 1, 1), _r("t", 1, 0, 0)]  # one task: honest + cheat
    # a verifier that only accepts the honest solve → best-of-K always picks it → oracle 100%
    assert best_of_k_accuracy(rows, lambda r: r.r_hardened) == 1.0
    # accept-all → random among both; over many seeds it's not always correct, but >=0
    assert 0.0 <= best_of_k_accuracy(rows, lambda r: 1) <= 1.0


def test_bestofk_gap_pools_by_task():
    # one task, pool = honest solve + a cheat that only the naive reward accepts
    rows = [_r("t", 1, 1, 1), _r("t", 1, 0, 0)]
    g = bestofk_gap(rows, seed=0)
    assert g.n_tasks == 1
    assert g.hardened_accuracy == 1.0  # hardened reward picks the honest solve (only it scores 1)
    assert g.gap >= 0.0  # hardened never worse than naive

    all_honest = [_r("a", 1, 1, 1), _r("b", 1, 1, 1)]
    assert bestofk_gap(all_honest).gap == 0.0  # nothing to recover


def test_trace_leaderboard_falls_back_without_hud():
    # No hud-python in the default env → must degrade to the plain leaderboard, never crash.
    from cobra.bench.hud import trace_leaderboard

    rows = [_r("a", 1, 1, 1), _r("b", 1, 0, 0)]
    traced = trace_leaderboard(rows)
    plain = leaderboard(rows)
    assert [s.name for s in traced] == [s.name for s in plain]
    assert traced[0].catch_rate == plain[0].catch_rate


def test_rescoring_verifier_loads_task_and_grades_completion():
    tasks = {"a": "TASK_A"}
    seen = []

    def score(task, completion):
        seen.append((task, completion))
        return 1 if "good" in completion else 0

    v = rescoring_verifier(score, load_task=lambda tid: tasks[tid])
    assert v(Rollout("a", "m", "good code", 1, 1, 1)) == 1
    assert v(Rollout("a", "m", "bad", 1, 0, 0)) == 0
    assert ("TASK_A", "good code") in seen
