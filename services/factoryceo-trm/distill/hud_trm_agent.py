"""A custom HUD Agent backed by the TRM repair controller.

Makes the 2,954-param TRM appear as a real HUD `Run` — leaderboard-comparable to
the gateway LLMs, graded by the same verifier reward. We subclass the gateway
agent (which already owns the env control channel) and override `get_response`
to return the TRM-controlled plan instead of calling the LLM — so the TRM's
answer flows to the env grader through HUD's normal machinery, at no token cost.

Runs in .venv-hud. If torch is available it can use the neural TRM checkpoint;
otherwise it falls back to the dependency-free JSON repair-policy checkpoint
produced by /pipeline.
"""

from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from hud.agents import create_agent
from hud.agents.types import AgentStep

from src.schemas import FactoryState
from src.baselines import base_plan
from src.hud_env import extract_json_object
from src.repair_loop import repair_loop


class JsonRepairPolicy:
    """Pure-Python repair-op selector for HUD runtimes without torch.

    The API pipeline writes checkpoints/<run>/trm.json with a map from verifier
    error type to repair op. That is enough for repair_loop's op_selector hook.
    """

    def __init__(self, ckpt: str | None = None):
        ckpt = ckpt or os.environ.get("TRM_JSON_CKPT") or _latest_json_ckpt()
        self.default_op = "noop"
        self.policy: dict[str, str] = {}
        if ckpt and os.path.exists(ckpt):
            with open(ckpt, encoding="utf-8") as f:
                data = json.load(f)
            self.default_op = data.get("default_op", "noop")
            self.policy = data.get("policy", {})

    def pick_op(self, errors) -> str:
        for e in errors:
            typ = e.get("type") if isinstance(e, dict) else getattr(e, "type", None)
            if typ in self.policy:
                return self.policy[typ]
        return self.default_op


def _latest_json_ckpt() -> str | None:
    root = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "checkpoints")
    if not os.path.isdir(root):
        return None
    candidates = []
    for name in os.listdir(root):
        path = os.path.join(root, name, "trm.json")
        if os.path.exists(path):
            candidates.append(path)
    return max(candidates, key=os.path.getmtime) if candidates else None


def _repair_controller():
    try:
        from src.trm_student import LearnedRepairModel
        return LearnedRepairModel()
    except Exception:
        return JsonRepairPolicy()


def _prompt_text(state) -> str:
    parts = []
    for m in state.messages:
        c = m.get("content") if isinstance(m, dict) else getattr(m, "content", None)
        if isinstance(c, str):
            parts.append(c)
        elif isinstance(c, list):
            for b in c:
                t = b.get("text") if isinstance(b, dict) else getattr(b, "text", None)
                if t:
                    parts.append(t)
    return "\n".join(parts)


def make_trm_agent(model: str = "claude"):
    """Gateway agent with its brain swapped for the TRM controller (no LLM call)."""
    base = create_agent(model)
    trm = _repair_controller()

    class TRMAgent(type(base)):
        async def get_response(self, state, *, system_prompt=None, citations_enabled=False):
            text = _prompt_text(state)
            tail = text.split("Canonical state:")[-1]
            raw_state = extract_json_object(tail)
            if raw_state is None:
                raise ValueError("Could not extract canonical FactoryState JSON from HUD prompt")
            st = FactoryState.model_validate(raw_state)
            plan, _ = repair_loop(st, base_plan(st), K=60, op_selector=trm.pick_op)
            return AgentStep(source="agent", content=plan.model_dump_json(), done=True)

    base.__class__ = TRMAgent
    return base
