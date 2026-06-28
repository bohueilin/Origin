# Factory operations scheduler

You are the autonomous operations brain for a high-mix manufacturing plant. The
plant runs for a fixed horizon (see the state). You are given the full factory
state and must output a single **ActionPlan** that the plant can execute.

## Input

`fixtures/state.json` — the canonical factory state:

- `machines[]` — `id`, `capabilities` (e.g. `mold`, `cnc`, `deburr`), `uptime`,
  and `maintenance[]` windows `{start, end}` in absolute hours.
- `operators[]` — `id`, `type` (`human` or `robot`), `skills`, `availability[]`.
- `materials[]` — `name`, `inventory_kg`, `lead_time_days`, `unit_cost`.
- `jobs[]` — `id`, ordered `operations[]` (`id`, `capability`, `skill`,
  `duration` hours, `predecessors[]`), `material`, `material_kg`, `quantity`,
  `due_day`, `priority`, `revenue`, `customer`.
- `rfqs[]` — optional quotes you may accept/reject.

Time is a single integer hour clock starting at `t = 0`. A job is on time if its
last operation ends by hour `(due_day + 1) * 24`.

## Output

Write `output/plan.json`: ONE JSON object matching the ActionPlan schema:

```json
{
  "quote_decisions": [{"rfq_id": "...", "accept": true, "price_per_unit": 0.0, "promised_day": 0}],
  "procurement":     [{"material": "...", "quantity_kg": 0.0, "expedite": false}],
  "schedule":        [{"job_id": "...", "operation_id": "...", "machine_id": "...", "operator_id": "...", "start": 0, "end": 0, "overtime": false}],
  "quality":         [{"job_id": "...", "action": "ship"}],
  "customer_messages":[{"customer": "...", "message_type": "notify", "job_id": "..."}],
  "safety":          [{"target_id": "...", "action": "inspect"}]
}
```

You must schedule **every operation of every job**.

## Hard constraints (any violation = fail)

1. No machine runs two operations at overlapping times.
2. A machine only runs operations whose `capability` it has.
3. An operator is `available` and `skilled` for every operation assigned to them.
4. Material for a job is on hand or procured to arrive **before** the op starts.
5. No operation overlaps its machine's maintenance window.
6. Operation precedence (`predecessors`) is respected.
7. No hallucinated machine / operator / job / operation / material ids.
8. The plan is schema-valid.

## Objective

Among feasible plans, maximize verifier reward = revenue − material/overtime/
expedite/scrap costs − lateness/trust penalties + on-time and utilization bonuses.
A feasible plan that destroys value does **not** pass.

## Success

PASS ⇔ schema-valid AND zero hard violations AND verifier reward ≥ 60% of the
oracle's reward. The verifier (`tests/test_outputs.py`) is deterministic.
