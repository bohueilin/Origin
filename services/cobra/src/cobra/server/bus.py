"""In-process event bus: the engine emits Seam 2 events, websocket clients consume them.

`to_wire`/`from_wire` are the single serialization path shared by live, replay, and
recording, so the wire format can never drift between them. `from_wire` rebuilds the
locked dataclass by its `type` tag, which doubles as a schema check on replayed data.
The bus knows nothing about the engine, FastAPI, or files.
"""

import asyncio
import dataclasses

from cobra import events
from cobra.events import Event

# Wire tag -> the locked Seam 2 dataclass. Adding a type here without one in events.py
# (or vice versa) is the only legal way to evolve the schema — and it's frozen.
_BY_TAG: dict[str, type] = {
    "agent_spawn": events.AgentSpawn,
    "agent_move": events.AgentMove,
    "breach_found": events.BreachFound,
    "patch_applied": events.PatchApplied,
    "patch_rejected": events.PatchRejected,
    "agent_killed": events.AgentKilled,
    "robustness_update": events.RobustnessUpdate,
}


def to_wire(event: Event) -> dict:
    """Serialize a Seam 2 event dataclass to its wire dict (the `type` tag rides along)."""
    return dataclasses.asdict(event)


def from_wire(wire: dict) -> Event:
    """Rebuild the locked dataclass from a wire dict; raises on an unknown/invalid tag."""
    cls = _BY_TAG[wire["type"]]
    return cls(**{k: v for k, v in wire.items() if k != "type"})


class EventBus:
    """Fan-out pub/sub. Producers (live/replay/fakes) call `emit`; each client `subscribe`s."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[dict]] = set()
        self._backlog: list[dict] = []
        # Set on the first subscribe — lets replay wait for the dashboard so the
        # demo always plays the attack from move zero, not a mid-run backlog dump.
        self.connected = asyncio.Event()

    def emit(self, event: Event) -> None:
        """Serialize once, append to the backlog, fan out to every connected client."""
        wire = to_wire(event)
        self._backlog.append(wire)
        for queue in list(self._subscribers):
            queue.put_nowait(wire)

    def subscribe(self) -> asyncio.Queue[dict]:
        """Register a client; pre-load the backlog so a late join catches up to current state."""
        queue: asyncio.Queue[dict] = asyncio.Queue()
        for wire in self._backlog:
            queue.put_nowait(wire)
        self._subscribers.add(queue)
        self.connected.set()
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict]) -> None:
        self._subscribers.discard(queue)
