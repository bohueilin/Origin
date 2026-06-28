"""The hosted floor library: Staer-style warehouse floor archetypes.

Each archetype maps a public warehouse-layout concept (Staer Robotics Warehouse)
onto the existing symbolic factory verifier: docks, aisles, staging lanes, no-go
zones, robots, and long-horizon pick/putaway work become the operating context
for a verified plan. Shared by the live /library endpoint and the static
precompute (space/build_library.py) so they stay in sync.
"""

from __future__ import annotations

import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from src.generator import load_seeds, amplify_seed, generate_state, corrupt_plan  # noqa: E402
from src.baselines import greedy                                                  # noqa: E402
from src.data_export import build_episode                                         # noqa: E402
from src.repair_loop import repair_loop                                           # noqa: E402
from src.verifier import evaluate                                                 # noqa: E402
from src.hud_env import hybrid_reward                                             # noqa: E402
from src.intake import _feasible                                                  # noqa: E402
from src.job_sources import build_job_stream                                      # noqa: E402
from isaac.plan_to_isaac import plan_to_tasks                                     # noqa: E402

STAER_PROVENANCE = {
    "dataset": "Staer Robotics Warehouse",
    "source": "https://github.com/StaerRobotics/warehouse",
    "license": "public research dataset; verify upstream license before redistribution",
    "note": "warehouse scene-graph inspired fixture, adapted into ShiftBench symbolic operations",
}


ARCHETYPES = [
    {"id": "staer_crossdock", "label": "Staer · cross-dock rush", "seed": "automotive_clips_brackets", "job_source": "rafs", "n_jobs": 24, "job_stream_jobs": 120, "horizon": 21,
     "floorplan": {"id": "plan-1", "file": "/factoryceo/floorplans/floorplan-1.png"},
     "layout": {"docks": 6, "aisles": 8, "staging_lanes": 4, "robots": 3, "no_go_zones": 2},
     "scenario": "Inbound pallets must be sorted to outbound lanes while a forklift-only zone blocks two shortest paths."},
    {"id": "staer_pickpack", "label": "Staer · pick-pack wave", "seed": "consumer_electronics_enclosures", "job_source": "soar", "n_jobs": 30, "job_stream_jobs": 150, "horizon": 30,
     "floorplan": {"id": "plan-2", "file": "/factoryceo/floorplans/floorplan-2.png"},
     "layout": {"docks": 4, "aisles": 12, "staging_lanes": 5, "robots": 4, "no_go_zones": 1},
     "scenario": "High-mix SKU picks, pack bench replenishment, and quality holds compete for the same narrow aisles."},
    {"id": "staer_coldchain", "label": "Staer · cold-chain staging", "seed": "medical_devices_eval", "job_source": "rafs", "n_jobs": 18, "job_stream_jobs": 96, "horizon": 30,
     "floorplan": {"id": "plan-3", "file": "/factoryceo/floorplans/floorplan-3.png"},
     "layout": {"docks": 3, "aisles": 7, "staging_lanes": 3, "robots": 2, "no_go_zones": 3},
     "scenario": "Temperature-sensitive lots need short dwell time, scan checkpoints, and blocked access near the chill room."},
    {"id": "staer_returnsort", "label": "Staer · returns triage", "seed": None, "job_source": "soar", "n_jobs": 26, "job_stream_jobs": 144, "horizon": 45,
     "floorplan": {"id": "plan-0", "file": "/factoryceo/floorplans/floorplan-0.png"},
     "layout": {"docks": 5, "aisles": 10, "staging_lanes": 6, "robots": 3, "no_go_zones": 2},
     "scenario": "Returns flow through inspect, re-pack, scrap, and restock zones with human-only benches."},
    {"id": "staer_nightops", "label": "Staer · night replenishment", "seed": None, "job_source": "rafs", "n_jobs": 34, "job_stream_jobs": 180, "horizon": 60,
     "floorplan": {"id": "plan-1", "file": "/factoryceo/floorplans/floorplan-1.png"},
     "layout": {"docks": 2, "aisles": 16, "staging_lanes": 4, "robots": 5, "no_go_zones": 4},
     "scenario": "Long-horizon replenishment must avoid cleaning zones, charger contention, and operator handoff windows."},
    {"id": "staer_charging", "label": "Staer · AMR charging loop", "seed": None, "job_source": "soar", "n_jobs": 22, "job_stream_jobs": 132, "horizon": 30,
     "floorplan": {"id": "plan-2", "file": "/factoryceo/floorplans/floorplan-2.png"},
     "layout": {"docks": 3, "aisles": 9, "staging_lanes": 3, "robots": 6, "no_go_zones": 2},
     "scenario": "AMRs must cycle through chargers without blocking the main pick aisle or starving outbound staging."},
    {"id": "staer_quarantine", "label": "Staer · quarantine hold", "seed": "medical_devices_eval", "job_source": "rafs", "n_jobs": 16, "job_stream_jobs": 90, "horizon": 21,
     "floorplan": {"id": "plan-3", "file": "/factoryceo/floorplans/floorplan-3.png"},
     "layout": {"docks": 2, "aisles": 6, "staging_lanes": 3, "robots": 2, "no_go_zones": 5},
     "scenario": "Suspect lots must wait in a quarantine zone until inspection clears the route to pack-out."},
    {"id": "staer_kitting", "label": "Staer · kitting cells", "seed": "consumer_electronics_enclosures", "job_source": "soar", "n_jobs": 28, "job_stream_jobs": 150, "horizon": 30,
     "floorplan": {"id": "plan-0", "file": "/factoryceo/floorplans/floorplan-0.png"},
     "layout": {"docks": 4, "aisles": 11, "staging_lanes": 7, "robots": 4, "no_go_zones": 1},
     "scenario": "Kitting cells need wave picks, component replenishment, and bench handoffs without starving pack stations."},
    {"id": "staer_bulk", "label": "Staer · bulk reserve", "seed": None, "job_source": "rafs", "n_jobs": 32, "job_stream_jobs": 168, "horizon": 45,
     "floorplan": {"id": "plan-1", "file": "/factoryceo/floorplans/floorplan-1.png"},
     "layout": {"docks": 5, "aisles": 14, "staging_lanes": 4, "robots": 3, "no_go_zones": 2},
     "scenario": "Bulk reserve pallets must be broken down into forward-pick shelves while forklift lanes stay human-only."},
    {"id": "staer_outbound", "label": "Staer · outbound wave", "seed": "automotive_clips_brackets", "job_source": "soar", "n_jobs": 36, "job_stream_jobs": 180, "horizon": 21,
     "floorplan": {"id": "plan-2", "file": "/factoryceo/floorplans/floorplan-2.png"},
     "layout": {"docks": 8, "aisles": 10, "staging_lanes": 8, "robots": 5, "no_go_zones": 2},
     "scenario": "A tight outbound wave must stage cartons by carrier, avoid dock congestion, and recover from a blocked lane."},
    {"id": "staer_maintenance", "label": "Staer · maintenance bypass", "seed": None, "job_source": "rafs", "n_jobs": 20, "job_stream_jobs": 108, "horizon": 30,
     "floorplan": {"id": "plan-3", "file": "/factoryceo/floorplans/floorplan-3.png"},
     "layout": {"docks": 3, "aisles": 8, "staging_lanes": 3, "robots": 3, "no_go_zones": 4},
     "scenario": "One aisle is down for maintenance, forcing robots to reroute around temporary tape and lift-truck traffic."},
    {"id": "staer_audit", "label": "Staer · inventory audit", "seed": None, "job_source": "soar", "n_jobs": 14, "job_stream_jobs": 90, "horizon": 14,
     "floorplan": {"id": "plan-0", "file": "/factoryceo/floorplans/floorplan-0.png"},
     "layout": {"docks": 2, "aisles": 9, "staging_lanes": 2, "robots": 2, "no_go_zones": 1},
     "scenario": "Cycle-count audit tasks must visit shelf zones without interrupting rush replenishment or outbound pick lanes."},
    {"id": "mapf_armbench_compact", "label": "MAPF · compact pick face + ARMBench", "seed": "consumer_electronics_enclosures", "job_source": "armbench", "n_jobs": 28, "job_stream_jobs": 140, "horizon": 21,
     "floorplan": {"id": "mapf-warehouse-10-20-10-2-1", "file": "/factoryceo/floorplans/mapf-warehouse-10-20-10-2-1.png"},
     "layout": {"docks": 4, "aisles": 10, "staging_lanes": 3, "robots": 4, "no_go_zones": 2},
     "scenario": "MovingAI warehouse grid with real Amazon singulation picks: tote manifest → arm transfer → tray, under multi-agent aisle conflicts."},
    {"id": "mapf_armbench_wide", "label": "MAPF · wide aisle wave + ARMBench", "seed": None, "job_source": "armbench", "n_jobs": 32, "job_stream_jobs": 160, "horizon": 30,
     "floorplan": {"id": "mapf-warehouse-10-20-10-2-2", "file": "/factoryceo/floorplans/mapf-warehouse-10-20-10-2-2.png"},
     "layout": {"docks": 4, "aisles": 12, "staging_lanes": 4, "robots": 5, "no_go_zones": 2},
     "scenario": "Wider MAPF warehouse variant: ARMBench pick stream routed through measured aisle geometry and MAPF even-scenario agent goals."},
    {"id": "mapf_armbench_large", "label": "MAPF · large fulfillment + ARMBench", "seed": "automotive_clips_brackets", "job_source": "armbench", "n_jobs": 40, "job_stream_jobs": 200, "horizon": 30,
     "floorplan": {"id": "mapf-warehouse-20-40-10-2-1", "file": "/factoryceo/floorplans/mapf-warehouse-20-40-10-2-1.png"},
     "layout": {"docks": 6, "aisles": 16, "staging_lanes": 5, "robots": 6, "no_go_zones": 3},
     "scenario": "Large MAPF fulfillment grid: high-volume ARMBench picks compete for dock staging and charger loops on a 321×123 tile map."},
    {"id": "mapf_armbench_xl", "label": "MAPF · XL reserve + ARMBench", "seed": None, "job_source": "armbench", "n_jobs": 36, "job_stream_jobs": 180, "horizon": 45,
     "floorplan": {"id": "mapf-warehouse-20-40-10-2-2", "file": "/factoryceo/floorplans/mapf-warehouse-20-40-10-2-2.png"},
     "layout": {"docks": 6, "aisles": 18, "staging_lanes": 6, "robots": 8, "no_go_zones": 4},
     "scenario": "XL MAPF warehouse (340×164): long-horizon ARMBench singulation with bulk reserve detours and multi-agent path conflicts."},
]


def _seed_by_id(sid: str | None):
    if not sid:
        return None
    return next((s for s in load_seeds() if s["id"] == sid), None)


def feasible_state(arch: dict, base: int = 1):
    """A feasible state for the archetype (retry variants until greedy+repair = 0)."""
    seed = _seed_by_id(arch["seed"])
    for v in range(10):
        try:
            st = (amplify_seed(seed, variant=base + v, horizon_days=arch["horizon"], n_jobs=arch["n_jobs"])
                  if seed else generate_state(seed=base + v, horizon_days=arch["horizon"], n_jobs=arch["n_jobs"]))
        except Exception:
            st = generate_state(seed=base + v, horizon_days=arch["horizon"], n_jobs=min(arch["n_jobs"], 30))
        if _feasible(st):
            return st
    return st


def build_run(arch: dict, base: int = 1) -> dict:
    st = feasible_state(arch, base)
    job_stream = build_job_stream(arch, base)
    cand = corrupt_plan(st, greedy(st), seed=base, n_corruptions=6)
    ep = build_episode(st, cand, seed=base, K=60)
    final, _ = repair_loop(st, cand, K=60)
    res = evaluate(st, final)
    m = res.metrics
    naive_hard = evaluate(st, cand).n_hard
    isaac_kw = {
        "layout": arch.get("layout"),
        "target_stations": job_stream.get("targets"),
        "source_locations": sorted({
            line["source_location"] for j in job_stream.get("jobs", []) for line in j.get("lines", [])
        }),
        "floorplan_id": arch.get("floorplan", {}).get("id"),
    }
    catalog = {
        "id": arch["id"], "label": arch["label"], "industry": arch["seed"] or "general",
        "machines": [mm.id for mm in st.machines], "n_jobs": len(st.jobs),
        "horizon_days": arch["horizon"],
        "layout": arch.get("layout", {}),
        "floorplan": arch.get("floorplan", {}),
        "job_source": job_stream,
        "scenario": arch.get("scenario", ""),
        "provenance": STAER_PROVENANCE,
        "metrics": {"reward": round(res.reward), "hard_violations": res.n_hard,
                    "on_time": round(m["on_time_rate"], 3), "utilization": round(m["utilization"], 3)},
        "verified": res.n_hard == 0, "naive_violations": naive_hard,
    }
    return {
        "episode": ep,
        "isaac_tasks": plan_to_tasks(st, final, **isaac_kw),
        "naive_isaac_tasks": plan_to_tasks(st, cand, **isaac_kw),
        "naive_verdict": {"hard_violations": naive_hard},
        "intake": {"industry": "warehouse_ops", "n_jobs": len(st.jobs),
                   "source": "staer_warehouse_fixture", "summary": arch["label"],
                   "layout": arch.get("layout", {}), "floorplan": arch.get("floorplan", {}),
                   "job_source": job_stream,
                   "provenance": STAER_PROVENANCE,
                   "scenario_method": f"{job_stream['source']}_warehouse_adapter",
                   "scenario_note": job_stream["summary"],
                   "scenario": arch.get("scenario", "")},
        "reward": hybrid_reward(st, final),
        "_catalog": catalog,
    }


def build_catalog() -> list[dict]:
    out = []
    for i, arch in enumerate(ARCHETYPES):
        try:
            out.append(build_run(arch, base=i + 1)["_catalog"])
        except Exception:
            continue
    return out
