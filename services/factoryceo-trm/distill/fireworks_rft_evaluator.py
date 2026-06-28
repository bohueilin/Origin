"""Fireworks RFT evaluator: our symbolic ShiftBench verifier as a reward function.

Fireworks Reinforcement Fine-Tuning calls this with the conversation messages plus
the dataset row's extra columns (``floor_id``, ``seed``, ``reward_mode``). We
reconstruct the exact verifier state deterministically from those columns and grade
the model's completion with ``reward_for_mode`` — the same [0,1] reward used for
HUD GRPO. No LLM-judge, no manual labels: the reward is the rule-based verifier
(feasibility-gated profit/safety), which is what makes the golden-hard set learnable.

Local test (no Fireworks needed):
    python distill/fireworks_rft_evaluator.py --self-test

Deploy to Fireworks (needs `pip install fireworks-ai[reward-kit]` + firectl/API key):
    see distill/fireworks_rft.sh
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=import-error,no-name-in-module,wrong-import-position
from src.floor_prompt import floor_prompt_and_state  # noqa: E402
from src.hud_env import reward_for_mode  # noqa: E402

try:  # reward-kit is only present on the Fireworks build SDK; degrade for local test
    from reward_kit import reward_function  # type: ignore
except Exception:  # pragma: no cover - local path without the SDK
    def reward_function(*_args, **_kwargs):  # type: ignore
        def _deco(fn):
            return fn
        return _deco


def _completion_text(messages: list[dict]) -> str:
    """The model's generated answer is the last assistant turn (fall back to last)."""
    if not messages:
        return ""
    for m in reversed(messages):
        if m.get("role") == "assistant":
            return str(m.get("content") or "")
    return str(messages[-1].get("content") or "")


def score_completion(messages: list[dict], floor_id: str, seed: int,
                     reward_mode: str = "strict") -> float:
    _prompt, state = floor_prompt_and_state(floor_id, int(seed))
    return float(reward_for_mode(state, _completion_text(messages), reward_mode))


@reward_function(id="shiftbench-verifier")
def evaluate(messages, floor_id=None, seed=None, reward_mode="strict", **_kwargs):
    """RFT reward: verifier score in [0,1] for the completion on (floor_id, seed)."""
    score = score_completion(messages, floor_id, int(seed or 0), reward_mode or "strict")
    return {"score": score, "reason": f"verifier {reward_mode} reward on {floor_id}#{seed}"}


def _self_test() -> int:
    """Prove the evaluator scores a good plan high and junk low on a golden task."""
    import json
    from pathlib import Path
    from src.baselines import greedy

    root = Path(__file__).resolve().parents[1]
    tasks = json.loads((root / "results" / "golden_hard_tasks.json").read_text())["tasks"]
    t = tasks[0]
    floor_id, seed, mode = t["floor_id"], int(t["seed"]), t.get("reward_mode", "strict")
    _prompt, state = floor_prompt_and_state(floor_id, seed)

    good = json.dumps(greedy(state).model_dump(mode="json"))
    junk = "Thinking... I will schedule everything optimally."
    empty = "{}"

    good_s = score_completion([{"role": "assistant", "content": good}], floor_id, seed, mode)
    junk_s = score_completion([{"role": "assistant", "content": junk}], floor_id, seed, mode)
    empty_s = score_completion([{"role": "assistant", "content": empty}], floor_id, seed, mode)

    print(f"task {floor_id}#{seed} ({mode}): greedy={good_s:.4f}  prose={junk_s:.4f}  empty={empty_s:.4f}")
    ok = good_s > 0.5 and good_s > junk_s and good_s > empty_s
    print("SELF-TEST", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        raise SystemExit(_self_test())
    print("import this module as a Fireworks evaluator, or run with --self-test")
