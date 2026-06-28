"""B.5 — dumb-fuzzer baseline + the engine number (targeted vs brute force)."""

from cobra.baselines import engine_number, run_fuzzer


def test_fuzzer_is_deterministic_with_seed():
    def probe(gate, spec):
        return {"source": "x"} if spec.name == "forger" else None

    kw = dict(probe=probe, verify=lambda g, c: True, seed=7, target=2)
    r1 = run_fuzzer(["g1", "g2"], **kw)
    r2 = run_fuzzer(["g1", "g2"], **kw)
    assert r1.probes == r2.probes
    assert r1.breaches == r2.breaches and r1.found_all


def test_fuzzer_stops_at_budget_when_nothing_breaches():
    report = run_fuzzer(
        ["g1"], probe=lambda g, s: None, verify=lambda g, c: True, target=1, max_probes=15
    )
    assert report.probes == 15
    assert report.found_all is False


def test_engine_number_targeting_beats_brute_force():
    gates = ["g1", "g2", "g3"]  # 3 gates x 3 cheat types = 9 cells, all breachable
    en = engine_number(gates, probe=lambda g, s: {"source": "x"}, verify=lambda g, c: True, seed=0)

    assert en.breaches == 9
    assert en.smart_probes == 9  # conductor probes each cell exactly once
    assert en.brute_probes > en.smart_probes  # fuzzer re-probes cells (brute force)
    assert en.ratio > 1.0
