"""A — iterated red<->green escalation, tested with injected attack/seal (no LLM)."""

from cobra.agents.specialists import FORGER
from cobra.conductor import escalate_gate
from cobra.green import GreenResult
from cobra.substrate import Task

ONE_SPECIALIST = (FORGER,)  # round == attack-call count, so schedules are easy to script


def _task() -> Task:
    return Task(
        task_id="toy/add",
        prompt='def add(a, b):\n    """add"""\n',
        entry_point="add",
        base_input=[[1, 2]],
        plus_input=[[3, 4]],
        canonical_solution="    return a + b\n",
    )


def _seal_ok(task, src, gold, base_grader):
    # A real-ish grader_prime stand-in; escalate_gate treats it opaquely.
    return GreenResult(True, "tpl", grader_prime=("hardened", base_grader))


def _seal_fail(task, src, gold, base_grader):
    return GreenResult(False, template_id=None, reason="no template seals this")


def _attack_breaches_until(round_limit):
    state = {"n": 0}

    def attack(task, grader, spec):
        state["n"] += 1
        return "cheat" if state["n"] <= round_limit else None

    return attack


def test_escalation_converges_to_robust():
    # Breaches rounds 1-2, then round 3 finds nothing -> robust (swarm exhausted).
    report = escalate_gate(
        _task(),
        attack=_attack_breaches_until(2),
        seal=_seal_ok,
        specialists=ONE_SPECIALIST,
        max_rounds=5,
    )
    assert report.robust is True
    assert report.rounds_survived == 2
    assert report.sealed == 2
    assert report.honest_pass is True


def test_escalation_stalls_when_green_cannot_seal():
    report = escalate_gate(
        _task(),
        attack=_attack_breaches_until(5),
        seal=_seal_fail,
        specialists=ONE_SPECIALIST,
        max_rounds=5,
    )
    assert report.robust is False
    assert report.rounds_survived == 1
    assert report.sealed == 0
    assert "seal" in report.stalled_reason


def test_escalation_hits_round_cap_when_always_breachable():
    report = escalate_gate(
        _task(),
        attack=_attack_breaches_until(99),  # always breaches
        seal=_seal_ok,
        specialists=ONE_SPECIALIST,
        max_rounds=3,
    )
    assert report.robust is False  # never exhausted within the cap
    assert report.rounds_survived == 3


def test_escalation_emits_seam2_events():
    events = []
    escalate_gate(
        _task(),
        attack=_attack_breaches_until(1),
        seal=_seal_ok,
        specialists=ONE_SPECIALIST,
        max_rounds=3,
        emit=events.append,
    )
    types = {e.type for e in events}
    assert {"agent_spawn", "agent_move", "breach_found", "patch_applied", "agent_killed"} <= types
