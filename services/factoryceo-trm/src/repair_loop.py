"""TRM-style recursive verifier -> repair loop.

The brief's weekend version:

    for k in range(K):
        errors, reward = verifier(state, plan)
        if no hard errors and reward is good: break
        repair_action = repair_model(state, plan, errors, reward)
        plan = apply_repair(plan, repair_action)

`repair_model` here is a rule-based recursive heuristic: each step it picks the
highest-priority hard error and applies the local repair action that resolves it
(re-verifying after every edit). Once hard errors hit zero it does a soft pass
(warn late customers, reject negative-margin RFQs) to lift reward. Every step is
logged to a repair trace -- that trace is the RFT training signal a tiny model
would later learn to imitate / improve.
"""

from __future__ import annotations

from collections import defaultdict

from .schemas import (
    FactoryState, ActionPlan, ScheduleAssignment, Procurement,
    CustomerMessage, SafetyDecision, SafetyAction, OperatorType, deadline_hour,
)
from .verifier import evaluate, find_errors, VError, SAFE_UPTIME

# error priority: fix structural / hallucination first, material last
_PRIORITY = {
    "unknown_job": 0, "unknown_operation": 0, "unknown_machine": 1,
    "unknown_operator": 1, "unknown_material": 1,
    "capability_mismatch": 2, "operator_unqualified": 2,
    "operator_unavailable": 3, "maintenance_conflict": 3,
    "machine_overlap": 4, "operator_overlap": 4,
    "precedence_violation": 5, "bad_window": 5,
    "material_shortage": 6, "material_late": 6,
}

REPAIR_ACTIONS = [
    "move_operation", "swap_machine", "assign_operator", "delay_job",
    "add_overtime", "expedite_material", "reject_rfq", "warn_customer",
    "drop_operation",
]

# which repair op the loop applies for each hard-error type (the learned TRM
# controller predicts one of these ops; we then act on a matching error)
_ERROR_TO_OP = {
    "unknown_job": "drop_operation", "unknown_operation": "drop_operation",
    "unknown_machine": "swap_machine", "capability_mismatch": "swap_machine",
    "maintenance_conflict": "swap_machine", "machine_overlap": "move_operation",
    "unknown_operator": "assign_operator", "operator_unqualified": "assign_operator",
    "operator_unavailable": "assign_operator", "operator_overlap": "assign_operator",
    "precedence_violation": "move_operation", "bad_window": "move_operation",
    "material_shortage": "expedite_material", "material_late": "expedite_material",
    "unknown_material": "expedite_material",
}


def _error_to_op(err_type: str) -> str:
    return _ERROR_TO_OP.get(err_type, "move_operation")


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def _busy(plan: ActionPlan, exclude: ScheduleAssignment):
    mb: dict[str, list[tuple[int, int]]] = defaultdict(list)
    ob: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for a in plan.schedule:
        if a is exclude:
            continue
        mb[a.machine_id].append((a.start, a.end))
        ob[a.operator_id].append((a.start, a.end))
    return mb, ob


def _material_arrival(state: FactoryState, plan: ActionPlan, material: str) -> int:
    mat = state.material_by_name(material)
    arrival = None
    for po in plan.procurement:
        if po.material == material:
            lt = mat.lead_time_days if mat else 2
            if po.expedite:
                lt = max(1, (lt + 1) // 2)
            a = lt * 24
            arrival = a if arrival is None else min(arrival, a)
    return arrival if arrival is not None else 0


def _job_earliest(state: FactoryState, plan: ActionPlan, job_id: str) -> int:
    job = state.job(job_id)
    if job is None:
        return 0
    mat = state.material_by_name(job.material)
    if mat and job.material_kg > mat.inventory_kg + 1e-9:
        return _material_arrival(state, plan, job.material)
    return 0


def _relocate(state: FactoryState, plan: ActionPlan, a: ScheduleAssignment) -> bool:
    """Find a feasible (machine, operator, start) for assignment `a`.

    Respects capability, qualification, availability, maintenance, overlaps,
    material arrival and predecessor ends. Falls back to authorized overtime.
    Returns True on success (mutates `a`).
    """
    job = state.job(a.job_id)
    op = state.operation(a.job_id, a.operation_id)
    if job is None or op is None:
        return False
    horizon_h = state.horizon_days * 24
    dur = op.duration

    # earliest start = material arrival, predecessor ends
    earliest = _job_earliest(state, plan, a.job_id)
    pred_end = {x.operation_id: x.end for x in plan.schedule
                if x.job_id == a.job_id and x is not a}
    for pred in op.predecessors:
        earliest = max(earliest, pred_end.get(pred, 0))

    caps = [m for m in state.machines if op.capability in m.capabilities]
    # prefer robot operators (24/7 humanoid) then humans
    ops_q = sorted([o for o in state.operators if op.skill in o.skills],
                   key=lambda o: 0 if o.type == OperatorType.robot else 1)
    mb, ob = _busy(plan, exclude=a)

    def machine_ok(m, t):
        if any(w.start < t + dur and t < w.end for w in m.maintenance):
            return False
        return not any(s < t + dur and t < e for s, e in mb[m.id])

    for allow_overtime in (False, True):
        t = earliest
        while t + dur <= horizon_h:
            for m in caps:
                if not machine_ok(m, t):
                    continue
                for o in ops_q:
                    op_free = not any(s < t + dur and t < e for s, e in ob[o.id])
                    if not op_free:
                        continue
                    available = any(w.contains(t, t + dur) for w in o.availability)
                    if available or allow_overtime:
                        a.machine_id = m.id
                        a.operator_id = o.id
                        a.start = t
                        a.end = t + dur
                        a.overtime = (not available)
                        return True
            t += 1
    return False


def _soft_improve(state: FactoryState, plan: ActionPlan):
    """Reward-raising edits once hard errors are gone. Returns an action or None."""
    sched_by_job: dict[str, list[ScheduleAssignment]] = defaultdict(list)
    for a in plan.schedule:
        sched_by_job[a.job_id].append(a)
    warned = {m.job_id for m in plan.customer_messages
              if m.message_type == "delay_warning"}

    # warn customers on late jobs (cuts the trust penalty)
    for job in state.jobs:
        items = sched_by_job.get(job.id)
        if not items or job.id in warned:
            continue
        if max(a.end for a in items) > deadline_hour(job.due_day):
            plan.customer_messages.append(CustomerMessage(
                customer=job.customer, message_type="delay_warning", job_id=job.id))
            return {"op": "warn_customer", "job_id": job.id}

    # reject negative-margin quotes
    for q in plan.quote_decisions:
        rfq = next((r for r in state.rfqs if r.id == q.rfq_id), None)
        if rfq and q.accept and q.price_per_unit <= rfq.est_unit_cost:
            q.accept = False
            q.price_per_unit = 0.0
            return {"op": "reject_rfq", "rfq_id": q.rfq_id}

    # ---- safety controls (profit alone isn't enough for unattended ops) ----
    controlled = {d.target_id for d in plan.safety}
    used = {a.machine_id for a in plan.schedule}
    for m in state.machines:                      # degraded machine in use, uncontrolled
        if m.id in used and m.uptime < SAFE_UPTIME and m.id not in controlled:
            plan.safety.append(SafetyDecision(target_id=m.id, action=SafetyAction.inspect))
            return {"op": "safety_check", "target_id": m.id, "kind": "inspect_degraded_machine"}
    for a in plan.schedule:                        # human pushed to overtime, uncontrolled
        op = state.operator(a.operator_id)
        if a.overtime and op and op.type.value == "human" and a.operator_id not in controlled:
            plan.safety.append(SafetyDecision(target_id=a.operator_id, action=SafetyAction.slowdown))
            return {"op": "safety_check", "target_id": a.operator_id, "kind": "fatigue_slowdown"}
    return None


# --------------------------------------------------------------------------- #
# single repair step
# --------------------------------------------------------------------------- #
def _find_assignment(plan: ActionPlan, refs: dict):
    jid, oid = refs.get("job_id"), refs.get("operation_id")
    for a in plan.schedule:
        if a.job_id == jid and a.operation_id == oid:
            return a
    return None


def repair_one(state: FactoryState, plan: ActionPlan, err: VError) -> dict:
    """Apply the local repair for one error; returns the repair-action record."""
    t = err.type
    refs = err.refs

    if t in ("material_shortage", "material_late", "unknown_material"):
        mat_name = refs.get("material")
        mat = state.material_by_name(mat_name)
        po = next((p for p in plan.procurement if p.material == mat_name), None)
        if mat is None:
            # hallucinated material: drop the dependent job's ops
            for a in [x for x in plan.schedule if state.job(x.job_id)
                      and state.job(x.job_id).material == mat_name]:
                plan.schedule.remove(a)
            return {"op": "drop_operation", "reason": "unknown_material",
                    "material": mat_name}
        need = refs.get("needed", mat.inventory_kg)
        if po is None:
            plan.procurement.append(Procurement(material=mat_name,
                                                quantity_kg=round(max(need, 0), 1),
                                                expedite=True))
            return {"op": "expedite_material", "material": mat_name, "added": True}
        po.expedite = True
        po.quantity_kg = max(po.quantity_kg, round(need, 1))
        # also pull the dependent op start past the (now earlier) arrival
        for a in plan.schedule:
            if state.job(a.job_id) and state.job(a.job_id).material == mat_name:
                _relocate(state, plan, a)
        return {"op": "expedite_material", "material": mat_name, "added": False}

    a = _find_assignment(plan, refs)
    if a is None:
        return {"op": "noop", "reason": f"no assignment for {t}"}

    action_name = {
        "unknown_machine": "swap_machine", "capability_mismatch": "swap_machine",
        "maintenance_conflict": "swap_machine", "machine_overlap": "move_operation",
        "unknown_operator": "assign_operator", "operator_unqualified": "assign_operator",
        "operator_unavailable": "assign_operator", "operator_overlap": "assign_operator",
        "precedence_violation": "move_operation", "bad_window": "move_operation",
    }.get(t, "move_operation")

    if _relocate(state, plan, a):
        rec = {"op": action_name, "job_id": a.job_id, "operation_id": a.operation_id,
               "machine_id": a.machine_id, "operator_id": a.operator_id,
               "start": a.start, "end": a.end}
        if a.overtime:
            rec["op"] = "add_overtime"
        return rec

    # could not place -> drop the operation (guarantees progress toward 0 hard)
    plan.schedule.remove(a)
    return {"op": "drop_operation", "job_id": a.job_id, "operation_id": a.operation_id}


def _pick_error(errors: list[VError]) -> VError:
    return min(errors, key=lambda e: _PRIORITY.get(e.type, 9))


def _pick_error_by_op(errors: list[VError], op_selector) -> VError:
    """Let a learned controller (TRM) choose the next op; act on a matching error.

    The TRM predicts the next repair op-type from the error signature; we fix the
    highest-priority error whose op matches. Falls back to priority if no match."""
    try:
        want = op_selector(errors)
        matching = [e for e in errors if _error_to_op(e.type) == want]
        if matching:
            return min(matching, key=lambda e: _PRIORITY.get(e.type, 9))
    except Exception:
        pass
    return _pick_error(errors)


# --------------------------------------------------------------------------- #
# recursive loop
# --------------------------------------------------------------------------- #
def repair_loop(state: FactoryState, plan: ActionPlan, K: int = 40, op_selector=None):
    """Recursive verifier->repair. Returns (final_plan, repair_trace).

    op_selector (optional): a learned controller, e.g. TRM
    `LearnedRepairModel.pick_op`, that chooses the next op-type each step. None =
    the rule-based priority policy (the guaranteed-feasible baseline)."""
    plan = plan.copy_plan()
    trace: list[dict] = []
    for _ in range(K):
        res = evaluate(state, plan)
        if res.n_hard == 0:
            action = _soft_improve(state, plan)
            if action is None:
                break
            res2 = evaluate(state, plan)
            trace.append({"repair_action": action, "reward_after": res2.reward,
                          "errors_after": res2.errors_as_dicts()})
            continue
        err = (_pick_error_by_op(res.errors, op_selector) if op_selector
               else _pick_error(res.errors))
        action = repair_one(state, plan, err)
        res2 = evaluate(state, plan)
        trace.append({"repair_action": action, "reward_after": res2.reward,
                      "errors_after": res2.errors_as_dicts(),
                      "targeted_error": err.as_dict()})
    return plan, trace
