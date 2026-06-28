"""Baseline planners.

`greedy` is the workhorse: an earliest-due-date scheduler that respects machine
capability, operator qualification/availability, maintenance, precedence, and
material arrival. It produces a *feasible* plan and is also the seed we corrupt
to simulate raw LLM output. `base_plan` is the naive direct plan (no procurement,
no lateness handling) used as the weakest baseline.
"""

from __future__ import annotations

from collections import defaultdict

from .schemas import (
    FactoryState, ActionPlan, ScheduleAssignment, Procurement, QuoteDecision,
    QualityDecision, CustomerMessage, deadline_hour,
)


def _fits_operator(state: FactoryState, oid: str, start: int, end: int,
                   busy: dict[str, list[tuple[int, int]]]) -> bool:
    op = state.operator(oid)
    if op is None:
        return False
    within = any(w.contains(start, end) for w in op.availability)
    if not within:
        return False
    return not any(s < end and start < e for s, e in busy[oid])


def _machine_free(state: FactoryState, mid: str, start: int, end: int,
                  busy: dict[str, list[tuple[int, int]]]) -> bool:
    m = state.machine(mid)
    if m is None:
        return False
    if any(w.start < end and start < w.end for w in m.maintenance):
        return False
    return not any(s < end and start < e for s, e in busy[mid])


def schedule_in_order(state: FactoryState, job_order: list[Job]) -> ActionPlan:
    """Build a *feasible* plan, dispatching jobs in the supplied order.

    This is the workhorse `greedy` delegates to. The only learnable decision the
    RL policy controls is `job_order` -- the dispatch sequence. Procurement and
    inventory allocation stay the sensible EDD default (a material policy, not the
    scheduling decision we train). Crucially, placement is identical to greedy: an
    op is only ever placed in a free, capable, qualified, available slot, so the
    resulting plan is feasible *regardless of order*. When machine/operator
    capacity binds, the order decides which jobs win the scarce slots -- and that,
    not feasibility, is what moves profit. (See `src/rl_train.py`.)"""
    plan = ActionPlan()
    horizon_h = state.horizon_days * 24

    # ---- procurement: cover material deficits, allocate inventory to early jobs
    need = defaultdict(float)
    for j in state.jobs:
        need[j.material] += j.material_kg
    material_arrival: dict[str, int] = {}
    for mat in state.materials:
        deficit = need[mat.name] - mat.inventory_kg
        if deficit > 0:
            plan.procurement.append(Procurement(material=mat.name,
                                                quantity_kg=round(deficit, 1),
                                                expedite=False))
            material_arrival[mat.name] = mat.lead_time_days * 24
        else:
            material_arrival[mat.name] = 0
    # jobs covered by on-hand inventory may start at t=0; others wait for arrival
    inv_left = {m.name: m.inventory_kg for m in state.materials}
    job_earliest: dict[str, int] = {}
    for j in sorted(state.jobs, key=lambda x: x.due_day):
        if inv_left[j.material] >= j.material_kg:
            inv_left[j.material] -= j.material_kg
            job_earliest[j.id] = 0
        else:
            job_earliest[j.id] = material_arrival[j.material]

    # ---- schedule jobs in the supplied dispatch order
    machine_busy: dict[str, list[tuple[int, int]]] = defaultdict(list)
    operator_busy: dict[str, list[tuple[int, int]]] = defaultdict(list)

    for job in job_order:
        op_end: dict[str, int] = {}
        for op in job.operations:  # operations are already in precedence order
            earliest = job_earliest[job.id]
            for pred in op.predecessors:
                earliest = max(earliest, op_end.get(pred, 0))
            caps = [m.id for m in state.machines if op.capability in m.capabilities]
            ops_q = [o.id for o in state.operators if op.skill in o.skills]
            placed = False
            t = earliest
            while t + op.duration <= horizon_h and not placed:
                for mid in caps:
                    if not _machine_free(state, mid, t, t + op.duration, machine_busy):
                        continue
                    for oid in ops_q:
                        if _fits_operator(state, oid, t, t + op.duration, operator_busy):
                            plan.schedule.append(ScheduleAssignment(
                                job_id=job.id, operation_id=op.id, machine_id=mid,
                                operator_id=oid, start=t, end=t + op.duration))
                            machine_busy[mid].append((t, t + op.duration))
                            operator_busy[oid].append((t, t + op.duration))
                            op_end[op.id] = t + op.duration
                            placed = True
                            break
                    if placed:
                        break
                t += 1
            if not placed:
                # capacity ran out -- stop here so no later op is scheduled without
                # its (now-unplaced) predecessor (that would be a precedence
                # violation). The job is simply left partially/un-scheduled, which
                # the verifier scores as lost revenue, never as an infeasibility.
                break

        # warn customer if the job finished late
        if op_end:
            end = max(op_end.values())
            if end > deadline_hour(job.due_day):
                plan.customer_messages.append(CustomerMessage(
                    customer=job.customer, message_type="delay_warning", job_id=job.id))
        plan.quality.append(QualityDecision(job_id=job.id))  # ship by default

    # ---- quoting: accept positive-margin RFQs, reject the rest
    for rfq in state.rfqs:
        accept = rfq.target_price_per_unit > rfq.est_unit_cost
        plan.quote_decisions.append(QuoteDecision(
            rfq_id=rfq.id, accept=accept,
            price_per_unit=rfq.target_price_per_unit if accept else 0.0,
            promised_day=rfq.due_day if accept else 0))
    return plan


def greedy(state: FactoryState) -> ActionPlan:
    """Earliest-due-date dispatch (ties broken by higher priority)."""
    order = sorted(state.jobs, key=lambda j: (j.due_day, -j.priority))
    return schedule_in_order(state, order)


def base_plan(state: FactoryState) -> ActionPlan:
    """Naive direct plan: schedule from t=0 ignoring procurement & lateness."""
    plan = ActionPlan()
    machine_busy: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for job in state.jobs:
        t = 0
        for op in job.operations:
            caps = [m.id for m in state.machines if op.capability in m.capabilities]
            mid = caps[0] if caps else state.machines[0].id
            oid = state.operators[0].id
            plan.schedule.append(ScheduleAssignment(
                job_id=job.id, operation_id=op.id, machine_id=mid,
                operator_id=oid, start=t, end=t + op.duration))
            t += op.duration
        plan.quality.append(QualityDecision(job_id=job.id))
    for rfq in state.rfqs:
        plan.quote_decisions.append(QuoteDecision(rfq_id=rfq.id, accept=True,
                                                  price_per_unit=rfq.target_price_per_unit,
                                                  promised_day=rfq.due_day))
    return plan
