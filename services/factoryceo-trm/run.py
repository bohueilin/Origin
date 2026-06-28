"""FactoryCEO-TRM driver.

Generates N synthetic factories, runs every method over a 30-day horizon, prints
the baseline-vs-TRM scoreboard, and writes the artifacts the web demo consumes:

  results/run_30day.json   -- averaged scoreboard + one detailed episode
  results/episodes.jsonl   -- one RFT-ready episode per scenario

Methods (mirrors the brief's baselines):
  base_llm  : raw, un-verified LLM output (we simulate it by corrupting greedy)
  greedy    : feasible EDD heuristic (reference)
  llm_retry : verifier feedback, capped at K=3 (partial repair)
  trm       : full recursive verifier->repair loop
"""

from __future__ import annotations

import argparse
import json
import os
import statistics

from src.generator import generate_state, corrupt_plan, messy_prompt
from src.baselines import greedy, base_plan
from src.verifier import evaluate
from src.repair_loop import repair_loop
from src.data_export import build_episode, write_jsonl

RESULTS_DIR = os.path.join(os.path.dirname(__file__), "results")


def _metrics_row(state, plan):
    return evaluate(state, plan).metrics


def run(n_scenarios: int = 25, horizon_days: int = 30, seed0: int = 0):
    methods = ["base_llm", "greedy", "llm_retry", "trm"]
    agg: dict[str, dict[str, list]] = {m: {} for m in methods}
    episodes: list[dict] = []

    for i in range(n_scenarios):
        state = generate_state(seed=seed0 + i, horizon_days=horizon_days)
        g = greedy(state)
        llm = corrupt_plan(state, g, seed=seed0 + i, n_corruptions=6)

        plans = {
            "base_llm": llm,
            "greedy": g,
            "llm_retry": repair_loop(state, llm, K=3)[0],
            "trm": repair_loop(state, llm, K=60)[0],
        }
        for m, p in plans.items():
            for k, v in _metrics_row(state, p).items():
                agg[m].setdefault(k, []).append(v)

        episodes.append(build_episode(
            state, llm, seed=seed0 + i, K=60,
            constraints={"seed": seed0 + i, "horizon_days": horizon_days,
                         "n_jobs": len(state.jobs), "n_corruptions": 6,
                         "teacher": "greedy+corrupt"}))

    # ---- averaged scoreboard ----
    def avg(method, key):
        xs = agg[method][key]
        return round(statistics.mean(xs), 2)

    scoreboard = []
    label = {"base_llm": "Base LLM (no verifier)", "greedy": "Greedy heuristic",
             "llm_retry": "LLM + verifier retry (K=3)",
             "trm": "FactoryCEO-TRM (recursive repair)"}
    for m in methods:
        scoreboard.append({
            "method": m,
            "label": label[m],
            "profit": avg(m, "profit"),
            "on_time_rate": avg(m, "on_time_rate"),
            "invalid_actions": avg(m, "n_hard_violations"),
            "customer_trust": avg(m, "customer_trust"),
            "utilization": avg(m, "utilization"),
            "safety_incidents": avg(m, "safety_incidents"),
        })

    # ---- print ----
    print(f"\n{horizon_days}-day simulated factory run "
          f"(avg over {n_scenarios} scenarios)\n")
    hdr = (f"{'method':<34}{'profit':>10}{'on-time':>9}{'invalid':>9}"
           f"{'trust':>7}{'unsafe':>8}")
    print(hdr)
    print("-" * len(hdr))
    for row in scoreboard:
        print(f"{row['label']:<34}{row['profit']:>10}"
              f"{row['on_time_rate']*100:>8.0f}%{row['invalid_actions']:>9}"
              f"{row['customer_trust']:>7.0f}{row['safety_incidents']:>8}")
    print()

    # ---- write artifacts ----
    os.makedirs(RESULTS_DIR, exist_ok=True)
    # pick the most illustrative episode (most repair steps) for the demo
    demo_idx = max(range(len(episodes)),
                   key=lambda j: len(episodes[j]["repair_trace"]))
    payload = {
        "meta": {"n_scenarios": n_scenarios, "horizon_days": horizon_days,
                 "model": "claude-opus-4-8 (optional adapter)"},
        "scoreboard": scoreboard,
        "episode": episodes[demo_idx],
    }
    with open(os.path.join(RESULTS_DIR, "run_30day.json"), "w") as f:
        json.dump(payload, f, indent=2)
    write_jsonl(os.path.join(RESULTS_DIR, "episodes.jsonl"), episodes)

    # humanoid task queue for Isaac Sim/Lab, from the demo scenario's repaired plan
    from isaac.plan_to_isaac import plan_to_tasks
    dstate = generate_state(seed=seed0 + demo_idx, horizon_days=horizon_days)
    dfinal, _ = repair_loop(dstate, corrupt_plan(dstate, greedy(dstate),
                                                 seed=seed0 + demo_idx, n_corruptions=6), K=60)
    with open(os.path.join(RESULTS_DIR, "isaac_tasks.json"), "w") as f:
        json.dump(plan_to_tasks(dstate, dfinal), f, indent=2)

    print(f"wrote results/run_30day.json, results/episodes.jsonl "
          f"({len(episodes)} episodes), results/isaac_tasks.json")
    return scoreboard


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--scenarios", type=int, default=25)
    ap.add_argument("--horizon", type=int, default=30)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()
    run(n_scenarios=args.scenarios, horizon_days=args.horizon, seed0=args.seed)
