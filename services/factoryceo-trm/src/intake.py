"""Multi-modal intake: free-form user input -> a real, feasible FactoryState.

The user describes their factory floor (typed notes, pasted RFQs / machine logs,
uploaded CSV/text). We compile that into a *valid* FactoryState by mapping it onto
the seed corpus and amplifying it — so the result is always feasible (the verifier
+ TRM repair then plan it), while still reflecting the user's industry, scale, and
horizon. An LLM (Fireworks/Claude) extracts the knobs when available; a keyword/
number heuristic is the offline fallback.
"""

from __future__ import annotations

import re

from .schemas import FactoryState, Job, Machine, Material, Operation, Operator, OperatorType, Window
from .generator import load_seeds, amplify_seed, generate_state
from .baselines import greedy
from .verifier import evaluate
from .repair_loop import repair_loop
from .llm import chat_json
from .job_sources import build_job_stream


def _feasible(state: FactoryState) -> bool:
    """A scenario is usable only if the verifier-gated pipeline can drive it to
    zero hard violations. Some random configs (over-constrained maintenance /
    availability) are structurally infeasible; we reject those so the live path
    always yields a 0-violation plan."""
    if evaluate(state, greedy(state)).n_hard == 0:
        return True
    final, _ = repair_loop(state, greedy(state), K=200)
    return evaluate(state, final).n_hard == 0

INTAKE_SYS = (
    "You compile a factory operator's free-form description into JSON knobs for a "
    "scheduler. Output ONLY JSON: {\"industry\": one of "
    "[\"automotive\",\"electronics\",\"medical\",\"general\"], \"n_jobs\": int, "
    "\"horizon_days\": int, \"summary\": short string}. Infer sensible values from "
    "the text; never invent fields."
)

_INDUSTRY = {
    "automotive_clips_brackets": ["auto", "car", "vehicle", "bracket", "clip", "motor"],
    "consumer_electronics_enclosures": ["electronic", "phone", "device", "enclosure", "battery", "pcb"],
    "medical_devices_eval": ["medical", "surgical", "syringe", "device", "bio", "health"],
}

_WAREHOUSE_TERMS = {
    "staer", "warehouse", "floor plan", "floorplan", "rack", "racks", "aisle",
    "dock", "docks", "staging", "pick", "pack", "picking", "packing", "sku",
    "order lines", "order stream", "amr", "robot", "robots", "forklift", "rafs",
    "soar", "fulfillment", "cross-dock", "crossdock", "returns", "kitting",
    "quarantine", "charging", "pallet", "tote",
}

_WAREHOUSE_ARCHETYPES = [
    {"id": "staer_crossdock", "label": "Staer · cross-dock rush", "job_source": "rafs", "n_jobs": 24, "horizon": 21,
     "floorplan": {"id": "plan-1", "file": "/factoryceo/floorplans/floorplan-1.png"},
     "layout": {"docks": 6, "aisles": 8, "staging_lanes": 4, "robots": 3, "no_go_zones": 2},
     "scenario": "Inbound pallets must be sorted to outbound lanes while a forklift-only zone blocks two shortest paths.",
     "keywords": ["crossdock", "cross-dock", "dock", "pallet", "forklift"]},
    {"id": "staer_pickpack", "label": "Staer · pick-pack wave", "job_source": "soar", "n_jobs": 30, "horizon": 30,
     "floorplan": {"id": "plan-2", "file": "/factoryceo/floorplans/floorplan-2.png"},
     "layout": {"docks": 4, "aisles": 12, "staging_lanes": 5, "robots": 4, "no_go_zones": 1},
     "scenario": "High-mix SKU picks, pack bench replenishment, and quality holds compete for the same narrow aisles.",
     "keywords": ["pick", "pack", "sku", "order", "fulfillment", "outbound"]},
    {"id": "staer_coldchain", "label": "Staer · cold-chain staging", "job_source": "rafs", "n_jobs": 18, "horizon": 30,
     "floorplan": {"id": "plan-3", "file": "/factoryceo/floorplans/floorplan-3.png"},
     "layout": {"docks": 3, "aisles": 7, "staging_lanes": 3, "robots": 2, "no_go_zones": 3},
     "scenario": "Temperature-sensitive lots need short dwell time, scan checkpoints, and blocked access near the chill room.",
     "keywords": ["cold", "temperature", "quarantine", "scan", "medical"]},
    {"id": "staer_returnsort", "label": "Staer · returns triage", "job_source": "soar", "n_jobs": 26, "horizon": 45,
     "floorplan": {"id": "plan-0", "file": "/factoryceo/floorplans/floorplan-0.png"},
     "layout": {"docks": 5, "aisles": 10, "staging_lanes": 6, "robots": 3, "no_go_zones": 2},
     "scenario": "Returns flow through inspect, re-pack, scrap, and restock zones with human-only benches.",
     "keywords": ["return", "returns", "inspect", "repack", "kitting", "bench"]},
]


def _first_int(text: str, lo: int = 4, hi: int = 40) -> int | None:
    for m in re.findall(r"\b(\d{1,3})\b", text):
        v = int(m)
        if lo <= v <= hi:
            return v
    return None


def _stable_hash(text: str) -> int:
    h = 0
    for c in text:
        h = (h * 131 + ord(c)) % 1_000_000
    return h


def _warehouse_requested(text: str) -> bool:
    h = (text or "").lower()
    return any(term in h for term in _WAREHOUSE_TERMS)


def _pick_warehouse_arch(text: str, horizon_days: int | None) -> dict:
    h = (text or "").lower()
    scored = []
    for arch in _WAREHOUSE_ARCHETYPES:
        score = sum(1 for k in arch.get("keywords", []) if k in h)
        if arch["job_source"] in h:
            score += 2
        if arch["floorplan"]["id"] in h or arch["id"] in h:
            score += 4
        scored.append((score, arch))
    arch = max(scored, key=lambda x: x[0])[1].copy()
    if horizon_days:
        arch["horizon"] = max(7, min(60, int(horizon_days)))
    return arch


def _warehouse_windows(horizon_days: int) -> list[Window]:
    return [Window(start=0, end=horizon_days * 24)]


def _warehouse_state_from_stream(stream: dict, arch: dict) -> FactoryState:
    horizon = int(arch.get("horizon", 30))
    layout = arch.get("layout", {})
    robots = max(1, int(layout.get("robots", 3)))
    stations = max(2, int(layout.get("docks", 3)) + int(layout.get("staging_lanes", 2)))
    aisles = max(3, int(layout.get("aisles", 8)))

    machines = [
        Machine(id="WMS-PICKFACE", capabilities=["pick", "cycle_count"], uptime=0.96),
        Machine(id="AMR-ROUTE-MESH", capabilities=["route", "recover", "replenish"], uptime=0.91),
        Machine(id="PACK-STAGE-01", capabilities=["stage", "pack", "inspect"], uptime=0.94),
    ]
    machines.extend(
        Machine(id=f"DOCK-{i:02d}", capabilities=["dock", "stage", "pack"], uptime=0.95)
        for i in range(1, min(stations, 8) + 1)
    )
    if layout.get("no_go_zones", 0):
        machines.append(Machine(
            id="NO-GO-BYPASS",
            capabilities=["route", "recover"],
            uptime=0.86,
            maintenance=[Window(start=8 * 24, end=8 * 24 + 8)] if horizon > 10 else [],
        ))

    operators = [
        Operator(id=f"AMR-{i:02d}", type=OperatorType.robot,
                 skills=["pick", "route", "stage", "pack", "recover", "replenish", "cycle_count", "dock", "inspect"],
                 availability=_warehouse_windows(horizon))
        for i in range(1, robots + 1)
    ]
    operators.extend([
        Operator(id="FLOOR-LEAD", type=OperatorType.human,
                 skills=["stage", "pack", "inspect", "dock", "recover"],
                 availability=[Window(start=d * 24 + 6, end=d * 24 + 18) for d in range(horizon)]),
        Operator(id="EXCEPTION-DESK", type=OperatorType.human,
                 skills=["inspect", "recover", "cycle_count"],
                 availability=[Window(start=d * 24 + 8, end=d * 24 + 20) for d in range(horizon)]),
    ])

    materials = [
        Material(name="warehouse_skus", inventory_kg=100000.0, lead_time_days=0, unit_cost=1.0),
        Material(name="empty_totes", inventory_kg=5000.0, lead_time_days=1, unit_cost=0.2),
    ]

    jobs: list[Job] = []
    for raw in stream.get("jobs", []):
        lines = raw.get("lines") or []
        qty = sum(int(line.get("quantity", 1)) for line in lines) or 1
        line_count = max(1, len(lines))
        due_day = max(1, min(horizon - 1, int(raw.get("due_time", 24)) // 24))
        route_constraint = str(raw.get("route_constraint") or "warehouse route")
        target = str(raw.get("target_station") or "pack station")
        jobs.append(Job(
            id=str(raw.get("job_id")),
            operations=[
                Operation(id="pick", capability="pick", skill="pick", duration=min(8, 1 + line_count)),
                Operation(id="route", capability="route", skill="route", duration=min(10, max(2, aisles // 3)), predecessors=["pick"]),
                Operation(id="stage", capability="stage", skill="stage", duration=2, predecessors=["route"]),
                Operation(id="inspect", capability="inspect", skill="inspect", duration=1 if raw.get("priority", 1) < 3 else 2, predecessors=["stage"]),
            ],
            material="warehouse_skus",
            material_kg=float(qty),
            quantity=qty,
            due_day=due_day,
            priority=int(raw.get("priority", 1)),
            revenue=round(75.0 + qty * 12.0 + line_count * 25.0, 1),
            customer=f"{target} · {route_constraint}",
        ))

    return FactoryState(horizon_days=horizon, machines=machines,
                        operators=operators, materials=materials, jobs=jobs, rfqs=[])


def warehouse_intake_state(text: str = "", files_text: str = "",
                           horizon_days: int | None = None) -> tuple[FactoryState, dict] | None:
    combined = f"{text}\n{files_text}".strip()
    if not _warehouse_requested(combined):
        return None
    arch = _pick_warehouse_arch(combined, horizon_days)
    base = _stable_hash(combined or arch["id"]) % 10000
    stream = build_job_stream(arch, base=base)
    state = _warehouse_state_from_stream(stream, arch)
    return state, {
        "source": "staer_warehouse_fixture",
        "industry": "warehouse_ops",
        "n_jobs": len(state.jobs),
        "requested_n_jobs": arch.get("n_jobs"),
        "horizon_days": state.horizon_days,
        "summary": arch["label"],
        "layout": arch.get("layout", {}),
        "floorplan": arch.get("floorplan", {}),
        "job_source": stream,
        "scenario": arch.get("scenario", ""),
        "scenario_method": f"{stream['source']}_floorplan_orders",
        "scenario_note": stream["summary"],
    }


def _pick_seed(seeds: list[dict], hint: str) -> dict | None:
    h = (hint or "").lower()
    if h.split(maxsplit=1)[0:1] == ["general"]:
        return None
    for s in seeds:
        if any(k in h for k in _INDUSTRY.get(s["id"], [])):
            return s
    return None


def intake_state(text: str = "", files_text: str = "",
                 horizon_days: int | None = None) -> tuple[FactoryState, dict]:
    combined = f"{text}\n{files_text}".strip()
    seeds = load_seeds()
    if not combined:
        return generate_state(seed=0), {"source": "default", "industry": "default",
                                        "n_jobs": 14, "horizon_days": 30,
                                        "scenario_method": "generic_synthetic",
                                        "scenario_note": "No operating context was supplied; this is a generic synthetic scheduler scenario."}

    knobs = chat_json(INTAKE_SYS, combined[:6000]) or {}
    source = "llm" if knobs else "heuristic"
    inferred_industry = knobs.get("industry") or ""
    hint = f"{inferred_industry} {combined}"
    seed = _pick_seed(seeds, hint)
    n_jobs = int(knobs.get("n_jobs") or _first_int(combined) or 14)
    n_jobs = max(4, min(40, n_jobs))
    horizon = int(horizon_days or knobs.get("horizon_days") or 30)
    horizon = max(7, min(60, horizon))

    # Build a feasible scenario: try a few variant bumps, then seed fallbacks,
    # so the live path is GUARANTEED to compile to a 0-violation plan.
    base = _stable_hash(combined)
    state = None
    for k in range(8):
        try:
            cand = (amplify_seed(seed, variant=base + k, horizon_days=horizon, n_jobs=n_jobs)
                    if seed else generate_state(seed=(base + k) % 10000, horizon_days=horizon, n_jobs=n_jobs))
        except Exception:
            cand = generate_state(seed=(base + k) % 10000, horizon_days=horizon, n_jobs=n_jobs)
        if _feasible(cand):
            state = cand
            break
    if state is None:
        # last resort: known-good generator seeds always converge
        for s in range(50):
            cand = generate_state(seed=s, horizon_days=horizon, n_jobs=min(n_jobs, 30))
            if _feasible(cand):
                state = cand; source = "fallback"; break
        else:
            state = generate_state(seed=0, horizon_days=horizon); source = "fallback"
    industry = seed["id"] if seed else "general_synthetic"
    method = "seed_amplification" if seed else "generic_synthetic"
    note = (
        f"Jobs are synthetic scheduler tasks generated by amplifying the {seed['id']} seed, not observed jobs from the upload."
        if seed else
        "Jobs are generic synthetic scheduler tasks generated from extracted knobs; no domain seed matched the upload."
    )
    return state, {"source": source, "industry": industry, "n_jobs": len(state.jobs),
                   "requested_n_jobs": n_jobs, "horizon_days": horizon,
                   "summary": knobs.get("summary"),
                   "scenario_method": method,
                   "scenario_note": note}
