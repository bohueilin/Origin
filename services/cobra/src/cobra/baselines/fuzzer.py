"""B.5 — the dumb-fuzzer baseline (the engine number).

The fuzzer samples (gate, cheat_type) UNIFORMLY WITH REPLACEMENT: no allocate/dedup, no
diversify, no shared memory. It re-probes cells it already tried, so it needs many more
probes to discover the same breaches the conductor finds by probing each cell once.

`engine_number` runs both on the same injected probe/verify and reports probes-to-discover
the breach set: targeted (conductor) vs brute force (fuzzer). Discovery only — sealing is a
no-op here, so this measures raw probe efficiency, the secondary engine flex (not the product).
"""

from __future__ import annotations

import random
from collections.abc import Callable
from dataclasses import dataclass

from ..agents.specialists import TAXONOMY, Specialist
from ..conductor import SealResult, run_conductor


@dataclass
class FuzzerReport:
    probes: int
    breaches: list[tuple[str, str]]  # distinct (gate, cheat_type) cells breached
    found_all: bool


def run_fuzzer(
    gates: list[str],
    *,
    probe: Callable[[str, Specialist], dict | None],
    verify: Callable[[str, dict], bool],
    taxonomy: tuple[Specialist, ...] = TAXONOMY,
    seed: int = 0,
    target: int | None = None,
    max_probes: int = 10_000,
) -> FuzzerReport:
    """Brute-force probing with replacement. Stops at `target` distinct breaches or the budget."""
    rng = random.Random(seed)
    by_cheat = {s.cheat_type: s for s in taxonomy}
    cells = [(g, s.cheat_type) for g in gates for s in taxonomy]
    found: set[tuple[str, str]] = set()
    probes = 0

    while probes < max_probes:
        if target is not None and len(found) >= target:
            break
        gate, cheat_type = rng.choice(cells)  # with replacement — the dumb part
        probes += 1
        candidate = probe(gate, by_cheat[cheat_type])
        if candidate and verify(gate, candidate):
            found.add((gate, cheat_type))

    found_all = target is None or len(found) >= target
    return FuzzerReport(probes=probes, breaches=sorted(found), found_all=found_all)


@dataclass
class EngineNumber:
    breaches: int
    smart_probes: int  # conductor: each cell probed once (dedup + ordered coverage)
    brute_probes: int  # fuzzer: probes incl. repeats to find the same breaches

    @property
    def ratio(self) -> float:
        return self.brute_probes / self.smart_probes if self.smart_probes else 0.0


def engine_number(
    gates: list[str],
    *,
    probe: Callable[[str, Specialist], dict | None],
    verify: Callable[[str, dict], bool],
    taxonomy: tuple[Specialist, ...] = TAXONOMY,
    seed: int = 0,
    max_probes: int = 10_000,
) -> EngineNumber:
    """Probes to discover ALL breaches: conductor (targeted) vs fuzzer (brute force)."""
    smart = run_conductor(
        gates,
        probe=probe,
        verify=verify,
        seal=lambda g, c: SealResult(False),  # discovery only — no sealing
        taxonomy=taxonomy,
    )
    n = len(smart.breaches)
    brute = run_fuzzer(
        gates,
        probe=probe,
        verify=verify,
        taxonomy=taxonomy,
        seed=seed,
        target=n,
        max_probes=max_probes,
    )
    return EngineNumber(breaches=n, smart_probes=smart.probes, brute_probes=brute.probes)
