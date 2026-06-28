"""Verifier catches every hard-constraint violation class."""

from src.generator import generate_state
from src.baselines import greedy
from src.verifier import evaluate, find_errors
from src.schemas import ScheduleAssignment


def _state():
    return generate_state(seed=3, horizon_days=14)


def test_clean_greedy_plan_has_no_violations():
    s = _state()
    res = evaluate(s, greedy(s))
    assert res.n_hard == 0, [e.type for e in res.errors]
    assert res.metrics["customer_trust"] == 100


def test_hallucinated_machine_detected():
    s = _state()
    p = greedy(s)
    p.schedule[0].machine_id = "M_DOES_NOT_EXIST"
    types = {e.type for e in find_errors(s, p)}
    assert "unknown_machine" in types


def test_machine_overlap_detected():
    s = _state()
    p = greedy(s)
    # force two real, existing assignments onto the same machine + window
    a, b = p.schedule[0], p.schedule[1]
    b.machine_id = a.machine_id
    b.start, b.end = a.start, a.end + 1
    types = {e.type for e in find_errors(s, p)}
    assert "machine_overlap" in types


def test_capability_mismatch_detected():
    s = _state()
    p = greedy(s)
    # find an op and move it to a machine lacking its capability
    a = p.schedule[0]
    op = s.operation(a.job_id, a.operation_id)
    bad = next(m for m in s.machines if op.capability not in m.capabilities)
    a.machine_id = bad.id
    types = {e.type for e in find_errors(s, p)}
    assert "capability_mismatch" in types


def test_precedence_violation_detected():
    s = _state()
    p = greedy(s)
    # find a job with >=2 ops and put a later op before its predecessor
    multi = next((j for j in s.jobs if len(j.operations) >= 2), None)
    assert multi is not None
    items = [a for a in p.schedule if a.job_id == multi.id]
    items.sort(key=lambda x: x.start)
    items[-1].start = 0
    items[-1].end = 1
    types = {e.type for e in find_errors(s, p)}
    assert "precedence_violation" in types


def test_reward_drops_with_violations():
    s = _state()
    clean = evaluate(s, greedy(s)).reward
    p = greedy(s)
    p.schedule[0].machine_id = "GHOST"
    assert evaluate(s, p).reward < clean
