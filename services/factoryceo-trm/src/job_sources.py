"""Warehouse job-source adapters for Staer-backed ShiftBench fixtures.

Staer gives us the spatial world. RAFS and SOAR give us the work: order streams,
SKU/pod mappings, source locations, stations, and timing. This module normalizes
those sources into one small schema the UI and optimizer can explain.
"""

from __future__ import annotations

import json
import os
import random
from dataclasses import asdict, dataclass
from functools import lru_cache
from pathlib import Path

_MEASURED_PATH = Path(os.environ.get(
    "FLOOR_HUD_RUNS",
    str(Path(__file__).resolve().parents[1] / "results" / "floor_hud_runs.json"),
))

_SECONDARY_MEASURED_PATH = Path(os.environ.get(
    "FLOOR_HUD_RUNS_GPTOSS",
    str(Path(__file__).resolve().parents[1] / "results" / "floor_hud_runs_gptoss.json"),
))

_TRAINING_EVIDENCE_PATHS = [
    Path(p) for p in os.environ.get("HUD_TRAINING_EVIDENCE", "").split(os.pathsep) if p
] or [
    Path(__file__).resolve().parents[1] / "results" / "hud_gptoss20b_self_grpo.json",
    Path(__file__).resolve().parents[1] / "results" / "hud_qwen_teacher_demo_bump.json",
    Path(__file__).resolve().parents[1] / "results" / "hud_floor_grpo_long.json",
    Path(__file__).resolve().parents[1] / "results" / "hud_floor_grpo_run.json",
    Path(__file__).resolve().parents[1] / "results" / "hud_floor_grpo_all.json",
    Path(__file__).resolve().parents[1] / "results" / "hud_floor_grpo.json",
    Path(__file__).resolve().parents[1] / "results" / "hud_train_curriculum_smoke.json",
]

_TRAINING_STATUS_PATH = Path(os.environ.get(
    "HUD_TRAINING_STATUS",
    str(Path(__file__).resolve().parents[1] / "results" / "hud_floor_grpo_long_status.json"),
))


@lru_cache(maxsize=1)
def _measured_runs() -> dict:
    """Load measured per-floor HUD runs (written by distill/hud_floor_eval.py).

    Returns a {floor_id: measured_run} map, or empty when no measured runs
    exist yet so the UI falls back to the projected long-horizon load."""
    try:
        return json.loads(_MEASURED_PATH.read_text(encoding="utf-8")).get("runs", {})
    except Exception:
        return {}


@lru_cache(maxsize=1)
def _secondary_measured_runs() -> dict:
    """Load alternate measured HUD runs (e.g. GPT-OSS student below Gemma eval)."""
    try:
        return json.loads(_SECONDARY_MEASURED_PATH.read_text(encoding="utf-8")).get("runs", {})
    except Exception:
        return {}


def _model_aliases(model: str | None) -> set[str]:
    if not model:
        return set()
    m = model.strip().lower()
    aliases = {m, m.split("/")[-1]}
    if "gpt-oss" in m:
        aliases.update({"openai/gpt-oss-20b", "gpt-oss-20b", "gpt-oss"})
    if "gemma" in m:
        aliases.update({"gemma-4-31b-it", "gemma"})
    if "qwen" in m:
        aliases.update({"qwen", "qwen3"})
    return aliases


def _models_match(left: str | None, right: str | None) -> bool:
    if not left or not right:
        return False
    la, ra = _model_aliases(left), _model_aliases(right)
    return bool(la & ra)


def _training_status() -> dict:
    try:
        return json.loads(_TRAINING_STATUS_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _evidence_from_training_data(data: dict, *, status: dict) -> dict:
    phases = data.get("phase_results") or []
    if not phases:
        return {}
    first = phases[0]
    last = phases[-1]
    return {
        "source_path": str(data.get("_source_path", "")),
        "model": data.get("model"),
        "teacher_demos": data.get("teacher_demos"),
        "reward_mode_compared": data.get("reward_mode_compared") or last.get("phase"),
        "baseline_reward": data.get("baseline_reward", last.get("baseline_reward")),
        "final_reward": data.get("final_reward", last.get("final_reward")),
        "lift": data.get("lift", last.get("lift")),
        "phase_lifts": data.get("phase_lifts") or {p.get("phase"): p.get("lift") for p in phases},
        "before_samples": first.get("baseline_samples", [])[:2],
        "after_samples": last.get("final_samples", [])[:2],
        "steps": [
            {
                "phase": p.get("phase"),
                "baseline_reward": p.get("baseline_reward"),
                "final_reward": p.get("final_reward"),
                "lift": p.get("lift"),
                "optim_steps": [
                    s.get("optim_step") for s in p.get("steps", [])
                    if s.get("optim_step") is not None
                ],
            }
            for p in phases
        ],
        "latest_hud_job_id": status.get("latest_job_id"),
        "latest_hud_job_url": status.get("latest_job_url"),
        "hud_jobs_dashboard_url": status.get("dashboard_url"),
        "task_coverage": status.get("task_coverage"),
        "training_status": status.get("status"),
    }


@lru_cache(maxsize=1)
def _training_evidence_by_model() -> dict[str, dict]:
    """Return {model_name: {floor_id: evidence}} for all training artifacts."""
    status = _training_status()
    out: dict[str, dict] = {}
    for path in _TRAINING_EVIDENCE_PATHS:
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        data = {**data, "_source_path": str(path)}
        evidence = _evidence_from_training_data(data, status=status)
        if not evidence:
            continue
        model = str(evidence.get("model") or path.stem)
        floors = data.get("floors") or []
        floor_map = {fid: evidence for fid in floors} if floors else {"*": evidence}
        out[model] = floor_map
    return out


def _training_evidence_for(*, model: str | None, floor_id: str | None) -> dict | None:
    if not model:
        return None
    for ev_model, floor_map in _training_evidence_by_model().items():
        if not _models_match(model, ev_model):
            continue
        if floor_id and floor_id in floor_map:
            return floor_map[floor_id]
        if "*" in floor_map:
            return floor_map["*"]
    return None


@lru_cache(maxsize=1)
def _training_evidence() -> dict:
    """Backward-compatible flat map: first training artifact keyed by floor id."""
    for floor_map in _training_evidence_by_model().values():
        if floor_map:
            return floor_map
    return {}


_REAL_POOL_PATH = Path(os.environ.get(
    "REAL_ORDER_POOLS",
    str(Path(__file__).resolve().parents[1] / "data" / "job_sources" / "order_pools.json"),
))

_MAPF_LAYOUT_PATH = Path(os.environ.get(
    "MAPF_LAYOUTS",
    str(Path(__file__).resolve().parents[1] / "data" / "floor_sources" / "mapf_layouts.json"),
))


@lru_cache(maxsize=1)
def _real_order_pools() -> dict:
    """Load normalized real order lines fetched by space/fetch_job_sources.py.

    Returns {"soar": [...], "rafs": [...], "armbench": [...]} or empty."""
    try:
        d = json.loads(_REAL_POOL_PATH.read_text(encoding="utf-8"))
        return {k: d[k].get("order_lines", []) for k in ("soar", "rafs", "armbench") if isinstance(d.get(k), dict)}
    except Exception:
        return {}


@lru_cache(maxsize=1)
def _mapf_layouts() -> dict:
    """Load parsed MovingAI MAPF warehouse layouts from fetch_mapf_layouts.py."""
    try:
        d = json.loads(_MAPF_LAYOUT_PATH.read_text(encoding="utf-8"))
        return d.get("layouts", {})
    except Exception:
        return {}


def _order_pool_for(source: str) -> tuple[list[dict], str]:
    """Pick the real order pool for a source."""
    pools = _real_order_pools()
    primary = pools.get(source, [])
    if len(primary) >= 10:
        prov = f"real:{source}"
        if source == "armbench":
            try:
                meta = json.loads(_REAL_POOL_PATH.read_text()).get("armbench", {})
                if meta.get("provenance", "").startswith("example"):
                    prov = meta["provenance"]
            except Exception:
                pass
        return primary, prov
    combined = pools.get("rafs", []) + pools.get("soar", []) + pools.get("armbench", [])
    if combined:
        keys = [k for k in ("rafs", "soar", "armbench") if pools.get(k)]
        return combined, "real:" + "+".join(keys)
    return [], "synthetic"


@dataclass(frozen=True)
class JobLine:
    sku_id: str
    quantity: int
    source_location: str
    pick_label: str = ""


@dataclass(frozen=True)
class WarehouseJob:
    job_id: str
    family: str
    release_time: int
    due_time: int
    target_station: str
    priority: int
    route_constraint: str
    lines: list[JobLine]


@dataclass(frozen=True)
class FailureEvent:
    event_id: str
    time: int
    kind: str
    location: str
    severity: int
    affected_jobs: list[str]
    recovery_action: str


SOURCES = {
    "rafs": {
        "label": "RAFS order batching + routing",
        "dataset": "RAFS warehouse order streams",
        "source": "https://github.com/xor-lab/rafs-datasets",
        "license": "research dataset; verify upstream terms before redistribution",
        "note": "layout XML, pod/SKU mappings, depot locations, distance matrices, and order XML normalized into pick jobs",
        "format": "layout_sku_*.xml + orders_*_sku_*.xml + pods_items_*.xml",
    },
    "soar": {
        "label": "SOAR RMFS order sequence",
        "dataset": "SOAR robotic mobile fulfillment benchmark",
        "source": "https://github.com/200815147/SOAR",
        "license": "research code/dataset; verify upstream terms before redistribution",
        "note": "layout JSON and order-sequence CSV normalized into storage-allocation and robot-scheduling jobs",
        "format": "layout configuration JSON + order sequence CSV",
    },
    "armbench": {
        "label": "ARMBench Amazon pick stream",
        "dataset": "ARMBench object identification (235K+ warehouse picks)",
        "source": "https://www.armbench.com/identification.html",
        "license": "CC BY 4.0; full dataset requires armbench.com registration",
        "note": "real Amazon warehouse singulation picks: container manifest + GT product ID mapped to tote→arm→tray pick jobs",
        "format": "Picks/*/container.json + annotation.json (GT_ID) + Reference_Images/",
    },
}


FLOORPLAN_PROFILES = {
    "plan-0": {
        "name": "returns / kitting cells",
        "source_prefix": "plan-0-cell",
        "station_prefix": "plan-0-bench",
        "station_roles": ["inspect", "repack", "restock", "scrap", "kit", "packout"],
        "object_classes": ["shelving", "bin", "tote", "bench", "pallet"],
        "route_constraints": ["human-only bench handoff", "returns inspection hold", "repack queue"],
        "job_families": [
            {"name": "returns_inspection", "source_area": "return-tote", "target_roles": ["inspect"], "constraints": ["returns inspection hold"], "sku_prefix": "RET", "max_lines": 2, "qty": (1, 4), "slack": (1, 3)},
            {"name": "repack_restock", "source_area": "repack-bin", "target_roles": ["repack", "restock"], "constraints": ["human-only bench handoff", "repack queue"], "sku_prefix": "RPK", "max_lines": 4, "qty": (1, 8), "slack": (2, 5)},
            {"name": "kitting_packout", "source_area": "kit-cell", "target_roles": ["kit", "packout"], "constraints": ["human-only bench handoff", "repack queue"], "sku_prefix": "KIT", "max_lines": 5, "qty": (2, 10), "slack": (2, 6)},
            {"name": "scrap_hold", "source_area": "hold-cage", "target_roles": ["scrap", "inspect"], "constraints": ["returns inspection hold"], "sku_prefix": "HOLD", "max_lines": 2, "qty": (1, 3), "slack": (1, 4)},
        ],
    },
    "plan-1": {
        "name": "cross-dock / bulk reserve",
        "source_prefix": "plan-1-reserve",
        "station_prefix": "plan-1-dock",
        "station_roles": ["inbound", "outbound", "bulk-break", "forward-pick", "staging"],
        "object_classes": ["rack", "pallet", "crate", "dock", "forklift_lane"],
        "route_constraints": ["forklift-only lane", "two-path dock bypass", "bulk reserve detour"],
        "job_families": [
            {"name": "inbound_to_staging", "source_area": "inbound-pallet", "target_roles": ["inbound", "staging"], "constraints": ["forklift-only lane", "two-path dock bypass"], "sku_prefix": "PAL", "max_lines": 5, "qty": (2, 12), "slack": (1, 4)},
            {"name": "bulk_break_forward_pick", "source_area": "bulk-reserve", "target_roles": ["bulk-break", "forward-pick"], "constraints": ["bulk reserve detour", "forklift-only lane"], "sku_prefix": "BULK", "max_lines": 6, "qty": (4, 16), "slack": (2, 6)},
            {"name": "outbound_dock_wave", "source_area": "reserve-rack", "target_roles": ["outbound", "staging"], "constraints": ["two-path dock bypass"], "sku_prefix": "XDOCK", "max_lines": 4, "qty": (2, 10), "slack": (1, 3)},
        ],
    },
    "plan-2": {
        "name": "pick-pack / outbound wave",
        "source_prefix": "plan-2-pickface",
        "station_prefix": "plan-2-station",
        "station_roles": ["pick", "pack", "sort", "carrier-stage", "charge"],
        "object_classes": ["rack", "shelving", "conveyor", "tote", "charging_station"],
        "route_constraints": ["narrow pick aisle", "charger contention", "carrier staging congestion"],
        "job_families": [
            {"name": "pick_pack_order", "source_area": "pickface", "target_roles": ["pick", "pack"], "constraints": ["narrow pick aisle"], "sku_prefix": "PICK", "max_lines": 4, "qty": (1, 10), "slack": (1, 5)},
            {"name": "sort_carrier_stage", "source_area": "sort-buffer", "target_roles": ["sort", "carrier-stage"], "constraints": ["carrier staging congestion"], "sku_prefix": "CARTON", "max_lines": 3, "qty": (1, 8), "slack": (1, 4)},
            {"name": "charger_replenishment", "source_area": "charge-buffer", "target_roles": ["charge", "pick"], "constraints": ["charger contention", "narrow pick aisle"], "sku_prefix": "REPL", "max_lines": 2, "qty": (2, 12), "slack": (2, 7)},
        ],
    },
    "plan-3": {
        "name": "cold-chain / quarantine / maintenance",
        "source_prefix": "plan-3-controlled",
        "station_prefix": "plan-3-gate",
        "station_roles": ["cold-room", "scan", "quarantine", "maintenance-bypass", "packout"],
        "object_classes": ["rack", "pallet", "drum", "scan_gate", "no_go_zone"],
        "route_constraints": ["temperature dwell limit", "quarantine hold", "maintenance aisle closure"],
        "job_families": [
            {"name": "cold_room_packout", "source_area": "cold-rack", "target_roles": ["cold-room", "packout"], "constraints": ["temperature dwell limit"], "sku_prefix": "COLD", "max_lines": 3, "qty": (1, 6), "slack": (1, 3)},
            {"name": "scan_quarantine", "source_area": "scan-tote", "target_roles": ["scan", "quarantine"], "constraints": ["quarantine hold"], "sku_prefix": "QC", "max_lines": 2, "qty": (1, 4), "slack": (1, 5)},
            {"name": "maintenance_bypass_move", "source_area": "controlled-zone", "target_roles": ["maintenance-bypass", "packout"], "constraints": ["maintenance aisle closure"], "sku_prefix": "BYP", "max_lines": 3, "qty": (1, 8), "slack": (2, 6)},
        ],
    },
    "mapf-pick": {
        "name": "MAPF grid warehouse / ARMBench pick face",
        "source_prefix": "mapf-tote",
        "station_prefix": "mapf-station",
        "station_roles": ["tote-pick", "singulation", "transfer-tray", "manifest-scan", "packout"],
        "object_classes": ["rack", "tote", "shelf", "aisle", "transfer_tray"],
        "route_constraints": ["narrow pick aisle", "multi-agent conflict", "singulation queue"],
        "job_families": [
            {"name": "armbench_singulation", "source_area": "storage-tote", "target_roles": ["tote-pick", "singulation"], "constraints": ["narrow pick aisle", "singulation queue"], "sku_prefix": "PICK", "max_lines": 1, "qty": (1, 1), "slack": (1, 2)},
            {"name": "transfer_to_tray", "source_area": "pick-face", "target_roles": ["transfer-tray", "manifest-scan"], "constraints": ["multi-agent conflict"], "sku_prefix": "XFER", "max_lines": 1, "qty": (1, 1), "slack": (1, 3)},
            {"name": "manifest_packout", "source_area": "scan-buffer", "target_roles": ["manifest-scan", "packout"], "constraints": ["singulation queue"], "sku_prefix": "AB", "max_lines": 2, "qty": (1, 3), "slack": (1, 4)},
        ],
    },
}


def _locations(prefix: str, count: int, roles: list[str] | None = None) -> list[str]:
    if not roles:
        return [f"{prefix}-{i:03d}" for i in range(1, count + 1)]
    return [f"{prefix}-{roles[(i - 1) % len(roles)]}-{i:02d}" for i in range(1, count + 1)]


def _location_slug(profile: dict, area: str) -> str:
    """Build a location id without repeating the last prefix token in the area slug."""
    prefix = profile["source_prefix"]
    p_parts = prefix.split("-")
    a_parts = area.split("-")
    if p_parts and a_parts and p_parts[-1] == a_parts[0]:
        a_parts = a_parts[1:]
    return "-".join(p_parts + a_parts)


def _location_label(loc_id: str) -> str:
    """Human-readable pick location for UI (dedupes repeated zone tokens)."""
    slug = loc_id
    if slug.startswith("plan-"):
        parts = slug.split("-")
        if len(parts) > 2 and parts[1].isdigit():
            slug = "-".join(parts[2:])
    m = slug.rsplit("-", 1)
    if len(m) == 2 and m[1].isdigit():
        body, num = m[0], int(m[1])
    else:
        body, num = slug, None
    tokens = [t for t in body.split("-") if t]
    deduped: list[str] = []
    for tok in tokens:
        if not deduped or deduped[-1] != tok:
            deduped.append(tok)
    label = " ".join(deduped)
    return f"{label} #{num}" if num is not None else label


def _family_locations(profile: dict, family: dict, count: int) -> list[str]:
    area = family.get("source_area") or profile["object_classes"][0]
    slug = _location_slug(profile, area)
    return [f"{slug}-{i:03d}" for i in range(1, count + 1)]


def _layout_pressure(layout: dict, profile: dict, n_jobs: int, horizon_days: int) -> dict:
    """Translate declared fixture layout into task pressure knobs.

    This is where floor plans stop being decoration: the same RAFS/SOAR order
    stream gets different time windows, failures, and GRPO rewards depending on
    dock capacity, aisle count, robots, no-go zones, and route complexity.
    """
    aisles = max(1, int(layout.get("aisles", 8)))
    docks = max(1, int(layout.get("docks", 2)))
    staging = max(1, int(layout.get("staging_lanes", 2)))
    robots = max(1, int(layout.get("robots", 2)))
    no_go = max(0, int(layout.get("no_go_zones", 1)))
    route_complexity = len(profile.get("route_constraints", []))
    station_roles = len(profile.get("station_roles", []))
    daily_orders = n_jobs / max(1, horizon_days)
    throughput_capacity = docks + staging + robots * 0.65
    congestion = min(1.0, daily_orders / max(1.0, throughput_capacity))
    robot_density = min(1.0, robots / max(1, aisles))
    blockage = min(1.0, (no_go + route_complexity * 0.45) / max(1.0, aisles + station_roles))
    dock_pressure = min(1.0, daily_orders / max(1.0, docks + staging * 0.55))
    pressure = round(min(1.0, 0.42 * congestion + 0.28 * blockage + 0.2 * dock_pressure + 0.1 * robot_density), 3)
    return {
        "pressure": pressure,
        "congestion": round(congestion, 3),
        "blockage": round(blockage, 3),
        "dock_pressure": round(dock_pressure, 3),
        "robot_density": round(robot_density, 3),
        "time_window_multiplier": round(max(0.62, 1.0 - pressure * 0.32), 3),
        "failure_multiplier": round(1.0 + pressure * 1.35 + blockage * 0.55, 3),
        "source_zone_multiplier": round(1.0 + min(0.8, aisles / 18) + blockage * 0.35, 3),
        "reward_penalty": round(pressure * 0.09 + blockage * 0.045, 3),
    }


def _build_jobs(source: str, *, seed: int, n_jobs: int, horizon_days: int,
                aisles: int, stations: int, max_lines: int, profile: dict,
                layout_pressure: dict, real_pool: list[dict] | None = None) -> list[WarehouseJob]:
    rng = random.Random(f"{source}-{seed}-{n_jobs}-{horizon_days}")
    pick_stations = _locations(profile["station_prefix"], max(stations, len(profile["station_roles"]), 2), profile["station_roles"])
    families = profile.get("job_families") or [{
        "name": profile["name"],
        "source_area": profile["object_classes"][0],
        "target_roles": profile["station_roles"],
        "constraints": profile["route_constraints"],
        "sku_prefix": source.upper(),
        "max_lines": max_lines,
        "qty": (1, 8 if source == "rafs" else 14),
        "slack": (1, 5 if source == "rafs" else 7),
    }]
    jobs: list[WarehouseJob] = []
    for i in range(n_jobs):
        family = families[i % len(families)]
        target_roles = family.get("target_roles") or profile["station_roles"]
        target_stations = [s for s in pick_stations if any(f"-{role}-" in s for role in target_roles)] or pick_stations
        route_constraints = family.get("constraints") or profile["route_constraints"]
        zone_count = max(12, int(aisles * 4 * float(layout_pressure["source_zone_multiplier"])))
        source_locations = _family_locations(profile, family, zone_count)
        wave = i // max(1, len(families))
        release_day = (wave * (1 + (i % 3)) + rng.randint(0, 2)) % max(1, max(2, horizon_days - 3))
        slack_min, slack_max = family.get("slack", (1, 5 if source == "rafs" else 7))
        slack_days = rng.randint(int(slack_min), int(slack_max))
        due_multiplier = float(layout_pressure["time_window_multiplier"])
        slack_hours = max(8, int(slack_days * 24 * due_multiplier))
        line_count = rng.randint(1, int(family.get("max_lines", max_lines)))
        qlo, qhi = family.get("qty", (1, 8 if source == "rafs" else 14))
        sku_prefix = family.get("sku_prefix", source.upper())
        lines = []
        for _ in range(line_count):
            if real_pool:
                entry = real_pool[rng.randrange(len(real_pool))]
                sku_id = f"{sku_prefix}-{entry['token']}"
                quantity = max(1, int(entry.get("quantity", 1)))
            else:
                sku_id = f"{sku_prefix}-{rng.randint(1000, 9999)}"
                quantity = rng.randint(int(qlo), int(qhi))
            src = rng.choice(source_locations)
            lines.append(JobLine(
                sku_id=sku_id,
                quantity=quantity,
                source_location=src,
                pick_label=_location_label(src),
            ))
        jobs.append(WarehouseJob(
            job_id=f"{source.upper()}-{i + 1:04d}",
            family=family["name"],
            release_time=release_day * 24 + rng.choice((0, 4, 8, 12)),
            due_time=min(horizon_days * 24, release_day * 24 + slack_hours + rng.choice((6, 10, 14))),
            target_station=rng.choice(target_stations),
            priority=rng.randint(1, 3),
            route_constraint=rng.choice(route_constraints),
            lines=lines,
        ))
    return jobs


def _failure_catalog(profile: dict) -> list[tuple[str, str]]:
    return [
        ("blocked_route", profile["route_constraints"][0]),
        ("station_backlog", profile["station_roles"][0]),
        ("robot_low_battery", "charging" if "charge" in profile["station_roles"] else "robot pool"),
        ("misplaced_sku", profile["object_classes"][0]),
        ("human_zone_hold", profile["route_constraints"][-1]),
        ("scan_exception", profile["station_roles"][-1]),
    ]


def _build_failures(*, seed: int, horizon_days: int, jobs: list[WarehouseJob],
                    profile: dict, robots: int, no_go_zones: int,
                    layout_pressure: dict) -> list[FailureEvent]:
    rng = random.Random(f"hud-failures-{seed}-{horizon_days}-{len(jobs)}")
    catalog = _failure_catalog(profile)
    base_failures = horizon_days // 5 + robots + no_go_zones + len(jobs) // 45
    n_failures = max(6, min(34, int(base_failures * float(layout_pressure["failure_multiplier"]))))
    out: list[FailureEvent] = []
    for i in range(n_failures):
        kind, anchor = rng.choice(catalog)
        affected = rng.sample([j.job_id for j in jobs], k=min(rng.randint(1, 4), len(jobs)))
        time = rng.randint(8, max(12, horizon_days * 24 - 8))
        action = {
            "blocked_route": "reroute around blocked aisle and reassign nearest robot",
            "station_backlog": "rebatch low-priority orders and open overflow station",
            "robot_low_battery": "send robot to charger and swap job to reserve robot",
            "misplaced_sku": "trigger cycle-count lookup and pick alternate source zone",
            "human_zone_hold": "pause AMR lane, wait for human handoff, then resume",
            "scan_exception": "escalate scan mismatch and quarantine affected tote",
        }[kind]
        out.append(FailureEvent(
            event_id=f"F{i + 1:03d}",
            time=time,
            kind=kind,
            location=anchor,
            severity=min(4, rng.randint(1, 3) + (1 if rng.random() < float(layout_pressure["pressure"]) else 0)),
            affected_jobs=affected,
            recovery_action=action,
        ))
    return sorted(out, key=lambda f: f.time)


def _build_grpo_group(*, source: str, seed: int, hud_reward: float,
                      jobs: list[WarehouseJob], failures: list[FailureEvent],
                      layout_pressure: dict) -> dict:
    rng = random.Random(f"grpo-{source}-{seed}-{len(jobs)}-{len(failures)}")
    policies = [
        ("raw_llm", -0.2 - float(layout_pressure["pressure"]) * 0.08, "one-shot LLM order with no verifier repair"),
        ("edd_greedy", -0.05 - float(layout_pressure["dock_pressure"]) * 0.035, "earliest due-date dispatch baseline"),
        ("zone_batching", 0.015 + float(layout_pressure["blockage"]) * 0.035, "batch nearby source zones before routing"),
        ("congestion_aware", 0.035 + float(layout_pressure["congestion"]) * 0.055, "avoid route constraints and busy stations"),
        ("failure_recovery", 0.05 + float(layout_pressure["pressure"]) * 0.04, "prioritize jobs affected by active failures"),
        ("rlf_student", 0.08 + float(layout_pressure["pressure"]) * 0.07, "student policy after group-relative feedback"),
    ]
    rollouts = []
    for i in range(16):
        name, delta, note = policies[i % len(policies)]
        order_pressure = 0.0007 * min(len(jobs), 180) - 0.0025 * len(failures)
        noise = rng.uniform(-0.025, 0.025)
        reward = round(max(0.08, min(0.99, hud_reward + delta + order_pressure + noise)), 3)
        late = max(0, int((1 - reward) * len(jobs) * rng.uniform(0.28, 0.45)))
        unsafe = max(0, int((1 - reward) * len(failures) * rng.uniform(0.05, 0.16)))
        rollouts.append({
            "rollout_id": f"R{i + 1:02d}",
            "policy": name,
            "reward": reward,
            "late_orders": late,
            "unsafe_events": unsafe,
            "note": note,
        })
    rewards = [r["reward"] for r in rollouts]
    mean = sum(rewards) / len(rewards)
    return {
        "n_rollouts": len(rollouts),
        "group_size": len(rollouts),
        "rollout_rewards": rewards,
        "advantages": [round(r - mean, 4) for r in rewards],
        "best_policy": max(rollouts, key=lambda r: r["reward"])["policy"],
        "candidate_rollouts": rollouts,
        "signal": "group-relative rewards for route batching, station balance, failure recovery, escalation, and unsafe-event avoidance",
    }


def _coherence_report(jobs: list[WarehouseJob], profile: dict) -> dict:
    roles = set(profile["station_roles"])
    constraints = set(profile["route_constraints"])
    families = {f["name"]: f for f in profile.get("job_families", [])}
    family_counts: dict[str, int] = {}
    bad_targets = []
    bad_constraints = []
    bad_sources = []
    for job in jobs:
        family_counts[job.family] = family_counts.get(job.family, 0) + 1
        fam = families.get(job.family)
        target_ok = any(f"-{role}-" in job.target_station for role in (fam or {}).get("target_roles", roles))
        if not target_ok:
            bad_targets.append(job.job_id)
        if job.route_constraint not in (fam or {}).get("constraints", constraints):
            bad_constraints.append(job.job_id)
        source_area = (fam or {}).get("source_area")
        if source_area and any(f"-{source_area}-" not in line.source_location for line in job.lines):
            bad_sources.append(job.job_id)
    return {
        "ok": not (bad_targets or bad_constraints or bad_sources),
        "families": family_counts,
        "expected_station_roles": sorted(roles),
        "expected_route_constraints": sorted(constraints),
        "bad_targets": bad_targets[:8],
        "bad_constraints": bad_constraints[:8],
        "bad_sources": bad_sources[:8],
    }


def _build_hud_rollout(*, source: str, seed: int, horizon_days: int,
                       jobs: list[WarehouseJob], failures: list[FailureEvent],
                       profile: dict, layout_pressure: dict) -> dict:
    events = []
    for j in jobs:
        events.append({
            "time": j.release_time,
            "type": "job_release",
            "label": f"{j.job_id} released",
            "job_id": j.job_id,
            "station": j.target_station,
            "lines": len(j.lines),
            "route_constraint": j.route_constraint,
        })
        events.append({
            "time": j.due_time,
            "type": "job_due",
            "label": f"{j.job_id} due",
            "job_id": j.job_id,
            "station": j.target_station,
            "priority": j.priority,
        })
    for f in failures:
        events.append({
            "time": f.time,
            "type": "failure",
            "label": f"{f.kind.replace('_', ' ')} at {f.location}",
            **asdict(f),
        })
        events.append({
            "time": min(horizon_days * 24, f.time + 2 + f.severity * 3),
            "type": "recovery",
            "label": f"recover {f.event_id}",
            "failure_id": f.event_id,
            "action": f.recovery_action,
            "affected_jobs": f.affected_jobs,
        })
    events = sorted(events, key=lambda e: (e["time"], e["type"]))

    late_pressure = sum(1 for j in jobs if (j.due_time - j.release_time) < 72)
    severe = sum(1 for f in failures if f.severity >= 3)
    completed = max(0, len(jobs) - max(1, severe // 2))
    late = min(completed, max(0, late_pressure // 3 + severe - len(failures) // 4))
    safety_stops = sum(1 for f in failures if f.kind in {"human_zone_hold", "blocked_route"})
    escalations = sum(1 for f in failures if f.kind in {"scan_exception", "misplaced_sku"})
    base_reward = 1.0 - (0.025 * late) - (0.035 * severe) - (0.015 * escalations) - float(layout_pressure["reward_penalty"])
    hud_reward = round(max(0.25, min(0.98, base_reward)), 3)
    checkpoints = []
    horizon_hours = max(1, horizon_days * 24)
    for day in range(0, horizon_days + 1, max(1, horizon_days // 6)):
        seen_failures = sum(1 for f in failures if f.time <= day * 24)
        due_seen = sum(1 for j in jobs if j.due_time <= day * 24)
        score = max(0.2, min(0.98, hud_reward + 0.08 - 0.012 * seen_failures - 0.004 * due_seen))
        checkpoints.append({"day": day, "reward": round(score, 3), "open_orders": max(0, len(jobs) - due_seen)})

    grpo = _build_grpo_group(source=source, seed=seed, hud_reward=hud_reward, jobs=jobs, failures=failures,
                             layout_pressure=layout_pressure)

    return {
        "kind": "offline_hud_long_horizon",
        "source": source,
        "horizon_days": horizon_days,
        "horizon_hours": horizon_hours,
        "taskset": f"{source.upper()} + Staer {profile['name']} failures",
        "n_events": len(events),
        "n_failures": len(failures),
        "timeline": events[:36],
        "failures": [asdict(f) for f in failures],
        "metrics": {
            "orders": len(jobs),
            "completed_orders": completed,
            "late_orders": late,
            "safety_stops": safety_stops,
            "escalations": escalations,
            "station_utilization": round(min(0.95, 0.52 + len(jobs) / 140 + len(failures) / 80), 3),
            "hud_reward": hud_reward,
            "layout_pressure": layout_pressure["pressure"],
        },
        "grpo": grpo,
        "layout_pressure": layout_pressure,
        "summary": (
            f"{horizon_days}-day HUD-style rollout: {len(jobs)} orders mixed with "
            f"{len(failures)} failures, {completed} completed, {late} late, "
            f"{grpo['n_rollouts']} GRPO candidates, reward {hud_reward}."
        ),
        "checkpoints": checkpoints,
    }


def build_job_stream(arch: dict, base: int) -> dict:
    """Return normalized warehouse jobs for a Staer/MAPF fixture archetype."""
    source = arch.get("job_source") or ("rafs" if base % 2 else "soar")
    if source not in SOURCES:
        source = "rafs"
    meta = SOURCES[source]
    layout = dict(arch.get("layout", {}))
    floorplan = dict(arch.get("floorplan", {}))
    floorplan_id = floorplan.get("id") or "plan-0"

    mapf = _mapf_layouts().get(floorplan_id)
    mapf_routes: list[dict] = []
    if mapf:
        layout = {**layout, **mapf.get("layout", {})}
        floorplan.setdefault("file", mapf.get("file"))
        floorplan.setdefault("mapf_source", mapf.get("source"))
        mapf_routes = mapf.get("mapf_routes_sample") or []
        plan_binding = mapf.get("plan_binding") or floorplan_id
        profile = FLOORPLAN_PROFILES.get("mapf-pick") if source == "armbench" else FLOORPLAN_PROFILES.get(plan_binding, FLOORPLAN_PROFILES["plan-0"])
        if source == "armbench":
            floorplan_id = floorplan_id  # keep mapf id for UI
    else:
        profile = FLOORPLAN_PROFILES.get(floorplan_id, FLOORPLAN_PROFILES["plan-0"])
        if source == "armbench" and floorplan_id.startswith("plan-"):
            profile = FLOORPLAN_PROFILES["mapf-pick"]
    n_jobs = int(arch.get("job_stream_jobs") or arch.get("n_jobs", 20))
    pressure = _layout_pressure(layout, profile, n_jobs, int(arch.get("horizon", 30)))
    real_pool, jobs_provenance = _order_pool_for(source)
    jobs = _build_jobs(
        source,
        seed=base,
        n_jobs=n_jobs,
        horizon_days=int(arch.get("horizon", 30)),
        aisles=int(layout.get("aisles", 8)),
        stations=int(layout.get("docks", 2)) + int(layout.get("staging_lanes", 2)),
        max_lines=1 if source == "armbench" else (5 if source == "rafs" else 3),
        profile=profile,
        layout_pressure=pressure,
        real_pool=real_pool,
    )
    line_count = sum(len(j.lines) for j in jobs)
    unique_skus = sorted({line.sku_id for j in jobs for line in j.lines})
    source_locations = sorted({line.source_location for j in jobs for line in j.lines})
    target_stations = sorted({j.target_station for j in jobs})
    route_constraints = sorted({j.route_constraint for j in jobs})
    families = sorted({j.family for j in jobs})
    coherence = _coherence_report(jobs, profile)
    due_times = [j.due_time for j in jobs]
    floor_id = arch.get("id")
    measured_raw = _measured_runs().get(floor_id)
    measured = dict(measured_raw) if isinstance(measured_raw, dict) else measured_raw
    if isinstance(measured, dict):
        train_ev = _training_evidence_for(model=measured.get("model"), floor_id=floor_id)
        if train_ev:
            measured["training_evidence"] = train_ev
    student_rollouts: list[dict] = []
    secondary_raw = _secondary_measured_runs().get(floor_id)
    if isinstance(secondary_raw, dict):
        secondary = dict(secondary_raw)
        sec_ev = _training_evidence_for(model=secondary.get("model"), floor_id=floor_id)
        if sec_ev:
            secondary["training_evidence"] = sec_ev
        student_rollouts.append(secondary)
    hud_rollout = None
    if measured or student_rollouts:
        hud_rollout = {
            "provenance": "measured",
            **({"measured": measured} if measured else {}),
            **({"student_rollouts": student_rollouts} if student_rollouts else {}),
        }
    stream = {
        "source": source,
        "adapter": meta["label"],
        "dataset": meta["dataset"],
        "url": meta["source"],
        "license": meta["license"],
        "format": meta["format"],
        "note": meta["note"],
        "floorplan_id": floorplan_id,
        "floorplan_file": floorplan.get("file"),
        "mapping_profile": {
            "name": profile["name"],
            "source_prefix": profile["source_prefix"],
            "station_prefix": profile["station_prefix"],
            "object_classes": profile["object_classes"],
            "job_families": families,
            "route_constraints": route_constraints,
            "mapping_quality": "plan-specific heuristic: order streams are constrained to fixture zones from this floor-plan backdrop",
        },
        "layout_conditioning": pressure,
        "coherence": coherence,
        "mapf_routes_sample": mapf_routes[:12] if mapf_routes else None,
        "mapf_layout_source": mapf.get("source") if mapf else None,
        "n_orders": len(jobs),
        "n_order_lines": line_count,
        "n_skus": len(unique_skus),
        "jobs_provenance": jobs_provenance,
        "n_source_locations": len(source_locations),
        "targets": target_stations,
        "due_time_min": min(due_times) if due_times else 0,
        "due_time_max": max(due_times) if due_times else 0,
        **({"hud_rollout": hud_rollout} if hud_rollout else {}),
        "objective": [
            "minimize travel distance",
            "maximize pick throughput",
            "reduce order lateness",
            "avoid robot congestion",
            "balance station utilization",
            "recover from mixed failures",
        ],
        "jobs": [asdict(j) for j in jobs],
        "jobs_sample": [asdict(j) for j in jobs[:12]],
    }
    grounding = ("SKU references and quantities drawn from real "
                 f"{jobs_provenance.split(':', 1)[-1].upper()} orders"
                 if jobs_provenance.startswith(("real", "example")) else "synthetic order content")
    stream["summary"] = (
        f"Imported {line_count} {source.upper()} order lines across {len(jobs)} orders ({grounding}), "
        f"mapped to {floorplan_id} ({profile['name']}): {len(source_locations)} source zones, "
        f"{len(target_stations)} stations, {len(route_constraints)} route constraints, "
        f"{len(families)} job families, layout pressure {pressure['pressure']}."
    )
    return stream
