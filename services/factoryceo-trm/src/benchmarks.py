"""Standard Job-Shop Scheduling (JSSP) benchmark instances, mapped onto our
FactoryState so the verifier + repair loop can be graded against published
best-known solutions (BKS).

Each classic instance (OR-Library / Fisher-Thompson / Lawrence) is a set of jobs,
where each job is an ordered chain of operations and every operation must run on a
specific machine for a fixed duration. We map:

  machine k        -> Machine(id=Mk, capabilities=[mk])
  operator per k   -> Operator(id=Ok, skill mk)        (so machines run in parallel)
  job i            -> Job with an op chain (each op pinned to its machine via cap)

We report **makespan** (max op end) and the **gap to BKS** = (makespan-BKS)/BKS.
Our scheduler is feasibility-first (greedy + verifier-gated repair), not a makespan
optimiser, so the honest result is: feasible (0 violations) on standard instances,
with a measured gap to the optimum — and the real differentiator is dynamic
re-optimisation under disruption, which static BKS instances don't test.
"""

from __future__ import annotations

import math

from .schemas import (FactoryState, Machine, Operator, OperatorType, Operation,
                      Job, Material, Window)

# (machine, duration) per operation, per job. Machines 0-indexed. Published BKS.
INSTANCES: dict[str, dict] = {
    "ft06": {
        "name": "Fisher-Thompson 6x6", "bks": 55, "source": "OR-Library (ft06)",
        "jobs": [
            [(2, 1), (0, 3), (1, 6), (3, 7), (5, 3), (4, 6)],
            [(1, 8), (2, 5), (4, 10), (5, 10), (0, 10), (3, 4)],
            [(2, 5), (3, 4), (5, 8), (0, 9), (1, 1), (4, 7)],
            [(1, 5), (0, 5), (2, 5), (3, 3), (4, 8), (5, 9)],
            [(2, 9), (1, 3), (4, 5), (5, 4), (0, 3), (3, 1)],
            [(1, 3), (3, 3), (5, 9), (0, 10), (4, 4), (2, 1)],
        ],
    },
    "la01": {
        "name": "Lawrence 10x5", "bks": 666, "source": "OR-Library (la01)",
        "jobs": [
            [(1, 21), (0, 53), (4, 95), (3, 55), (2, 34)],
            [(0, 21), (3, 52), (4, 16), (2, 26), (1, 71)],
            [(3, 39), (4, 98), (1, 42), (2, 31), (0, 12)],
            [(1, 77), (0, 55), (4, 79), (2, 66), (3, 77)],
            [(0, 83), (3, 34), (2, 64), (1, 19), (4, 37)],
            [(1, 54), (2, 43), (4, 79), (0, 92), (3, 62)],
            [(3, 69), (4, 77), (1, 87), (2, 87), (0, 93)],
            [(2, 38), (0, 60), (1, 41), (3, 24), (4, 83)],
            [(3, 17), (1, 49), (4, 25), (0, 44), (2, 98)],
            [(4, 77), (3, 79), (2, 43), (1, 75), (0, 96)],
        ],
    },
}


def load_instance(key: str) -> FactoryState:
    inst = INSTANCES[key]
    jobs_spec = inst["jobs"]
    n_machines = max(m for job in jobs_spec for (m, _) in job) + 1
    total = sum(d for job in jobs_spec for (_, d) in job)
    horizon_days = max(1, math.ceil(total / 24))
    cap = lambda k: f"m{k}"

    machines = [Machine(id=f"M{k}", capabilities=[cap(k)], uptime=1.0) for k in range(n_machines)]
    operators = [Operator(id=f"O{k}", type=OperatorType.robot, skills=[cap(k)],
                          availability=[Window(start=0, end=horizon_days * 24)])
                 for k in range(n_machines)]
    materials = [Material(name="stock", inventory_kg=1e9, lead_time_days=0, unit_cost=0.0)]
    jobs = []
    for i, job in enumerate(jobs_spec):
        ops = []
        for j, (mch, dur) in enumerate(job):
            ops.append(Operation(id=f"op{j}", capability=cap(mch), skill=cap(mch),
                                 duration=int(dur), predecessors=([f"op{j-1}"] if j else [])))
        jobs.append(Job(id=f"J{i}", operations=ops, material="stock", material_kg=0.0,
                        quantity=1, due_day=horizon_days, priority=1, revenue=1000.0))
    return FactoryState(horizon_days=horizon_days, machines=machines, operators=operators,
                        materials=materials, jobs=jobs)


def makespan(plan) -> int:
    return max((a.end for a in plan.schedule), default=0)


def evaluate_instance(key: str) -> dict:
    """Load, schedule (greedy + verifier-gated repair), and grade vs BKS."""
    from .baselines import greedy
    from .repair_loop import repair_loop
    from .verifier import evaluate
    inst = INSTANCES[key]
    state = load_instance(key)
    final, _ = repair_loop(state, greedy(state), K=200)
    res = evaluate(state, final)
    mk = makespan(final)
    bks = inst["bks"]
    return {
        "instance": key, "name": inst["name"], "source": inst["source"],
        "jobs": len(state.jobs), "machines": len(state.machines),
        "bks": bks, "makespan": mk, "gap_pct": round(100 * (mk - bks) / bks, 1),
        "feasible": res.n_hard == 0, "hard_violations": res.n_hard,
    }
