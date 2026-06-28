"""Track C — golden_run.jsonl is an honest recording of a real live run and replays in order.

The golden is no longer the scripted fixture (fakes.siege_script) — it's a byte-for-byte
recording of an actual engine run, so these tests validate its *properties* (valid Seam 2,
a real before->after climb, honest-pass preserved) rather than equality to any script.
"""

import asyncio
from pathlib import Path

from cobra.server.bus import EventBus, to_wire
from cobra.server.replay import ReplayPublisher, load_golden

GOLDEN = Path(__file__).resolve().parents[1] / "golden_run.jsonl"


def test_golden_is_a_valid_seam2_recording():
    events = load_golden(GOLDEN)  # from_wire raises on any line not matching the locked schema
    assert len(events) > 0
    tags = {to_wire(e)["type"] for e in events}
    # a real siege: swarm probes, breaches a gate, patches it, seals it, reports robustness
    assert {
        "agent_spawn",
        "agent_move",
        "breach_found",
        "patch_applied",
        "agent_killed",
        "robustness_update",
    } <= tags


def test_golden_shows_a_real_before_after_climb():
    wire = [to_wire(e) for e in load_golden(GOLDEN)]
    robust = [e["held_out_blocked"] for e in wire if e["type"] == "robustness_update"]
    assert len(robust) >= 2
    assert robust[-1] > robust[0]  # hardened grader beats the naive baseline — a real climb
    honest = [e["honest_pass"] for e in wire if e["type"] == "robustness_update"]
    assert all(h == 1.0 for h in honest)  # honest-pass preserved throughout (eval honesty)


def test_replay_emits_the_golden_recording_in_order():
    async def scenario():
        bus = EventBus()
        queue = bus.subscribe()
        await ReplayPublisher(GOLDEN, bus, delay=0.0).run()
        return [queue.get_nowait() for _ in range(queue.qsize())]

    assert asyncio.run(scenario()) == [to_wire(e) for e in load_golden(GOLDEN)]
