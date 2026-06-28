"""Verifier + simulator-scored reward for FactoryCEO-TRM.

This is the core product. Given a `FactoryState` and an `ActionPlan` it returns:

  * a list of **structured hard-constraint errors** (the repair loop's feedback), and
  * a scalar **soft reward** plus a human-readable breakdown and scoreboard metrics.

The hard constraints are what make unattended ("CEO away for 2 weeks") operation
trustworthy: no plan with machine overlap, an unqualified operator, missing
material, or a hallucinated entity ever survives -- the repair loop must drive the
error list to empty before a plan is considered executable.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field

from .schemas import FactoryState, ActionPlan, ScheduleAssignment, deadline_hour

# ---- reward magnitudes (tuned so violations dominate, repairs pay off) ------
HARD_VIOLATION_PENALTY = 800.0
ON_TIME_BONUS = 200.0
LATENESS_PER_HOUR = 8.0
LATENESS_CAP = 600.0
TRUST_PENALTY_LATE = 300.0
TRUST_PENALTY_LATE_WARNED = 100.0
OVERTIME_COST = 150.0
EXPEDITE_SURCHARGE = 0.5          # fraction of material cost added when expedited
SCRAP_FRACTION = 0.6             # scrap cost as fraction of job revenue
REWORK_COST = 120.0
UTILIZATION_BONUS = 250.0        # times utilization fraction

# ---- safety terms: reward = profit + safety (penalties for unsafe autonomy) --
SAFE_UPTIME = 0.9                # machines below this are "degraded"
SAFETY_PENALTY = 280.0          # per uncontrolled hazard
SAFETY_BONUS = 60.0             # per hazard the brain explicitly controlled


@dataclass
class VError:
    """A single structured hard-constraint violation."""
    type: str
    detail: str
    refs: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        return {"type": self.type, "detail": self.detail, "refs": self.refs}


@dataclass
class EvalResult:
    errors: list[VError]
    reward: float
    breakdown: dict
    metrics: dict

    @property
    def n_hard(self) -> int:
        return len(self.errors)

    def errors_as_dicts(self) -> list[dict]:
        return [e.as_dict() for e in self.errors]


# --------------------------------------------------------------------------- #
# Material arrival model
# --------------------------------------------------------------------------- #
def _arrival_hour(lead_time_days: int, expedite: bool) -> int:
    if expedite:
        lead_time_days = max(1, (lead_time_days + 1) // 2)
    return lead_time_days * 24


def _material_availability(state: FactoryState, plan: ActionPlan) -> dict:
    """For each material: on-hand qty and the earliest arrival hour of procured qty.

    Returns {name: {"onhand": kg, "procured": kg, "arrival": hour|None}}.
    """
    avail: dict[str, dict] = {}
    for m in state.materials:
        avail[m.name] = {"onhand": m.inventory_kg, "procured": 0.0, "arrival": None}
    for po in plan.procurement:
        mat = state.material_by_name(po.material)
        if mat is None:
            continue  # hallucinated material -- caught separately
        a = _arrival_hour(mat.lead_time_days, po.expedite)
        rec = avail[po.material]
        rec["procured"] += po.quantity_kg
        rec["arrival"] = a if rec["arrival"] is None else min(rec["arrival"], a)
    return avail


# --------------------------------------------------------------------------- #
# Hard constraints
# --------------------------------------------------------------------------- #
def find_errors(state: FactoryState, plan: ActionPlan) -> list[VError]:
    errors: list[VError] = []
    horizon_h = state.horizon_days * 24

    # group assignments per machine / operator for overlap checks
    by_machine: dict[str, list[ScheduleAssignment]] = defaultdict(list)
    by_operator: dict[str, list[ScheduleAssignment]] = defaultdict(list)

    for a in plan.schedule:
        job = state.job(a.job_id)
        op = state.operation(a.job_id, a.operation_id)
        machine = state.machine(a.machine_id)
        operator = state.operator(a.operator_id)

        # --- hallucinated entities -------------------------------------- #
        if job is None:
            errors.append(VError("unknown_job", f"job {a.job_id} does not exist",
                                 {"job_id": a.job_id}))
            continue
        if op is None:
            errors.append(VError("unknown_operation",
                                 f"operation {a.operation_id} not in job {a.job_id}",
                                 {"job_id": a.job_id, "operation_id": a.operation_id}))
            continue
        if machine is None:
            errors.append(VError("unknown_machine", f"machine {a.machine_id} does not exist",
                                 {"machine_id": a.machine_id, "job_id": a.job_id,
                                  "operation_id": a.operation_id}))
            continue
        if operator is None:
            errors.append(VError("unknown_operator", f"operator {a.operator_id} does not exist",
                                 {"operator_id": a.operator_id, "job_id": a.job_id,
                                  "operation_id": a.operation_id}))
            continue

        by_machine[a.machine_id].append(a)
        by_operator[a.operator_id].append(a)

        # --- timing sanity --------------------------------------------- #
        if a.end <= a.start or a.start < 0 or a.end > horizon_h:
            errors.append(VError("bad_window",
                                 f"{a.job_id}/{a.operation_id} window [{a.start},{a.end}) invalid",
                                 {"job_id": a.job_id, "operation_id": a.operation_id}))

        # --- capability ------------------------------------------------- #
        if op.capability not in machine.capabilities:
            errors.append(VError("capability_mismatch",
                                 f"{a.machine_id} lacks capability '{op.capability}' "
                                 f"for {a.job_id}/{a.operation_id}",
                                 {"job_id": a.job_id, "operation_id": a.operation_id,
                                  "machine_id": a.machine_id, "capability": op.capability}))

        # --- operator qualification ------------------------------------ #
        if op.skill not in operator.skills:
            errors.append(VError("operator_unqualified",
                                 f"{a.operator_id} not skilled in '{op.skill}' "
                                 f"for {a.job_id}/{a.operation_id}",
                                 {"job_id": a.job_id, "operation_id": a.operation_id,
                                  "operator_id": a.operator_id, "skill": op.skill}))

        # --- operator availability (unless overtime authorized) -------- #
        if not a.overtime:
            ok = any(w.contains(a.start, a.end) for w in operator.availability) \
                if operator.availability else False
            if not ok:
                errors.append(VError("operator_unavailable",
                                     f"{a.operator_id} not available for "
                                     f"{a.job_id}/{a.operation_id} in [{a.start},{a.end})",
                                     {"job_id": a.job_id, "operation_id": a.operation_id,
                                      "operator_id": a.operator_id}))

        # --- maintenance ----------------------------------------------- #
        for w in machine.maintenance:
            if w.overlaps(a.window):
                errors.append(VError("maintenance_conflict",
                                     f"{a.machine_id} in maintenance during "
                                     f"{a.job_id}/{a.operation_id}",
                                     {"job_id": a.job_id, "operation_id": a.operation_id,
                                      "machine_id": a.machine_id}))
                break

    # --- machine overlap ------------------------------------------------ #
    for mid, items in by_machine.items():
        items.sort(key=lambda x: x.start)
        for i in range(len(items) - 1):
            if items[i].window.overlaps(items[i + 1].window):
                # target the later op for repair (job_id/operation_id let the
                # repair loop locate and relocate it)
                errors.append(VError("machine_overlap",
                                     f"{mid}: {items[i].job_id}/{items[i].operation_id} overlaps "
                                     f"{items[i+1].job_id}/{items[i+1].operation_id}",
                                     {"machine_id": mid,
                                      "job_id": items[i + 1].job_id,
                                      "operation_id": items[i + 1].operation_id}))

    # --- operator overlap ----------------------------------------------- #
    for oid, items in by_operator.items():
        items.sort(key=lambda x: x.start)
        for i in range(len(items) - 1):
            if items[i].window.overlaps(items[i + 1].window):
                errors.append(VError("operator_overlap",
                                     f"{oid}: double-booked across "
                                     f"{items[i].job_id} and {items[i+1].job_id}",
                                     {"operator_id": oid,
                                      "job_id": items[i + 1].job_id,
                                      "operation_id": items[i + 1].operation_id}))

    # --- precedence ----------------------------------------------------- #
    sched_index = {(a.job_id, a.operation_id): a for a in plan.schedule}
    for a in plan.schedule:
        op = state.operation(a.job_id, a.operation_id)
        if op is None:
            continue
        for pred in op.predecessors:
            pa = sched_index.get((a.job_id, pred))
            if pa is None:
                errors.append(VError("precedence_violation",
                                     f"{a.job_id}/{a.operation_id} needs {pred} scheduled first",
                                     {"job_id": a.job_id, "operation_id": a.operation_id,
                                      "predecessor": pred}))
            elif pa.end > a.start:
                errors.append(VError("precedence_violation",
                                     f"{a.job_id}: {pred} ends after {a.operation_id} starts",
                                     {"job_id": a.job_id, "operation_id": a.operation_id,
                                      "predecessor": pred}))

    # --- material availability + timing --------------------------------- #
    avail = _material_availability(state, plan)
    # earliest scheduled start per job
    first_start: dict[str, int] = {}
    for a in plan.schedule:
        first_start[a.job_id] = min(first_start.get(a.job_id, a.start), a.start)
    need = defaultdict(float)
    for jid in first_start:
        job = state.job(jid)
        if job:
            need[job.material] += job.material_kg
    for mat_name, qty in need.items():
        rec = avail.get(mat_name)
        if rec is None:
            errors.append(VError("unknown_material", f"material '{mat_name}' does not exist",
                                 {"material": mat_name}))
            continue
        if qty > rec["onhand"] + rec["procured"] + 1e-9:
            errors.append(VError("material_shortage",
                                 f"need {qty}kg {mat_name}, have "
                                 f"{rec['onhand']}+{rec['procured']} procured",
                                 {"material": mat_name, "needed": qty}))
    # timing: jobs not covered by on-hand inventory must start after arrival
    for jid, start in first_start.items():
        job = state.job(jid)
        if job is None:
            continue
        rec = avail.get(job.material)
        if rec is None:
            continue
        if job.material_kg > rec["onhand"] + 1e-9:  # relies on procurement
            if rec["arrival"] is None or rec["arrival"] > start:
                errors.append(VError("material_late",
                                     f"{jid}: {job.material} arrives after op start "
                                     f"(arrival={rec['arrival']}, start={start})",
                                     {"job_id": jid, "material": job.material}))

    return errors


# --------------------------------------------------------------------------- #
# Soft reward + metrics
# --------------------------------------------------------------------------- #
def evaluate(state: FactoryState, plan: ActionPlan) -> EvalResult:
    errors = find_errors(state, plan)
    n_hard = len(errors)

    bd = defaultdict(float)
    bd["hard_violation_penalty"] = -HARD_VIOLATION_PENALTY * n_hard

    # which jobs are fully scheduled (all ops assigned)?
    sched_by_job: dict[str, list[ScheduleAssignment]] = defaultdict(list)
    for a in plan.schedule:
        sched_by_job[a.job_id].append(a)

    warned = {m.job_id for m in plan.customer_messages
              if m.message_type == "delay_warning" and m.job_id}
    quality = {q.job_id: q.action.value for q in plan.quality}

    n_jobs = len(state.jobs)
    on_time = 0
    completed = 0

    for job in state.jobs:
        items = sched_by_job.get(job.id, [])
        scheduled_ops = {a.operation_id for a in items}
        fully = scheduled_ops.issuperset({op.id for op in job.operations}) and len(items) > 0
        q = quality.get(job.id, "ship")

        if not fully:
            # unscheduled work -> lost revenue + trust hit
            bd["unscheduled_penalty"] -= TRUST_PENALTY_LATE * 0.5
            continue

        if q == "scrap":
            bd["scrap_cost"] -= SCRAP_FRACTION * job.revenue
            continue
        if q == "rework":
            bd["rework_cost"] -= REWORK_COST

        end = max(a.end for a in items)
        completed += 1
        bd["revenue"] += job.revenue

        dl = deadline_hour(job.due_day)
        if end <= dl:
            on_time += 1
            bd["on_time_bonus"] += ON_TIME_BONUS
        else:
            late_h = end - dl
            bd["lateness_penalty"] -= min(LATENESS_CAP, LATENESS_PER_HOUR * late_h)
            bd["trust_penalty"] -= (TRUST_PENALTY_LATE_WARNED if job.id in warned
                                    else TRUST_PENALTY_LATE)

    # overtime
    n_ot = sum(1 for a in plan.schedule if a.overtime)
    bd["overtime_cost"] -= OVERTIME_COST * n_ot

    # ---- safety: profit alone is not enough for unattended operation -------
    # The 'CEO away 2 weeks' story requires the brain to actively control
    # physical hazards. We reward explicit controls and penalize uncontrolled
    # ones. Hazards:
    #   (1) a degraded machine (low uptime) that is run without inspect/lockout
    #   (2) a HUMAN operator pushed into overtime (fatigue) without a slowdown
    # Preferring the 24/7 robot for off-hours work avoids (2) -> safer autonomy.
    safe_controlled = {d.target_id for d in plan.safety}
    used_machines = {a.machine_id for a in plan.schedule}
    safety_incidents = 0
    for m in state.machines:
        if m.id in used_machines and m.uptime < SAFE_UPTIME:
            if m.id in safe_controlled:
                bd["safety_bonus"] += SAFETY_BONUS
            else:
                bd["safety_penalty"] -= SAFETY_PENALTY
                safety_incidents += 1
    for a in plan.schedule:
        if not a.overtime:
            continue
        operator = state.operator(a.operator_id)
        if operator is None or operator.type.value == "robot":
            continue  # robots are safe for off-hours; humans are the hazard
        if a.operator_id in safe_controlled:
            bd["safety_bonus"] += SAFETY_BONUS
        else:
            bd["safety_penalty"] -= SAFETY_PENALTY
            safety_incidents += 1

    # procurement + expedite cost
    for po in plan.procurement:
        mat = state.material_by_name(po.material)
        if mat is None:
            continue
        cost = po.quantity_kg * mat.unit_cost
        bd["material_cost"] -= cost
        if po.expedite:
            bd["expedite_cost"] -= EXPEDITE_SURCHARGE * cost

    # accepted RFQ revenue (light-touch: counts toward profit)
    for q in plan.quote_decisions:
        rfq = next((r for r in state.rfqs if r.id == q.rfq_id), None)
        if rfq and q.accept:
            margin = (q.price_per_unit - rfq.est_unit_cost) * rfq.quantity
            bd["quote_margin"] += margin

    # utilization bonus (fraction of machine-hours used, no-overlap counted)
    horizon_h = max(1, state.horizon_days * 24)
    capacity = len(state.machines) * horizon_h
    used = sum(a.end - a.start for a in plan.schedule)
    utilization = min(1.0, used / capacity) if capacity else 0.0
    bd["utilization_bonus"] += UTILIZATION_BONUS * utilization

    reward = sum(bd.values())

    # ---- scoreboard metrics ---- #
    trust = max(0, 100 - 8 * n_hard
                - sum(1 for job in state.jobs
                      if sched_by_job.get(job.id) and
                      max((a.end for a in sched_by_job[job.id]), default=0)
                      > deadline_hour(job.due_day)
                      and job.id not in warned) * 6)
    metrics = {
        "profit": round(reward, 1),
        "on_time_rate": round(on_time / n_jobs, 3) if n_jobs else 0.0,
        "n_hard_violations": n_hard,
        "completed_jobs": completed,
        "total_jobs": n_jobs,
        "utilization": round(utilization, 3),
        "customer_trust": int(trust),
        "overtime_ops": n_ot,
        "safety_incidents": safety_incidents,
    }

    return EvalResult(errors=errors, reward=round(reward, 2),
                      breakdown={k: round(v, 2) for k, v in bd.items()},
                      metrics=metrics)
