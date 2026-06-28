"""Curate a small set of GOLDEN HARD tasks for ShiftBench HUD GRPO.

GRPO needs few but *hard, learnable* prompts: tasks where a naive/base approach
fails but a good policy can succeed (so the rollout group has reward variance and
a gradient). Volume past a few hundred such tasks adds little; trivially-solved or
truly-infeasible prompts add none.

A task here is one ``operate_floor(floor_id, seed, reward_mode)`` instance. Its
difficulty is fully determined offline by ``feasible_state(arch, seed)``, so we
score every candidate with the verifier — no model rollout per candidate:

  * naive plan (``base_plan``) -> verifier n_hard / reward : does the base/raw
    approach fail hard?  (high n_hard = genuinely hard)
  * greedy plan (``greedy``)   -> verifier n_hard / reward : is there a clean,
    high-reward solution?  (n_hard == 0 and reward >> naive = LEARNABLE headroom)
  * total operations to schedule : coverage burden a weak model struggles with.

We keep only tasks that are hard for the base AND solvable by greedy, then rank by
difficulty and take a per-floor-balanced quota (diversity, no single capability
dominating). The result is a 200-500 task golden set written for the trainer.

    python distill/curate_hard_tasks.py --target 360 --candidates-per-floor 90
"""

from __future__ import annotations

import argparse
import json
import statistics
from datetime import datetime, timezone
from pathlib import Path

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=import-error,no-name-in-module,wrong-import-position
from src.baselines import base_plan, greedy  # noqa: E402
from src.hud_env import reward_for_mode  # noqa: E402
from src.library import ARCHETYPES, feasible_state  # noqa: E402
from src.verifier import evaluate  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "results" / "golden_hard_tasks.json"


def _plan_reward(state, plan, mode: str) -> float:
    """Reward the curriculum would assign to this plan (same space the model trains in)."""
    return reward_for_mode(state, json.dumps(plan.model_dump(mode="json")), mode)


def _score_candidate(floor_id: str, seed: int, mode: str) -> dict | None:
    arch = next((a for a in ARCHETYPES if a["id"] == floor_id), None)
    if arch is None:
        return None
    state = feasible_state(arch, base=seed)
    base_eval = evaluate(state, base_plan(state))
    greedy_eval = evaluate(state, greedy(state))
    total_ops = sum(len(j.operations) for j in state.jobs)
    strong_reward = _plan_reward(state, greedy(state), mode)
    weak_reward = _plan_reward(state, base_plan(state), mode)
    return {
        "floor_id": floor_id,
        "seed": seed,
        "reward_mode": mode,
        "difficulty": {
            "base_hard": int(base_eval.n_hard),
            "greedy_hard": int(greedy_eval.n_hard),
            "base_reward": round(float(base_eval.reward), 2),
            "greedy_reward": round(float(greedy_eval.reward), 2),
            "strong_reward": round(float(strong_reward), 4),
            "weak_reward": round(float(weak_reward), 4),
            "headroom": round(float(strong_reward - weak_reward), 4),
            "total_ops": total_ops,
            "n_jobs": len(state.jobs),
        },
    }


def _is_golden(c: dict, *, min_base_hard: int, min_strong: float, min_headroom: float) -> bool:
    d = c["difficulty"]
    # Hard for base (raw fails), solvable by a good policy (greedy feasible + decent
    # reward), and real headroom between weak and strong in the training reward space.
    return (
        d["base_hard"] >= min_base_hard
        and d["greedy_hard"] == 0
        and d["strong_reward"] >= min_strong
        and d["headroom"] >= min_headroom
    )


def _golden_score(c: dict) -> float:
    """Rank hard+learnable: base failure magnitude + coverage burden, weighted by
    how much head-room a good policy has to climb."""
    d = c["difficulty"]
    return d["base_hard"] + 1.5 * d["total_ops"] + 4.0 * d["headroom"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=int, default=360, help="Total golden tasks (200-500 recommended).")
    ap.add_argument("--candidates-per-floor", type=int, default=90)
    ap.add_argument("--reward-mode", default="strict", choices=["format", "shaped", "strict"],
                    help="Reward space difficulty is judged in (strict = final eval).")
    ap.add_argument("--seed-start", type=int, default=10000)
    ap.add_argument("--min-base-hard", type=int, default=3)
    ap.add_argument("--min-strong", type=float, default=0.5, help="Greedy must reach this reward (solvable).")
    ap.add_argument("--min-headroom", type=float, default=0.3)
    ap.add_argument("--floor-id", action="append", default=[])
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    floors = [a["id"] for a in ARCHETYPES]
    if args.floor_id:
        floors = [f for f in floors if f in set(args.floor_id)]
    quota = max(1, args.target // max(1, len(floors)))

    per_floor: dict[str, list[dict]] = {}
    n_scored = 0
    for fid in floors:
        cands = []
        for s in range(args.seed_start, args.seed_start + args.candidates_per_floor):
            c = _score_candidate(fid, s, args.reward_mode)
            n_scored += 1
            if c and _is_golden(c, min_base_hard=args.min_base_hard,
                                 min_strong=args.min_strong, min_headroom=args.min_headroom):
                c["golden_score"] = round(_golden_score(c), 3)
                cands.append(c)
        cands.sort(key=lambda x: x["golden_score"], reverse=True)
        per_floor[fid] = cands[:quota]
        print(f"[{fid}] golden {len(per_floor[fid])}/{len(cands)} pass "
              f"(scored {args.candidates_per_floor})", flush=True)

    tasks: list[dict] = []
    for fid in floors:
        for c in per_floor[fid]:
            c["task_id"] = f"golden-{fid}-{c['seed']}"
            tasks.append(c)

    hard = [t["difficulty"]["base_hard"] for t in tasks]
    ops = [t["difficulty"]["total_ops"] for t in tasks]
    head = [t["difficulty"]["headroom"] for t in tasks]
    payload = {
        "kind": "shiftbench_golden_hard_tasks",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "reward_mode": args.reward_mode,
        "target": args.target,
        "n_tasks": len(tasks),
        "n_floors": len(floors),
        "per_floor_counts": {fid: len(per_floor[fid]) for fid in floors},
        "selection": {
            "min_base_hard": args.min_base_hard,
            "min_strong_reward": args.min_strong,
            "min_headroom": args.min_headroom,
            "candidates_per_floor": args.candidates_per_floor,
            "n_scored": n_scored,
        },
        "difficulty_summary": {
            "base_hard_mean": round(statistics.fmean(hard), 2) if hard else 0,
            "base_hard_max": max(hard) if hard else 0,
            "total_ops_mean": round(statistics.fmean(ops), 2) if ops else 0,
            "headroom_mean": round(statistics.fmean(head), 3) if head else 0,
        },
        "tasks": tasks,
    }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2) + "\n")
    print(f"\nGolden set: {len(tasks)} tasks across {len(floors)} floors "
          f"(target {args.target}) -> {out_path}")
    print(f"difficulty: base_hard mean {payload['difficulty_summary']['base_hard_mean']} "
          f"(max {payload['difficulty_summary']['base_hard_max']}), "
          f"ops mean {payload['difficulty_summary']['total_ops_mean']}, "
          f"headroom mean {payload['difficulty_summary']['headroom_mean']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
