"""TRM-native student encoding/dataset + greedy-seeding + chat-format export."""

import json
import os

from src.generator import generate_state
from src.baselines import greedy
from src.llm import _seed_with_greedy
from src.schemas import ActionPlan
from src.trm_student import encode, build_dataset, FEAT_DIM, ACTION_OPS
from src.data_export import build_episode


def test_encode_fixed_dim_and_counts():
    errs = [{"type": "machine_overlap"}, {"type": "machine_overlap"},
            {"type": "material_late"}]
    v = encode(errs)
    assert v.shape == (FEAT_DIM,)
    assert v[-1] == 3.0                       # total error count
    assert v[ {t: i for i, t in enumerate(__import__("src.trm_student",
              fromlist=["ERROR_TYPES"]).ERROR_TYPES)}["machine_overlap"] ] == 2.0


def test_seed_with_greedy_completes_empty_plan():
    s = generate_state(seed=1, horizon_days=20)
    empty = ActionPlan()                      # LLM returned nothing schedulable
    seeded = _seed_with_greedy(s, empty)
    g = greedy(s)
    assert len(seeded.schedule) == len(g.schedule)   # schedule fully backfilled


def test_build_dataset_from_episodes(tmp_path):
    s = generate_state(seed=2, horizon_days=20)
    from src.generator import corrupt_plan
    ep = build_episode(s, corrupt_plan(s, greedy(s), seed=2, n_corruptions=6), seed=2, K=60)
    p = tmp_path / "eps.jsonl"
    p.write_text(json.dumps(ep) + "\n")
    X, y = build_dataset(str(p))
    assert X.shape[0] == y.shape[0] > 0
    assert X.shape[1] == FEAT_DIM
    assert set(int(v) for v in y).issubset(set(range(len(ACTION_OPS))))


def test_op_selector_controller_drives_loop_to_zero():
    """A learned controller (op_selector) can drive the repair loop; it still
    reaches 0 hard violations (rule-based priority is the fallback floor)."""
    from src.generator import corrupt_plan
    from src.verifier import evaluate
    from src.repair_loop import repair_loop
    s = generate_state(seed=5, horizon_days=20)
    cand = corrupt_plan(s, greedy(s), seed=5, n_corruptions=6)
    # stand-in controller (no torch needed): always prefer move_operation
    final, _ = repair_loop(s, cand, K=80, op_selector=lambda errors: "move_operation")
    assert evaluate(s, final).n_hard == 0


def test_chat_format_export_is_messages(tmp_path):
    s = generate_state(seed=3, horizon_days=20)
    from src.generator import corrupt_plan
    ep = build_episode(s, corrupt_plan(s, greedy(s), seed=3, n_corruptions=6), seed=3, K=60)
    eps = tmp_path / "eps.jsonl"; eps.write_text(json.dumps(ep) + "\n")
    import sys
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "distill"))
    import train_trm
    ex = next(train_trm.iter_examples(str(eps)))
    roles = [m["role"] for m in ex["messages"]]
    assert roles == ["system", "user", "assistant"]
    json.loads(ex["messages"][-1]["content"])   # assistant content is valid JSON action
