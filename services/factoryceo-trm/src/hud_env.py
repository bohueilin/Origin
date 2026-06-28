"""FactoryCEO-TRM as a HUD environment.

HUD (hud.ai, ``hud-python``) packages tools + scenarios into a deployable RL/eval
environment: any ``@env.tool()`` is a callable action, and an ``@env.template()``
async generator *yields a prompt, receives the agent's answer, then yields a
reward in [0,1]*. That reward signal is exactly what you feed GRPO/RFT to train a
smaller specialised model -- the distillation path (large teacher -> small TRM).

This module exposes:
  * ``normalized_reward(state, plan)`` -- verifier reward squashed to [0,1]
    against per-scenario floor (naive plan) and ceiling (greedy), usable with or
    without HUD installed; it's what the tests check.
  * ``build_environment()`` -- the actual HUD env (tools + scenario template),
    built only when ``hud`` is importable.

Run locally once ``pip install hud-python`` and ``hud init`` scaffolding are set:
    hud dev          # local MCP server with hot reload
    # then run a Taskset against an agent and convert rewards -> advantages
"""

from __future__ import annotations

import json

from .schemas import FactoryState, ActionPlan
from .generator import generate_state, messy_prompt
from .baselines import greedy, base_plan
from .verifier import evaluate
from .repair_loop import repair_loop
from .ruler import RulerJudge

# pylint: disable=import-error,no-name-in-module,broad-exception-caught


def group_relative(rewards: list[float], normalize_std: bool = True) -> list[float]:
    """GRPO advantages from a group of rollout rewards (HUD/OpenPipe ART API).

    advantage_i = (reward_i - mean) / (std + eps)  -- centre on the group mean so
    above-average rollouts get positive advantage, below-average negative. This is
    the per-trajectory signal fed to the optimizer; needs no HUD key (the cloud
    key is only for hosted agent rollouts, telemetry, and the leaderboard)."""
    import statistics
    if not rewards:
        return []
    mean = statistics.fmean(rewards)
    if not normalize_std or len(rewards) < 2:
        return [r - mean for r in rewards]
    sd = statistics.pstdev(rewards)
    return [(r - mean) / (sd + 1e-8) for r in rewards]


def normalized_reward(state: FactoryState, plan: ActionPlan) -> float:
    """Verifier reward -> [0,1], floored at the naive plan, ceiled at greedy.

    Hard-constraint violations dominate the raw reward, so an infeasible plan
    lands near 0 and a clean, profitable, safe plan near 1. This is the scalar a
    HUD agent is trained to maximise."""
    floor = evaluate(state, base_plan(state)).reward
    ceil = evaluate(state, greedy(state)).reward
    r = evaluate(state, plan).reward
    if ceil <= floor:
        return 1.0 if r >= ceil else 0.0
    return max(0.0, min(1.0, (r - floor) / (ceil - floor)))


_JUDGE = RulerJudge()


def hybrid_reward(state: FactoryState, plan: ActionPlan, w: float = 0.3,
                  judge: RulerJudge = _JUDGE) -> dict:
    """Verifier (hard, trusted) blended with a RULER LLM-judge (soft, higher-dim).

    The verifier gates first: an infeasible/unsafe plan scores ~0 on the verifier
    term, so no amount of judge approval can rescue it (anti-reward-hacking). The
    judge only shapes the *soft* quality of otherwise-feasible plans. This is the
    scalar a HUD agent / GRPO loop (e.g. OpenPipe ART) maximises."""
    vr = normalized_reward(state, plan)
    j = judge.score(state, plan)
    blended = round((1 - w) * vr + w * j["score"], 4)
    return {"reward": blended, "verifier": round(vr, 4), "ruler": j["score"],
            "ruler_backend": j["backend"], "ruler_rationale": j["rationale"]}


def scenario_prompt(state: FactoryState) -> str:
    return (
        "You are the autonomous operations brain of a high-mix factory.\n\n"
        f"{messy_prompt(state)}\n\nCanonical state:\n"
        f"{json.dumps(state.model_dump(mode='json'))}\n\n"
        "Return ONE JSON ActionPlan (quote_decisions, procurement, schedule, "
        "quality, customer_messages, safety) that is feasible, profitable, and "
        "safe. Schedule every operation of every job. Respond with JSON only: "
        "start with { and end with }, with no markdown or explanation."
    )


def extract_json_object(text: str) -> dict | None:
    """Best-effort extraction of a JSON object from a noisy model response.

    Raw trainable gateway models wrap the answer in ``Thinking Process:`` prose,
    markdown fences, or multiple brace spans. A naive first-``{`` to last-``}``
    slice then spans non-JSON text and fails to parse, so the reward never credits
    JSON the model actually produced. This scans for balanced-brace spans and
    returns the largest one that parses as a dict."""
    if not text or "{" not in text:
        return None
    cleaned = text.replace("```json", "```").replace("```JSON", "```")
    cleaned = cleaned.replace("```", " ")
    best: dict | None = None
    best_len = -1
    depth = 0
    start = -1
    in_str = False
    escape = False
    for i, ch in enumerate(cleaned):
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            if depth == 0:
                start = i
            depth += 1
        elif ch == "}":
            if depth > 0:
                depth -= 1
                if depth == 0 and start >= 0:
                    span = cleaned[start:i + 1]
                    try:
                        obj = json.loads(span)
                    except Exception:
                        obj = None
                    if isinstance(obj, dict) and len(span) > best_len:
                        best, best_len = obj, len(span)
    return best


def score_answer(state: FactoryState, answer: str, hybrid: bool = True) -> float:
    """Parse an agent's JSON answer and score it; 0 on unparseable output.

    Uses the verifier+RULER hybrid reward by default; set hybrid=False for the
    pure-verifier signal."""
    try:
        raw = extract_json_object(str(answer or ""))
        if raw is None:
            return 0.0
        plan = ActionPlan.model_validate(raw)
        return hybrid_reward(state, plan)["reward"] if hybrid else normalized_reward(state, plan)
    except Exception:
        return 0.0


def shaped_score_answer(state: FactoryState, answer: str) -> float:
    """Dense training reward for first-pass HUD GRPO.

    Strict verifier reward is the final eval, but raw trainable gateway models
    often start with prose or partial JSON. This reward gives small credit for
    parse/schema progress, then larger credit for coverage and fewer verifier
    errors, so a rollout group has variance instead of all zeros.
    """
    text = str(answer or "")
    if "{" not in text or "}" not in text:
        return 0.01 if text.strip() else 0.0
    raw = extract_json_object(text)
    if raw is None:
        return 0.04

    expected_keys = {"quote_decisions", "procurement", "schedule", "quality", "customer_messages", "safety"}
    key_credit = 0.08 * (len(expected_keys & set(raw.keys())) / len(expected_keys))
    try:
        plan = ActionPlan.model_validate(raw)
    except Exception:
        return round(0.05 + key_credit, 4)

    total_ops = sum(len(j.operations) for j in state.jobs)
    scheduled = {(a.job_id, a.operation_id) for a in plan.schedule}
    expected_ops = {(j.id, op.id) for j in state.jobs for op in j.operations}
    coverage = len(scheduled & expected_ops) / max(1, total_ops)
    eval_result = evaluate(state, plan)
    hard_budget = max(1, total_ops * 3)
    feasibility = max(0.0, 1.0 - min(eval_result.n_hard, hard_budget) / hard_budget)
    strict = normalized_reward(state, plan)
    safety = min(1.0, len(plan.safety) / max(1, sum(1 for m in state.machines if m.uptime < 0.9)))
    # Do not let an empty but schema-valid plan get high reward: verifier/strict
    # credit only matters after the model schedules real operations.
    reward = 0.08 + key_credit + 0.36 * coverage + 0.24 * feasibility * coverage + 0.18 * strict * coverage + 0.04 * safety
    return round(max(0.0, min(1.0, reward)), 4)


def format_score_answer(state: FactoryState, answer: str) -> float:
    """Format-curriculum reward: teach the model to emit valid ActionPlan JSON.

    The scheduling rewards (shaped/strict) only become learnable once the model
    reliably produces a parseable plan object. A raw gateway model that starts
    with prose has a near-flat scheduling reward, so we first climb a steep ladder
    on format alone: braces -> parseable object -> valid schema -> small coverage
    bonus. Once a group averages ~0.5-0.7 here, switch to shaped/strict.
    """
    text = str(answer or "")
    if "{" not in text or "}" not in text:
        return 0.05 if text.strip() else 0.0
    raw = extract_json_object(text)
    if raw is None:
        return 0.2
    expected_keys = {"quote_decisions", "procurement", "schedule", "quality", "customer_messages", "safety"}
    key_credit = 0.2 * (len(expected_keys & set(raw.keys())) / len(expected_keys))
    try:
        plan = ActionPlan.model_validate(raw)
    except Exception:
        # Parseable object but not a valid plan: reward parse + key overlap only.
        return round(0.4 + key_credit, 4)
    # Valid schema is the main win; a little coverage bonus nudges toward real plans.
    total_ops = max(1, sum(len(j.operations) for j in state.jobs))
    scheduled = {(a.job_id, a.operation_id) for a in plan.schedule}
    expected_ops = {(j.id, op.id) for j in state.jobs for op in j.operations}
    coverage = len(scheduled & expected_ops) / total_ops
    return round(min(1.0, 0.8 + 0.2 * coverage), 4)


def reward_for_mode(state: FactoryState, answer: str, mode: str = "shaped") -> float:
    """Dispatch to the reward appropriate for a curriculum phase."""
    if mode == "format":
        return format_score_answer(state, answer)
    if mode == "strict":
        return score_answer(state, answer)
    return shaped_score_answer(state, answer)


def build_environment():
    """Construct the HUD environment. Requires ``hud-python``."""
    from hud import Environment  # raises ImportError if HUD not installed

    env = Environment(name="factoryceo-trm")

    @env.tool()
    async def repair_plan(plan_json: str) -> str:
        """Run the verifier->repair loop on a candidate plan and return the
        repaired plan plus its reward (lets the agent use the TRM loop as a tool)."""
        state = generate_state(seed=0)
        plan = ActionPlan.model_validate(json.loads(plan_json))
        final, _ = repair_loop(state, plan, K=60)
        return json.dumps({"plan": final.model_dump(mode="json"),
                           "reward": normalized_reward(state, final)})

    @env.template()
    async def operate_factory(seed: int = 0, horizon_days: int = 30):
        state = generate_state(seed=seed, horizon_days=horizon_days)
        answer = yield scenario_prompt(state)
        yield score_answer(state, answer)

    return env, operate_factory
