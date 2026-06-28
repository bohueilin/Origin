"""Shared ShiftBench floor prompt builder (no HUD dependency).

Used by the HUD env template, Fireworks RL training, and RFT evaluators so the
prompt and verifier state are always reconstructed identically from (floor_id, seed).
"""

from __future__ import annotations

import json

from .hud_env import scenario_prompt
from .job_sources import build_job_stream
from .library import ARCHETYPES, feasible_state

JSON_SYSTEM_PROMPT = (
    "You are a strict JSON-only planning API. Do not explain, do not show "
    "reasoning, do not summarize the task, and do not use markdown. Keep any "
    "reasoning internal. Respond with exactly one complete JSON ActionPlan "
    "object: the first character must be { and the last character must be }. "
    "If space is limited, schedule fewer rows but still return valid JSON."
)


def floor_prompt_and_state(floor_id: str, seed: int = 0):
    arch = next((a for a in ARCHETYPES if a["id"] == floor_id), ARCHETYPES[0])
    state = feasible_state(arch, base=seed)
    job_stream = build_job_stream(arch, base=seed)
    floor = arch.get("floorplan", {})
    layout = arch.get("layout", {})
    targets = [
        {
            "job_id": job.id,
            "operations": [
                {
                    "operation_id": op.id,
                    "capability": op.capability,
                    "duration": op.duration,
                    "predecessors": op.predecessors,
                }
                for op in job.operations
            ],
            "due_day": job.due_day,
            "priority": job.priority,
        }
        for job in state.jobs
    ]
    plan_shape = {
        "quote_decisions": [{"rfq_id": "R17", "accept": True, "price_per_unit": 0.2, "promised_day": 12}],
        "procurement": [{"material": "ABS", "quantity_kg": 0, "expedite": False}],
        "schedule": [
            {
                "job_id": "J100",
                "operation_id": "op0",
                "machine_id": "M1",
                "operator_id": "R1",
                "start": 8,
                "end": 12,
                "overtime": False,
            }
        ],
        "quality": [{"job_id": "J100", "action": "ship"}],
        "customer_messages": [{"customer": "Acme", "message_type": "confirm", "job_id": "J100"}],
        "safety": [{"target_id": "M4", "action": "inspect"}],
    }
    prompt = (
        f"ShiftBench floor: {arch['label']} ({arch['id']})\n"
        f"Scenario: {arch.get('scenario', '')}\n"
        f"Floor plan: {floor.get('id')} {floor.get('file', '')}\n"
        f"Declared layout: {layout}\n"
        f"Order source: {job_stream['dataset']} ({job_stream['source'].upper()})\n"
        f"Order stream: {job_stream['n_orders']} orders, {job_stream['n_order_lines']} lines, "
        f"{job_stream['n_skus']} SKUs\n"
        f"Mapping: {job_stream['mapping_profile']['name']} · "
        f"{', '.join(job_stream['mapping_profile']['route_constraints'])}\n\n"
        "HUD coverage is exact-match: every schedule row must use one of these "
        "job_id/operation_id pairs. Schedule as many as possible, preferably all.\n"
        f"Required schedule targets:\n{json.dumps(targets, separators=(',', ':'))}\n\n"
        "Output shape example (replace values with this scenario's exact IDs):\n"
        f"{json.dumps(plan_shape, separators=(',', ':'))}\n\n"
        f"{scenario_prompt(state)}"
    )
    return prompt, state
