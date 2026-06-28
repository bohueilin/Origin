"""The HUD / JEPA / planner adapters import and behave (offline fallbacks)."""

from src.generator import generate_state, corrupt_plan
from src.baselines import greedy
from src.repair_loop import repair_loop
from src.hud_env import normalized_reward, score_answer, scenario_prompt
from src.jepa import VJEPAWorldModel
from src.llm import DeterministicPlanner


def test_hud_normalized_reward_ranks_trm_above_raw():
    s = generate_state(seed=3, horizon_days=20)
    llm = corrupt_plan(s, greedy(s), seed=3, n_corruptions=6)
    trm, _ = repair_loop(s, llm, K=80)
    assert 0.0 <= normalized_reward(s, llm) <= 1.0
    assert normalized_reward(s, trm) > normalized_reward(s, llm)


def test_hud_score_answer_parses_json_plan():
    s = generate_state(seed=0, horizon_days=14)
    g = greedy(s)
    assert score_answer(s, g.model_dump_json()) > 0.0
    assert score_answer(s, "not json") == 0.0
    assert "ActionPlan" in scenario_prompt(s)


def test_jepa_fallback_embed_is_deterministic():
    wm = VJEPAWorldModel()
    import numpy as np
    frames = np.zeros((4, 8, 8, 3), dtype=np.uint8)
    e1, e2 = wm.embed(frames), wm.embed(frames)
    assert e1.shape == (1024,)
    assert np.allclose(e1, e2)  # same input -> same latent, no GPU needed


def test_deterministic_planner_equals_greedy():
    s = generate_state(seed=2, horizon_days=14)
    assert DeterministicPlanner().plan(s).model_dump() == greedy(s).model_dump()
