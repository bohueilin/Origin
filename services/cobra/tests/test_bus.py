"""Track C — the event bus and its serialization path are faithful to the locked Seam 2."""

import asyncio

from cobra.server import fakes
from cobra.server.bus import EventBus, from_wire, to_wire


def test_to_wire_carries_the_verbatim_type_tag_and_fields():
    wire = to_wire(fakes.siege_script()[1])  # the forger's agent_spawn
    assert wire == {
        "agent": "forger",
        "specialty": "hardcode visible outputs",
        "type": "agent_spawn",
    }


def test_every_golden_event_round_trips_through_the_wire():
    for event in fakes.siege_script():
        assert from_wire(to_wire(event)) == event


def test_siege_script_exercises_all_seven_event_types():
    tags = {to_wire(e)["type"] for e in fakes.siege_script()}
    assert tags == {
        "agent_spawn",
        "agent_move",
        "breach_found",
        "patch_applied",
        "patch_rejected",
        "agent_killed",
        "robustness_update",
    }


def test_emit_fans_out_and_late_subscribers_get_the_backlog():
    async def scenario():
        bus = EventBus()
        early = bus.subscribe()
        for event in fakes.siege_script():
            bus.emit(event)
        late = bus.subscribe()  # joins after the siege — must still catch up
        return early.qsize(), late.qsize()

    early_count, late_count = asyncio.run(scenario())
    n = len(fakes.siege_script())
    assert early_count == n
    assert late_count == n


def test_unsubscribe_stops_delivery():
    async def scenario():
        bus = EventBus()
        queue = bus.subscribe()
        bus.unsubscribe(queue)
        bus.emit(fakes.siege_script()[0])
        return queue.qsize()

    assert asyncio.run(scenario()) == 0
