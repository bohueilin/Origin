"""Recursive repair drives hard violations to zero and lifts reward."""

from src.generator import generate_state, corrupt_plan
from src.baselines import greedy
from src.verifier import evaluate
from src.repair_loop import repair_loop


def _setup(seed=0):
    s = generate_state(seed=seed, horizon_days=20)
    g = greedy(s)
    llm = corrupt_plan(s, g, seed=seed, n_corruptions=6)
    return s, llm


def test_repair_reaches_zero_hard_violations():
    for seed in range(5):
        s, llm = _setup(seed)
        assert evaluate(s, llm).n_hard > 0  # corruption actually broke it
        final, trace = repair_loop(s, llm, K=80)
        assert evaluate(s, final).n_hard == 0, f"seed {seed} not repaired"
        assert len(trace) > 0


def test_repair_improves_reward():
    s, llm = _setup(seed=2)
    before = evaluate(s, llm).reward
    final, _ = repair_loop(s, llm, K=80)
    assert evaluate(s, final).reward > before


def test_repair_trace_records_violation_countdown():
    s, llm = _setup(seed=1)
    _, trace = repair_loop(s, llm, K=80)
    counts = [len(step["errors_after"]) for step in trace]
    # the final step should leave no hard errors
    assert counts[-1] == 0


def test_trm_beats_capped_retry_on_average():
    trm_better = 0
    for seed in range(8):
        s, llm = _setup(seed)
        retry, _ = repair_loop(s, llm, K=3)
        trm, _ = repair_loop(s, llm, K=80)
        if evaluate(s, trm).reward >= evaluate(s, retry).reward:
            trm_better += 1
    assert trm_better >= 6  # TRM dominates the capped retry most of the time
