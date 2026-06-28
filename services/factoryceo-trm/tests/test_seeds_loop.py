"""Seed-corpus amplification (SYNTH-style) + TRM->Isaac->V-JEPA closed loop."""

from src.generator import load_seeds, amplify_seed, generate_from_seeds
from src.baselines import greedy
from src.verifier import evaluate
from src.llm import DeterministicPlanner
from src.closed_loop import run, execution_score


def test_seed_corpus_has_train_and_eval_splits():
    train = load_seeds("train")
    ev = load_seeds("eval")
    assert len(train) >= 2 and len(ev) >= 1
    # eval seeds are disjoint from train (held-out, the 'real' eval set)
    assert not ({s["id"] for s in train} & {s["id"] for s in ev})


def test_amplified_seeds_are_feasible_and_grounded():
    for sid, st in generate_from_seeds("train", n=8):
        assert evaluate(st, greedy(st)).n_hard == 0          # feasible
        assert any(o.type.value == "robot" for o in st.operators)
        assert len(st.jobs) > 0


def test_amplification_is_deterministic_per_variant():
    s = load_seeds("train")[0]
    a = amplify_seed(s, variant=2)
    b = amplify_seed(s, variant=2)
    assert a.model_dump() == b.model_dump()
    assert amplify_seed(s, variant=3).model_dump() != a.model_dump()


def test_closed_loop_offline_runs_and_gates():
    _, st = next(generate_from_seeds("train", n=1))
    out = run(st, DeterministicPlanner())
    assert out["verified"] is True
    assert 0.0 <= out["reward"] <= 1.0
    assert out["execution"]["source"] == "proxy(no-isaac)"   # offline path
    assert out["isaac_tasks"]["meta"]["verified"] is True


def test_mujoco_executor_renders_on_macos():
    """MuJoCo (native macOS, no GPU) renders a humanoid rollout from the plan."""
    import pytest
    pytest.importorskip("mujoco")
    from src.closed_loop import MuJoCoExecutor
    from isaac.plan_to_isaac import plan_to_tasks
    _, st = next(generate_from_seeds("train", n=1))
    tasks = plan_to_tasks(st, greedy(st))
    frames, goal = MuJoCoExecutor(n_frames=8).rollout(tasks)
    assert frames.shape == (8, 240, 320, 3)
    assert goal.shape == frames.shape


def test_execution_score_in_unit_range():
    _, st = next(generate_from_seeds("eval", n=1))
    plan = greedy(st)
    es = execution_score(st, plan)
    assert 0.0 <= es["score"] <= 1.0
