"""Run frontier models on the task and report a pass@k distribution.

Per the brief, model calls go through OpenRouter (set OPENROUTER_API_KEY); the
three target models are configurable. A Fireworks path (FIREWORKS_API_KEY) is
included so the bench is runnable without OpenRouter for a quick capability check.

    python dev/run_models.py --provider openrouter --k 2
    python dev/run_models.py --provider fireworks  --k 2   # quick local check

Writes dev/results.json with per-model pass@k and the failure reasons — the
capability gap is the gap between the oracle (passes) and the models (mostly fail
on the hard-violation gate).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.request
from pathlib import Path

TASK = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(TASK))
from grade import grade_plan, load_state, parse_plan       # noqa: E402

OPENROUTER_MODELS = ["openai/gpt-5.5", "anthropic/claude-opus-4.8", "google/gemini-3.5-flash"]
FIREWORKS_MODELS = ["accounts/fireworks/models/qwen3p7-plus"]

SYS = (
    "You are an autonomous factory operations scheduler. Read the factory state "
    "and output ONE JSON object matching the ActionPlan schema with keys "
    "quote_decisions, procurement, schedule, quality, customer_messages, safety. "
    "Schedule EVERY operation of EVERY job as {job_id, operation_id, machine_id, "
    "operator_id, start, end} in absolute hours. Respect: no machine double-booking, "
    "machine capability match, operator availability+skill, material arrival before "
    "op start, maintenance windows, and operation precedence. JSON only, no prose."
)


def _call_openrouter(model: str, user: str) -> str:
    key = os.environ["OPENROUTER_API_KEY"]
    body = json.dumps({"model": model, "max_tokens": 16000, "temperature": 0.3,
                       "messages": [{"role": "system", "content": SYS},
                                    {"role": "user", "content": user}]}).encode()
    req = urllib.request.Request("https://openrouter.ai/api/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]


def _call_fireworks(model: str, user: str) -> str:
    key = os.environ["FIREWORKS_API_KEY"]
    body = json.dumps({"model": model, "max_tokens": 16000, "temperature": 0.3,
                       "response_format": {"type": "json_object"},
                       "messages": [{"role": "system", "content": SYS},
                                    {"role": "user", "content": user}]}).encode()
    req = urllib.request.Request("https://api.fireworks.ai/inference/v1/chat/completions", data=body,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read())["choices"][0]["message"]["content"]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--provider", choices=["openrouter", "fireworks"], default="fireworks")
    ap.add_argument("--k", type=int, default=2)
    args = ap.parse_args()

    state = load_state()
    meta = json.loads((TASK / "fixtures" / "meta.json").read_text())
    policy_path = TASK / "fixtures" / "policy.md"
    policy = policy_path.read_text() if policy_path.exists() else ""
    user = (f"{meta['messy_prompt']}\n\nOperating policy (must follow):\n{policy}\n\n"
            f"Factory state (JSON):\n{json.dumps(state.model_dump(mode='json'))}\n\n"
            "Return the ActionPlan JSON.")
    call = _call_openrouter if args.provider == "openrouter" else _call_fireworks
    models = OPENROUTER_MODELS if args.provider == "openrouter" else FIREWORKS_MODELS

    results = {}
    for m in models:
        attempts = []
        for i in range(args.k):
            try:
                plan = parse_plan(call(m, user))
                g = grade_plan(state, plan, meta["oracle_reward"], meta["quality_frac"])
            except Exception as e:
                g = {"passed": False, "feasible": False, "error": f"{type(e).__name__}: {e}"[:160]}
            attempts.append(g)
            print(f"[{m}] attempt {i+1}/{args.k}: pass={g.get('passed')} "
                  f"viol={g.get('hard_violations')} ratio={g.get('reward_ratio', 0):.2f} {g.get('error','')}")
        results[m] = {
            "pass_at_k": any(a.get("passed") for a in attempts),
            "pass_rate": sum(a.get("passed", False) for a in attempts) / len(attempts),
            "attempts": attempts,
        }
    out = {"provider": args.provider, "k": args.k, "oracle_reward": meta["oracle_reward"],
           "oracle_pass": True, "models": results}
    (TASK / "dev" / "results.json").write_text(json.dumps(out, indent=2))
    print("\nwrote dev/results.json")


if __name__ == "__main__":
    main()
