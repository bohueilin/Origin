"""Generate ShiftBench floor-specific SYNTH records.

This is the PleIAs-SYNTH-style path for the Staer/RAFS/SOAR floor corpus:

  open seed fixture -> randomized floor constraints -> teacher proposal
  -> verifier/repair -> rich checked JSONL record.

Fireworks is used when ``--teacher fireworks`` and FIREWORKS_API_KEY is present.
The verifier remains the grounding gate; records keep raw proposals, repair traces,
final verified plans, provenance, floor mappings, and GRPO rollout advantages.
"""

from __future__ import annotations

import argparse
import json
import os
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

# pylint: disable=import-error,no-name-in-module,wrong-import-position
from src.baselines import greedy  # noqa: E402
from src.data_export import build_episode  # noqa: E402
from src.generator import corrupt_plan  # noqa: E402
from src.job_sources import build_job_stream  # noqa: E402
from src.library import ARCHETYPES, STAER_PROVENANCE, feasible_state  # noqa: E402
from src.llm import FireworksPlanner, fireworks_key  # noqa: E402


RESULTS = ROOT / "results"


def _load_dotenv(path: Path = ROOT / ".env") -> None:
    if not path.exists():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def _teacher_candidate(teacher: str, state, seed: int):
    if teacher == "fireworks" and fireworks_key():
        return FireworksPlanner().plan(state), "fireworks"
    cand = corrupt_plan(state, greedy(state), seed=seed, n_corruptions=6)
    source = "deterministic" if teacher != "fireworks" else "deterministic_fallback_no_key"
    return cand, source


def _constraint_variant(arch: dict, base: int, variant: int) -> dict:
    rng = random.Random(f"floor-synth-{arch['id']}-{base}-{variant}")
    layout = dict(arch.get("layout", {}))
    horizon = int(arch.get("horizon", 30))
    stress = rng.choice(["rush_wave", "blocked_route", "station_backlog", "battery_pressure", "inventory_exception"])
    constraints = {
        "variant": variant,
        "stress": stress,
        "horizon_days": horizon,
        "layout": layout,
        "floorplan": arch.get("floorplan", {}),
        "job_stream_jobs": int(arch.get("job_stream_jobs") or arch.get("n_jobs", 20)),
    }
    if stress == "rush_wave":
        constraints["due_time_multiplier"] = round(rng.uniform(0.55, 0.8), 2)
        constraints["priority_bias"] = "outbound and affected-failure jobs first"
    elif stress == "blocked_route":
        constraints["temporary_no_go_zone"] = rng.choice(["main aisle", "dock throat", "packout bypass"])
        constraints["reroute_required"] = True
    elif stress == "station_backlog":
        constraints["backlogged_station"] = rng.choice(["pack", "inspect", "staging", "outbound"])
        constraints["overflow_station_required"] = True
    elif stress == "battery_pressure":
        constraints["charger_capacity"] = max(1, int(layout.get("robots", 2)) // 2)
        constraints["swap_robot_policy"] = True
    else:
        constraints["inventory_exception_rate"] = round(rng.uniform(0.05, 0.18), 2)
        constraints["cycle_count_required"] = True
    return constraints


def _record(arch: dict, *, seed: int, variant: int, teacher: str) -> dict:
    constraints = _constraint_variant(arch, seed, variant)
    stream_arch = {**arch, "job_stream_jobs": constraints["job_stream_jobs"]}
    job_stream = build_job_stream(stream_arch, base=seed + variant)
    state = feasible_state(arch, base=seed + variant)
    candidate, actual_teacher = _teacher_candidate(teacher, state, seed + variant)
    ep = build_episode(
        state,
        candidate,
        seed=seed + variant,
        K=60,
        constraints={
            "seed_id": arch["id"],
            "variant": variant,
            "teacher": actual_teacher,
            "floorplan": arch.get("floorplan", {}),
            "floor_constraints": constraints,
            "job_source": {
                "source": job_stream["source"],
                "floorplan_id": job_stream["floorplan_id"],
                "n_orders": job_stream["n_orders"],
                "n_order_lines": job_stream["n_order_lines"],
                "coherent": job_stream["coherence"]["ok"],
            },
        },
    )
    before = ep["verifier_before"]
    after = ep["verifier_after"]
    return {
        "synth_schema": "shiftbench-floor-synth-v1",
        "synth_id": f"shiftbench-floor-synth-{arch['id']}-{variant:04d}",
        "exercise": sorted(set(ep.get("exercise", []) + [
            "warehouse_floorplan",
            "route_constraints",
            "failure_recovery",
            "grpo_preference",
        ])),
        "teacher": actual_teacher,
        "open_seed": {
            "dataset": STAER_PROVENANCE["dataset"],
            "source": STAER_PROVENANCE["source"],
            "license": STAER_PROVENANCE["license"],
            "job_source": job_stream["dataset"],
            "job_source_url": job_stream["url"],
            "job_source_license": job_stream["license"],
        },
        "floor_profile": {
            "id": arch["id"],
            "label": arch["label"],
            "scenario": arch.get("scenario", ""),
            "floorplan": arch.get("floorplan", {}),
            "layout": arch.get("layout", {}),
            "mapping_profile": job_stream["mapping_profile"],
            "coherence": job_stream["coherence"],
        },
        "constraints": constraints,
        "query": {
            "messy_prompt": ep["observation"]["messy_prompt"],
            "job_source_summary": job_stream["summary"],
            "hud_rollout_summary": (
                f"measured GRPO mean {(job_stream.get('hud_rollout') or {}).get('measured', {}).get('hud_reward')}"
                if (job_stream.get("hud_rollout") or {}).get("measured") else ""
            ),
        },
        "raw_proposal": ep["initial_plan"],
        "negative": ep["negative"],
        "synthetic_reasoning": ep["repair_trace"],
        "synthetic_answer": ep["final_plan"],
        "verifier": {
            "before": before,
            "after": after,
            "reward_delta": round(float(after["reward"] - before["reward"]), 4),
            "grounded": after["n_hard"] == 0 and job_stream["coherence"]["ok"],
        },
        "grpo": (job_stream.get("hud_rollout") or {}).get("measured", {}).get("grpo"),
        "job_stream_sample": job_stream["jobs_sample"],
    }


def main() -> int:
    _load_dotenv()
    ap = argparse.ArgumentParser()
    ap.add_argument("--teacher", default="fireworks", choices=["fireworks", "deterministic"])
    ap.add_argument("--variants-per-floor", type=int, default=2)
    ap.add_argument("--max-floors", type=int, default=12)
    ap.add_argument("--floor-id", action="append", default=[], help="Limit generation to one or more Staer archetype ids.")
    ap.add_argument("--seed", type=int, default=1000)
    ap.add_argument("--out", default=str(RESULTS / "floor_synth.jsonl"))
    args = ap.parse_args()

    if args.teacher == "fireworks" and not fireworks_key():
        print("FIREWORKS_API_KEY not found; using deterministic fallback.", file=sys.stderr)

    records = []
    requested = {x for x in args.floor_id if x}
    if requested:
        floors = [a for a in ARCHETYPES if a["id"] in requested]
        missing = sorted(requested - {a["id"] for a in floors})
        if missing:
            print(f"Unknown floor id(s): {', '.join(missing)}", file=sys.stderr)
        if not floors:
            return 2
    else:
        floors = ARCHETYPES[: max(1, args.max_floors)]
    for i, arch in enumerate(floors):
        for variant in range(args.variants_per_floor):
            rec = _record(arch, seed=args.seed + i * 100, variant=variant, teacher=args.teacher)
            records.append(rec)
            print(
                f"{rec['synth_id']} teacher={rec['teacher']} "
                f"hard {rec['verifier']['before']['n_hard']}->{rec['verifier']['after']['n_hard']} "
                f"coherent={rec['floor_profile']['coherence']['ok']}"
            )

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", encoding="utf-8") as f:
        for rec in records:
            f.write(json.dumps(rec) + "\n")

    summary = {
        "records": len(records),
        "teacher_requested": args.teacher,
        "teachers_used": sorted({r["teacher"] for r in records}),
        "grounded": sum(1 for r in records if r["verifier"]["grounded"]),
        "hard_before": sum(r["verifier"]["before"]["n_hard"] for r in records),
        "hard_after": sum(r["verifier"]["after"]["n_hard"] for r in records),
        "grpo_rollouts": sum(r["grpo"]["n_rollouts"] for r in records),
        "out": str(out),
    }
    (out.with_suffix(".summary.json")).write_text(json.dumps(summary, indent=2) + "\n")
    print(json.dumps(summary, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
