"""Golden replay — feed a recorded JSONL run onto the bus, decoupled from the live engine.

The dashboard speaks only websocket JSON and cannot tell replay from a live run: both pass
through the same EventBus and the same serializer. Replay reconstructs each locked dataclass
via `from_wire`, so a malformed golden line fails loudly here instead of reaching the UI.
"""

import asyncio
import json
from pathlib import Path

from cobra.events import Event
from cobra.server.bus import EventBus, from_wire


def load_golden(path: str | Path) -> list[Event]:
    """Parse a JSONL golden run into validated Seam 2 events."""
    text = Path(path).read_text()
    return [from_wire(json.loads(line)) for line in text.splitlines() if line.strip()]


class ReplayPublisher:
    """Emit a recorded run onto the bus, paced so the siege reads as a live story."""

    def __init__(self, path: str | Path, bus: EventBus, delay: float = 0.7, speed: float = 1.0):
        self._events = load_golden(path)
        self._bus = bus
        self._gap = delay / speed if speed else 0.0

    async def run(self) -> None:
        for event in self._events:
            self._bus.emit(event)
            if self._gap:
                await asyncio.sleep(self._gap)
