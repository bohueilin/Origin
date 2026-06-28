"""Seam 2 — the event stream schema (SPEC §8).

The dashboard animates purely off this stream; the backend can be tested by
replaying fakes. Field sets are copied verbatim from SPEC §8 and each event
keeps its verbatim wire name in `type`. Do not add, drop, or rename fields.
"""

from dataclasses import dataclass


@dataclass
class AgentSpawn:
    agent: str
    specialty: str
    type: str = "agent_spawn"


@dataclass
class AgentMove:
    agent: str
    gate: str
    type: str = "agent_move"


@dataclass
class BreachFound:
    agent: str
    gate: str
    cheat_type: str
    grader_score: int
    oracle_score: int
    example: str
    type: str = "breach_found"


@dataclass
class PatchApplied:
    gate: str
    technique: str
    type: str = "patch_applied"


@dataclass
class PatchRejected:
    gate: str
    reason: str  # over-tightened
    type: str = "patch_rejected"


@dataclass
class AgentKilled:
    agent: str
    gate: str
    type: str = "agent_killed"  # exploit sealed


@dataclass
class RobustnessUpdate:
    held_out_blocked: float
    honest_pass: float
    probes: int
    type: str = "robustness_update"


# The full event union the dashboard consumes off the stream.
Event = (
    AgentSpawn
    | AgentMove
    | BreachFound
    | PatchApplied
    | PatchRejected
    | AgentKilled
    | RobustnessUpdate
)
