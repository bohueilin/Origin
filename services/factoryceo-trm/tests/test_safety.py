"""Reward = profit + safety; the repair loop controls physical hazards."""

from src.generator import generate_state, corrupt_plan
from src.baselines import greedy
from src.verifier import evaluate, SAFE_UPTIME
from src.repair_loop import repair_loop
from src.schemas import SafetyDecision, SafetyAction


def test_degraded_machine_use_is_a_safety_incident():
    s = generate_state(seed=1, horizon_days=20)
    g = greedy(s)
    used = {a.machine_id for a in g.schedule}
    degraded = [m.id for m in s.machines if m.uptime < SAFE_UPTIME and m.id in used]
    assert degraded, "scenario should exercise a degraded machine"
    assert evaluate(s, g).metrics["safety_incidents"] >= 1


def test_inspection_clears_incident_and_raises_reward():
    s = generate_state(seed=1, horizon_days=20)
    g = greedy(s)
    before = evaluate(s, g)
    deg = next(m.id for m in s.machines
              if m.uptime < SAFE_UPTIME and m.id in {a.machine_id for a in g.schedule})
    g.safety.append(SafetyDecision(target_id=deg, action=SafetyAction.inspect))
    after = evaluate(s, g)
    assert after.metrics["safety_incidents"] < before.metrics["safety_incidents"]
    assert after.reward > before.reward


def test_repair_loop_drives_safety_incidents_to_zero():
    for seed in range(5):
        s = generate_state(seed=seed, horizon_days=20)
        llm = corrupt_plan(s, greedy(s), seed=seed, n_corruptions=6)
        final, _ = repair_loop(s, llm, K=80)
        assert evaluate(s, final).metrics["safety_incidents"] == 0
