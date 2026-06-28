"""B.4 — the conductor's four levers, tested with injected fakes (no LLM, deterministic)."""

from cobra.agents.specialists import SAPPER, TAXONOMY, Specialist
from cobra.conductor import SealResult, run_conductor


def _cand(tag="x"):
    return {"source": tag, "example": tag}


def test_allocate_probes_every_cell_exactly_once():
    gates = ["g1", "g2"]
    seen = []

    def probe(gate, spec):
        seen.append((gate, spec.cheat_type))
        return None  # all dead -> exhaust the frontier

    report = run_conductor(
        gates, probe=probe, verify=lambda g, c: True, seal=lambda g, c: SealResult(False)
    )

    assert report.probes == len(gates) * len(TAXONOMY)
    assert len(seen) == len(set(seen))  # no cell double-probed (anti-stampede)


def test_diversify_spreads_across_categories_before_repeating():
    order = []

    def probe(gate, spec):
        order.append(spec.cheat_type)
        return _cand()

    run_conductor(
        ["g1", "g2"],
        probe=probe,
        verify=lambda g, c: True,
        seal=lambda g, c: SealResult(False),  # leave unsealed so breaches accumulate
    )

    # The first round touches each category once before any repeats (anti-groupthink).
    assert set(order[:3]) == {s.cheat_type for s in TAXONOMY}


def test_gatekeep_blocks_unverified_findings():
    sealed_calls = []

    def seal(gate, cand):
        sealed_calls.append(cand)
        return SealResult(True)

    report = run_conductor(
        ["g1"],
        probe=lambda g, s: _cand(),
        verify=lambda g, c: False,  # nothing is corroborated
        seal=seal,
    )

    assert report.breaches == []  # unverified breach never spreads
    assert sealed_calls == []  # green is never invoked


def test_invalidate_kills_other_breaches_a_patch_also_seals():
    alpha = Specialist("alpha", "cheat_a", "sysA")
    beta = Specialist("beta", "cheat_b", "sysB")
    events = []

    def seal(gate, cand):
        # alpha's breach can't be sealed on its own; beta's patch can.
        if cand["source"] == "cheat_a":
            return SealResult(False, reason="over-tightened")
        return SealResult(True, "tpl", grader_prime="GP")

    report = run_conductor(
        ["g"],
        probe=lambda g, s: _cand(s.cheat_type),
        verify=lambda g, c: True,
        seal=seal,
        regrade=lambda gp, cand: 0,  # the beta patch also kills alpha's breach
        taxonomy=(alpha, beta),
        emit=events.append,
    )

    assert report.sealed == 2  # alpha sealed for free by beta's patch (Invalidate)
    killed = [e for e in events if e.type == "agent_killed"]
    assert len(killed) == 2
    assert sum(1 for e in events if e.type == "patch_applied") == 1
    assert sum(1 for e in events if e.type == "patch_rejected") == 1


def test_emits_full_seam2_event_set_on_a_seal():
    events = []

    run_conductor(
        ["g1"],
        probe=lambda g, s: _cand(),
        verify=lambda g, c: True,
        seal=lambda g, c: SealResult(True, "tpl", "GP"),
        regrade=lambda gp, c: 1,
        taxonomy=(SAPPER,),
        emit=events.append,
    )

    types = {e.type for e in events}
    assert {
        "agent_spawn",
        "agent_move",
        "breach_found",
        "patch_applied",
        "agent_killed",
        "robustness_update",
    } <= types
