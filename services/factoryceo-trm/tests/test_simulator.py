"""Generator produces a feasible world and corruptions actually break plans."""

from src.generator import generate_state, corrupt_plan, messy_prompt
from src.baselines import greedy, base_plan
from src.verifier import evaluate


def test_generated_state_is_internally_consistent():
    s = generate_state(seed=7, horizon_days=30, n_jobs=14)
    assert len(s.jobs) == 14
    assert any(o.type.value == "robot" for o in s.operators)  # humanoid present
    # every job's material exists
    for j in s.jobs:
        assert s.material_by_name(j.material) is not None


def test_greedy_is_feasible_across_seeds():
    for seed in range(6):
        s = generate_state(seed=seed, horizon_days=30)
        assert evaluate(s, greedy(s)).n_hard == 0


def test_corruption_introduces_violations():
    s = generate_state(seed=1, horizon_days=20)
    g = greedy(s)
    bad = corrupt_plan(s, g, seed=1, n_corruptions=6)
    assert evaluate(s, bad).n_hard > evaluate(s, g).n_hard


def test_base_plan_is_worse_than_greedy():
    s = generate_state(seed=4, horizon_days=20)
    assert evaluate(s, base_plan(s)).reward < evaluate(s, greedy(s)).reward


def test_messy_prompt_renders_text():
    s = generate_state(seed=0, horizon_days=14)
    txt = messy_prompt(s)
    assert "Customer email" in txt and "Machine log" in txt
