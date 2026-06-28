"""RULER soft reward + verifier-gated hybrid reward + SYNTH-style export fields."""

from src.generator import generate_state, corrupt_plan
from src.baselines import greedy
from src.repair_loop import repair_loop
from src.ruler import RulerJudge
from src.hud_env import hybrid_reward, normalized_reward, group_relative
from src.data_export import build_episode


def test_ruler_heuristic_in_unit_range_and_ranks_repaired_higher():
    s = generate_state(seed=3, horizon_days=20)
    llm = corrupt_plan(s, greedy(s), seed=3, n_corruptions=6)
    trm, _ = repair_loop(s, llm, K=80)
    j = RulerJudge()
    s_raw = j.score(s, llm)["score"]
    s_trm = j.score(s, trm)["score"]
    assert 0.0 <= s_raw <= 1.0 and 0.0 <= s_trm <= 1.0
    assert s_trm >= s_raw
    assert j.score(s, trm)["backend"] == "heuristic"  # offline path


def test_hybrid_reward_is_verifier_gated():
    """An infeasible plan can't be rescued by the soft judge."""
    s = generate_state(seed=1, horizon_days=20)
    llm = corrupt_plan(s, greedy(s), seed=1, n_corruptions=6)
    trm, _ = repair_loop(s, llm, K=80)
    h_raw = hybrid_reward(s, llm)
    h_trm = hybrid_reward(s, trm)
    assert 0.0 <= h_raw["reward"] <= 1.0
    assert h_trm["reward"] > h_raw["reward"]
    # verifier term dominates: feasible plan's verifier >> infeasible plan's
    assert h_trm["verifier"] > h_raw["verifier"]


def test_group_relative_advantages():
    adv = group_relative([0.2, 0.5, 0.9, 0.4])     # GRPO advantages, no HUD key
    assert abs(sum(adv)) < 1e-6                      # centred on the group mean
    assert adv.index(max(adv)) == 2                  # best reward -> highest advantage
    assert group_relative([0.5, 0.5]) == [0.0, 0.0]  # zero variance -> zero advantage


def test_export_has_synth_style_fields():
    s = generate_state(seed=2, horizon_days=20)
    llm = corrupt_plan(s, greedy(s), seed=2, n_corruptions=6)
    ep = build_episode(s, llm, seed=2, K=60)
    for k in ("synth_id", "exercise", "constraints", "negative", "ruler_soft"):
        assert k in ep
    assert ep["negative"] is True                      # corrupted initial plan
    assert "scheduling" in ep["exercise"]
    assert 0.0 <= ep["ruler_soft"]["score"] <= 1.0
