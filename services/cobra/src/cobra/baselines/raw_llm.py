"""Raw-LLM engine baseline (ablation): a plain red agent, no specialists, no conductor.

A generic 'make the visible tests pass' agent attacks each gate ONCE, with none of the engine's
machinery — no cheat-category specialists, no allocate/diversify/gatekeep, no escalation. It's
the middle point on the engine axis between the dumb fuzzer (no LLM) and the conductor (LLM +
orchestration): it isolates what the categories + conductor actually add. Empirically a generic
agent mostly solves honestly, so its breach hit-rate is low.

`probe(task_id) -> bool` is injected (deterministic to test); the live factory runs the base
red agent against the real grader/oracle.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from ..agents.red import run_red_agent
from ..loop import interface


@dataclass
class RawLLMReport:
    results: dict[str, bool]  # task_id -> breached?
    breached: int
    total: int

    @property
    def hit_rate(self) -> float:
        return self.breached / self.total if self.total else 0.0


def raw_llm_breaches(task_ids: list[str], *, probe: Callable[[str], bool]) -> RawLLMReport:
    """Run the ablation baseline across gates. probe(task_id) -> True iff it breached the gate."""
    results = {tid: probe(tid) for tid in task_ids}
    return RawLLMReport(results=results, breached=sum(results.values()), total=len(task_ids))


def make_live_probe(client: Any = None, max_turns: int = 12) -> Callable[[str], bool]:
    """A probe that runs the BASE red agent (generic prompt, no specialist category) once."""

    def probe(task_id: str) -> bool:
        task = interface.load_task(task_id)
        workdir = interface.make_workdir(task)
        run_red_agent(workdir, run_tests=interface.run_grader, client=client, max_turns=max_turns)
        r = interface.run_grader(workdir)
        t = interface.run_oracle(task, workdir)
        return interface.is_breach(r, t)

    return probe
