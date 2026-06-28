"""Pydantic schemas for FactoryCEO-TRM.

Two layers:
  * World state  -- machines, operators, materials, jobs, RFQs (the messy plant
    context compiled into canonical JSON).
  * Action plan  -- what the brain emits: quoting, procurement, scheduling,
    quality, and customer-communication decisions. This mirrors the agent-output
    example in the handoff brief exactly.

Time convention: a single integer **hour clock** starting at t=0 (start of the
planning horizon). horizon_days * 24 hours total. Due dates are given as an
integer day; a job is on time if its last operation ends by the end of its due
day, i.e. by hour (due_day + 1) * 24.
"""

from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field

HOURS_PER_DAY = 24


def deadline_hour(due_day: int) -> int:
    """Absolute hour by which a job must finish to count as on time."""
    return (due_day + 1) * HOURS_PER_DAY


# --------------------------------------------------------------------------- #
# World state
# --------------------------------------------------------------------------- #
class OperatorType(str, Enum):
    human = "human"
    robot = "robot"  # humanoid embodiment -- scheduled like any other resource


class Window(BaseModel):
    """A closed-open time window [start, end) in absolute hours."""
    start: int
    end: int

    def overlaps(self, other: "Window") -> bool:
        return self.start < other.end and other.start < self.end

    def contains(self, start: int, end: int) -> bool:
        return self.start <= start and end <= self.end


class Machine(BaseModel):
    id: str
    capabilities: list[str]                 # e.g. ["mold", "cnc", "deburr"]
    uptime: float = 1.0                     # 0..1 reliability (downtime risk)
    maintenance: list[Window] = Field(default_factory=list)


class Operator(BaseModel):
    id: str
    type: OperatorType = OperatorType.human
    skills: list[str]                       # capabilities this operator can run
    availability: list[Window] = Field(default_factory=list)


class Material(BaseModel):
    name: str
    inventory_kg: float = 0.0               # on-hand at t=0
    lead_time_days: int = 2                 # days to receive if ordered now
    unit_cost: float = 1.0                  # cost per kg


class Operation(BaseModel):
    id: str
    capability: str                         # capability the machine must have
    skill: str                              # skill the operator must have
    duration: int                           # processing time in hours
    predecessors: list[str] = Field(default_factory=list)  # operation ids


class Job(BaseModel):
    id: str
    operations: list[Operation]
    material: str                           # material name required
    material_kg: float                      # qty consumed
    quantity: int                           # units produced
    due_day: int
    priority: int = 1                       # higher = more important
    revenue: float = 0.0                    # paid on completion
    customer: str = "Acme"


class RFQ(BaseModel):
    id: str
    customer: str
    material: str
    quantity: int
    due_day: int
    target_price_per_unit: float            # what the customer hopes to pay
    est_unit_cost: float                    # our cost to make one unit


class FactoryState(BaseModel):
    horizon_days: int = 30
    machines: list[Machine]
    operators: list[Operator]
    materials: list[Material]
    jobs: list[Job]                         # already-accepted work
    rfqs: list[RFQ] = Field(default_factory=list)

    # ---- convenience lookups (not serialized as part of equality logic) ----
    def machine(self, mid: str) -> Optional[Machine]:
        return next((m for m in self.machines if m.id == mid), None)

    def operator(self, oid: str) -> Optional[Operator]:
        return next((o for o in self.operators if o.id == oid), None)

    def material_by_name(self, name: str) -> Optional[Material]:
        return next((m for m in self.materials if m.name == name), None)

    def job(self, jid: str) -> Optional[Job]:
        return next((j for j in self.jobs if j.id == jid), None)

    def operation(self, jid: str, oid: str) -> Optional[Operation]:
        j = self.job(jid)
        if j is None:
            return None
        return next((op for op in j.operations if op.id == oid), None)


# --------------------------------------------------------------------------- #
# Action plan (what the brain emits)
# --------------------------------------------------------------------------- #
class QuoteDecision(BaseModel):
    rfq_id: str
    accept: bool
    price_per_unit: float = 0.0
    promised_day: int = 0


class Procurement(BaseModel):
    material: str
    quantity_kg: float
    expedite: bool = False                  # pay extra for faster arrival


class ScheduleAssignment(BaseModel):
    job_id: str
    operation_id: str
    machine_id: str
    operator_id: str
    start: int                              # absolute hour
    end: int                                # absolute hour
    overtime: bool = False                  # run outside normal shift, at a cost

    @property
    def window(self) -> Window:
        return Window(start=self.start, end=self.end)


class QualityAction(str, Enum):
    ship = "ship"
    rework = "rework"
    scrap = "scrap"


class QualityDecision(BaseModel):
    job_id: str
    action: QualityAction = QualityAction.ship


class CustomerMessage(BaseModel):
    customer: str
    message_type: str                       # notify | renegotiate | delay_warning | confirm
    job_id: Optional[str] = None


class SafetyAction(str, Enum):
    inspect = "inspect"      # service/inspect a degraded machine before running it
    lockout = "lockout"      # take a machine out of service (no ops allowed)
    slowdown = "slowdown"    # cap a robot's continuous-run exposure


class SafetyDecision(BaseModel):
    """An explicit safety control the brain can take to make autonomous,
    unattended operation safe (the 'CEO away' story). Covered machines/robots
    avoid the safety penalty; uncovered hazards are penalized in the reward."""
    target_id: str                          # machine_id or operator_id
    action: SafetyAction = SafetyAction.inspect


class ActionPlan(BaseModel):
    quote_decisions: list[QuoteDecision] = Field(default_factory=list)
    procurement: list[Procurement] = Field(default_factory=list)
    schedule: list[ScheduleAssignment] = Field(default_factory=list)
    quality: list[QualityDecision] = Field(default_factory=list)
    customer_messages: list[CustomerMessage] = Field(default_factory=list)
    safety: list[SafetyDecision] = Field(default_factory=list)

    def copy_plan(self) -> "ActionPlan":
        """Deep, independent copy (repairs mutate copies, never the original)."""
        return ActionPlan.model_validate(self.model_dump())
