"""Synthetic high-mix injection-molding / CNC factory generator.

Produces a seeded `FactoryState` whose constraints already embed realistic
"disruptions" (a maintenance window, a tight operator shift, jobs that need
procured material). A separate `corrupt_plan` helper injects known hard
violations into an otherwise-feasible plan -- this is how we manufacture the
messy "raw LLM output" the repair loop has to fix, and the labeled data for RFT.
"""

from __future__ import annotations

import json
import os
import random

from .schemas import (
    FactoryState, Machine, Operator, OperatorType, Material, Job, Operation,
    RFQ, Window, ActionPlan, ScheduleAssignment,
)

CAPS = ["mold", "cnc", "deburr"]
SKILL_OF_CAP = {"mold": "mold", "cnc": "cnc", "deburr": "deburr"}


def _day_shift_windows(horizon_days: int, start_h: int = 8, end_h: int = 18,
                       skip_days: tuple[int, ...] = ()) -> list[Window]:
    """Human day-shift availability, with optional absent days (disruption)."""
    out = []
    for d in range(horizon_days):
        if d in skip_days:
            continue
        out.append(Window(start=d * 24 + start_h, end=d * 24 + end_h))
    return out


def generate_state(seed: int = 0, horizon_days: int = 30, n_jobs: int = 14) -> FactoryState:
    rng = random.Random(seed)

    machines = [
        Machine(id="M1", capabilities=["mold"], uptime=0.95,
                maintenance=[Window(start=10 * 24, end=10 * 24 + 6)]),  # day-10 PM service
        Machine(id="M2", capabilities=["mold", "deburr"], uptime=0.9),
        Machine(id="M3", capabilities=["cnc"], uptime=0.92),
        Machine(id="M4", capabilities=["cnc", "deburr"], uptime=0.88),
    ]

    operators = [
        Operator(id="O1", type=OperatorType.human, skills=["mold", "deburr"],
                 availability=_day_shift_windows(horizon_days)),
        Operator(id="O2", type=OperatorType.human, skills=["cnc", "deburr"],
                 availability=_day_shift_windows(horizon_days, skip_days=(5,))),  # absent day 5
        Operator(id="O3", type=OperatorType.human, skills=["mold", "cnc"],
                 availability=_day_shift_windows(horizon_days)),
        # humanoid robot: full capability, runs 24/7 -> the embodiment the brain drives
        Operator(id="R1", type=OperatorType.robot, skills=["mold", "cnc", "deburr"],
                 availability=[Window(start=0, end=horizon_days * 24)]),
    ]

    materials = [
        Material(name="ABS", inventory_kg=220.0, lead_time_days=2, unit_cost=3.0),
        Material(name="Nylon", inventory_kg=80.0, lead_time_days=3, unit_cost=5.0),
        Material(name="PP", inventory_kg=40.0, lead_time_days=1, unit_cost=2.0),
    ]

    routings = [
        [("mold",)],
        [("mold",), ("deburr",)],
        [("mold",), ("cnc",), ("deburr",)],
        [("cnc",), ("deburr",)],
    ]

    jobs: list[Job] = []
    for i in range(n_jobs):
        jid = f"J{100 + i}"
        routing = rng.choice(routings)
        ops: list[Operation] = []
        prev = None
        for k, (cap,) in enumerate(routing):
            oid = f"op{k}"
            ops.append(Operation(
                id=oid, capability=cap, skill=SKILL_OF_CAP[cap],
                duration=rng.randint(2, 6),
                predecessors=[prev] if prev else [],
            ))
            prev = oid
        material = rng.choice(["ABS", "Nylon", "PP"])
        qty = rng.randint(500, 5000)
        due_day = rng.randint(3, horizon_days - 2)
        jobs.append(Job(
            id=jid, operations=ops, material=material,
            material_kg=round(qty * rng.uniform(0.01, 0.03), 1),
            quantity=qty, due_day=due_day,
            priority=rng.randint(1, 3),
            revenue=round(qty * rng.uniform(0.4, 0.9), 1),
            customer=rng.choice(["Acme", "Globex", "Initech", "Umbrella"]),
        ))

    rfqs = [
        RFQ(id="R17", customer="Acme", material="ABS", quantity=10000,
            due_day=min(horizon_days - 1, 12), target_price_per_unit=0.20,
            est_unit_cost=0.14),
        RFQ(id="R18", customer="Globex", material="Nylon", quantity=3000,
            due_day=min(horizon_days - 1, 20), target_price_per_unit=0.55,
            est_unit_cost=0.60),  # negative margin -> should be rejected
    ]

    return FactoryState(horizon_days=horizon_days, machines=machines,
                        operators=operators, materials=materials, jobs=jobs, rfqs=rfqs)


# --------------------------------------------------------------------------- #
# Seed corpus + amplification (SYNTH / Sillon recipe)
# --------------------------------------------------------------------------- #
SEEDS_PATH = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                          "seeds", "scenarios.json")


def load_seeds(split: str | None = None) -> list[dict]:
    """Load the seed corpus; optionally filter by split ('train' | 'eval')."""
    with open(SEEDS_PATH) as f:
        seeds = json.load(f)["seeds"]
    return [s for s in seeds if split is None or s.get("split") == split]


def amplify_seed(seed: dict, variant: int = 0, horizon_days: int = 30,
                 n_jobs: int = 14) -> FactoryState:
    """Amplify one realistic seed into a synthetic FactoryState with randomized
    constraints + disruptions (the SYNTH amplification step). Deterministic per
    (seed id, variant)."""
    rng = random.Random(f"{seed['id']}-{variant}")

    # disruptions (kept mild to preserve feasibility; robot R1 covers off-hours)
    rates = seed.get("disruption_rates", {})
    def fire(name):
        return rng.random() < rates.get(name, 0.0)

    machines = []
    for m in seed["machines"]:
        maint = [Window(start=s, end=e) for s, e in m.get("maintenance", [])]
        if fire("breakdown"):                       # inject an unplanned downtime
            d = rng.randint(2, horizon_days - 2)
            maint.append(Window(start=d * 24 + 9, end=d * 24 + 15))
        machines.append(Machine(id=m["id"], capabilities=m["capabilities"],
                                uptime=m["uptime"], maintenance=maint))

    operators = []
    for o in seed["operators"]:
        absent = list(o.get("absent_days", []))
        if o["type"] == "human" and fire("absence"):
            absent.append(rng.randint(0, horizon_days - 1))
        if o["type"] == "robot":
            avail = [Window(start=0, end=horizon_days * 24)]
        else:
            avail = _day_shift_windows(horizon_days, skip_days=tuple(absent))
        operators.append(Operator(id=o["id"], type=OperatorType(o["type"]),
                                  skills=o["skills"], availability=avail))

    materials = []
    for mat in seed["materials"]:
        lead = mat["lead_time_days"] + (2 if fire("late_material") else 0)
        materials.append(Material(name=mat["name"], inventory_kg=mat["inventory_kg"],
                                  lead_time_days=lead, unit_cost=mat["unit_cost"]))

    archetypes = seed["job_archetypes"]
    jobs: list[Job] = []
    for i in range(n_jobs):
        a = rng.choice(archetypes)
        ops, prev = [], None
        for k, cap in enumerate(a["routing"]):
            oid = f"op{k}"
            ops.append(Operation(id=oid, capability=cap, skill=SKILL_OF_CAP[cap],
                                 duration=rng.randint(2, 6),
                                 predecessors=[prev] if prev else []))
            prev = oid
        qty = rng.randint(*a["qty_range"])
        due = rng.randint(3, horizon_days - 2)
        if fire("rush_order"):
            due = max(2, due - rng.randint(2, 5))   # tightened deadline
        jobs.append(Job(
            id=f"J{100 + i}", operations=ops, material=a["material"],
            material_kg=round(qty * rng.uniform(*a["kg_per_unit"]), 1),
            quantity=qty, due_day=due, priority=rng.randint(1, 3),
            revenue=round(qty * rng.uniform(*a["price_per_unit"]), 1),
            customer=rng.choice(seed["customers"])))

    rfqs = []
    for j, r in enumerate(seed.get("rfqs", [])):
        rfqs.append(RFQ(id=f"R{17 + j}", customer=r["customer"], material=r["material"],
                        quantity=r["qty"], due_day=min(horizon_days - 1, 12),
                        target_price_per_unit=r["target_price_per_unit"],
                        est_unit_cost=r["est_unit_cost"]))

    return FactoryState(horizon_days=horizon_days, machines=machines,
                        operators=operators, materials=materials, jobs=jobs, rfqs=rfqs)


def generate_from_seeds(split: str = "train", n: int = 100, horizon_days: int = 30,
                        n_jobs: int = 14):
    """Yield (seed_id, FactoryState) amplified round-robin across the corpus split."""
    seeds = load_seeds(split)
    if not seeds:
        raise ValueError(f"no seeds for split={split}")
    for i in range(n):
        seed = seeds[i % len(seeds)]
        yield seed["id"], amplify_seed(seed, variant=i // len(seeds),
                                       horizon_days=horizon_days, n_jobs=n_jobs)


def messy_prompt(state: FactoryState, seed: int = 0) -> str:
    """Render the canonical state back into the kind of messy, mixed-format plant
    context an operator actually faces -- customer emails, operator notes,
    inventory dumps, machine logs, current jobs. This is panel 1 of the demo and
    the `observation.messy_prompt` field of each exported episode."""
    rng = random.Random(seed)
    lines: list[str] = []
    rfq = state.rfqs[0] if state.rfqs else None
    if rfq:
        lines.append(
            f"Customer email: Need {rfq.quantity:,} units by day {rfq.due_day}. "
            f"Same {rfq.material} as last time. Can you do "
            f"${rfq.target_price_per_unit:.2f}/unit?")
    bad = next((m for m in state.machines if m.uptime < 0.9), state.machines[-1])
    lines.append(f"Operator note: {bad.id} sounded rough this afternoon; "
                 f"might need maintenance.")
    inv = ", ".join(f"{m.name}={m.inventory_kg:g}kg" for m in state.materials)
    lines.append(f"Inventory: {inv}.")
    log = ", ".join(f"{m.id} uptime={int(m.uptime*100)}%" for m in state.machines)
    lines.append(f"Machine log: {log}.")
    absent = [o.id for o in state.operators
              if o.type.value == "human" and len(o.availability) < state.horizon_days]
    if absent:
        lines.append(f"HR: operator {absent[0]} out sick one day this period.")
    hot = sorted(state.jobs, key=lambda j: j.due_day)[:3]
    jobs_txt = "; ".join(
        f"{j.id} due day {j.due_day} "
        f"{'high' if j.priority >= 3 else 'low' if j.priority == 1 else 'med'} priority"
        for j in hot)
    lines.append(f"Current jobs: {jobs_txt}.")
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Corruption: turn a feasible plan into messy "raw LLM output"
# --------------------------------------------------------------------------- #
def corrupt_plan(state: FactoryState, plan: ActionPlan, seed: int = 0,
                 n_corruptions: int = 5) -> ActionPlan:
    """Inject a mix of known hard violations into a feasible plan.

    Mirrors the failure modes of an un-verified planner: machine overlap, wrong
    machine, unqualified operator, missing material, broken precedence,
    hallucinated entities.
    """
    rng = random.Random(seed)
    p = plan.copy_plan()
    if not p.schedule:
        return p

    kinds = ["overlap", "wrong_machine", "bad_operator", "drop_material",
             "break_precedence", "hallucinate", "make_late"]
    for _ in range(n_corruptions):
        kind = rng.choice(kinds)
        a = rng.choice(p.schedule)

        if kind == "overlap" and len(p.schedule) > 1:
            b = rng.choice(p.schedule)
            b.machine_id = a.machine_id
            b.start = a.start
            b.end = a.start + max(1, b.end - b.start)
        elif kind == "wrong_machine":
            a.machine_id = rng.choice([m.id for m in state.machines])
        elif kind == "bad_operator":
            a.operator_id = rng.choice([o.id for o in state.operators])
            a.overtime = False
        elif kind == "drop_material":
            p.procurement = []  # remove all procurement -> shortages/late
        elif kind == "break_precedence":
            a.start = 0
            a.end = max(1, a.end - a.start)
        elif kind == "hallucinate":
            a.machine_id = "M99"  # does not exist
        elif kind == "make_late":
            job = state.job(a.job_id)
            if job:
                push = (job.due_day + 5) * 24
                a.start = push
                a.end = push + 3
    return p
