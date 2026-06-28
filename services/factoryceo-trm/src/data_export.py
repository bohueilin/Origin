"""Export verifier-graded repair episodes as JSONL for SFT / preference / RFT.

Each line follows the handoff brief's episode schema:

    {
      "observation": {"messy_prompt": "...", "factory_state": {...}},
      "initial_plan": {...},
      "verifier_before": {"reward": .., "errors": [...]},
      "repair_trace": [{"repair_action": .., "reward_after": .., "errors_after": [..]}, ..],
      "final_plan": {...}
    }

This is the training-data artifact: a model can be fine-tuned to imitate the
repair trace (SFT), to prefer higher-reward repairs (preference), or rewarded by
the verifier directly (RFT).
"""

from __future__ import annotations

import json

from .schemas import FactoryState, ActionPlan, deadline_hour
from .generator import messy_prompt
from .verifier import evaluate
from .repair_loop import repair_loop
from .ruler import RulerJudge

_JUDGE = RulerJudge()
SUITE_SEED = "factoryceo-trm-v1"


def _exercise_tags(state: FactoryState, plan: ActionPlan) -> list[str]:
    """SYNTH-style task-type tags describing which decisions this episode exercises."""
    tags = ["scheduling", "quality"]
    if plan.procurement or any(j.material_kg > (state.material_by_name(j.material).inventory_kg
                               if state.material_by_name(j.material) else 0) for j in state.jobs):
        tags.append("procurement")
    if state.rfqs:
        tags.append("quoting")
    sched = {}
    for a in plan.schedule:
        sched.setdefault(a.job_id, []).append(a)
    if any(sched.get(j.id) and max(x.end for x in sched[j.id]) > deadline_hour(j.due_day)
           for j in state.jobs):
        tags.append("customer_comms")
    if any(m.uptime < 0.9 for m in state.machines):
        tags.append("safety")
    return tags


def build_episode(state: FactoryState, initial_plan: ActionPlan, seed: int = 0,
                  K: int = 40, trim_state: bool = True, constraints: dict | None = None) -> dict:
    before = evaluate(state, initial_plan)
    final_plan, trace = repair_loop(state, initial_plan, K=K)
    after = evaluate(state, final_plan)

    fs = state.model_dump(mode="json")
    if trim_state:
        # keep the demo payload light: full machines/operators/materials, jobs capped
        fs["jobs"] = fs["jobs"][:8]

    return {
        # --- SYNTH-style provenance / task metadata ---
        "synth_id": f"{SUITE_SEED}-{seed}",
        "exercise": _exercise_tags(state, final_plan),
        "constraints": constraints or {"seed": seed, "horizon_days": state.horizon_days,
                                       "n_jobs": len(state.jobs)},
        "negative": before.n_hard > 0,        # initial plan was infeasible (a hard example)
        "teacher": "deterministic+repair",     # swap to claude / gemma-vllm to enrich
        # --- the RL/SFT episode ---
        "observation": {
            "messy_prompt": messy_prompt(state, seed=seed),
            "factory_state": fs,
        },
        "initial_plan": initial_plan.model_dump(mode="json"),
        "verifier_before": {
            "reward": before.reward,
            "n_hard": before.n_hard,
            "errors": before.errors_as_dicts(),
            "metrics": before.metrics,
        },
        "repair_trace": trace,
        "final_plan": final_plan.model_dump(mode="json"),
        "verifier_after": {
            "reward": after.reward,
            "n_hard": after.n_hard,
            "metrics": after.metrics,
        },
        # --- RULER soft (higher-dimensional) reward on the final plan ---
        "ruler_soft": _JUDGE.score(state, final_plan),
    }


def write_jsonl(path: str, episodes: list[dict]) -> None:
    with open(path, "w") as f:
        for ep in episodes:
            f.write(json.dumps(ep) + "\n")
