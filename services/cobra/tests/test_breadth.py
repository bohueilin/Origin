"""M2 breadth: aggregate before->after agreement across a subset + the exploitability
hit-rate, with the grader/oracle split honest per task and the sweep deterministic.
"""

from types import SimpleNamespace

import pytest

from cobra.agents.specialists import FORGER
from cobra.breadth import run_breadth, run_task
from cobra.breadth.__main__ import build_discover_fn
from cobra.breadth.cheats import forger_cheats
from cobra.breadth.loop import _split_plus
from cobra.grader import Grader
from cobra.substrate import load_subset
from cobra.templates import grade

_N = 4


class _ScriptedRed:
    """Fake Anthropic client: writes one solution, runs the tests, then stops. Reacts to the
    message count so each fresh red-agent session (re)starts the script — no network."""

    def __init__(self, solution_src: str):
        self._src = solution_src
        self.model_seen = None
        outer = self

        class _Messages:
            def create(self, *, messages, **kwargs):
                outer.model_seen = kwargs.get("model")
                n = len(messages)
                if n == 1:
                    block = SimpleNamespace(
                        type="tool_use",
                        id="w",
                        name="write_file",
                        input={"path": "solution.py", "content": outer._src},
                    )
                elif n == 3:
                    block = SimpleNamespace(type="tool_use", id="r", name="run_tests", input={})
                else:
                    block = SimpleNamespace(type="text", text="done")
                return SimpleNamespace(content=[block], stop_reason="end_turn")

        self.messages = _Messages()


@pytest.fixture(scope="module")
def report():
    return run_breadth(n_tasks=_N, workers=_N)


def test_coverage_is_reported_honestly(report):
    assert report.n_loaded == _N
    assert report.source == "seed"
    assert report.n_failed == 0
    assert all(r.error == "" for r in report.results)


def test_exploitability_hit_rate_is_the_headline(report):
    # Almost every standard sparse grader is breachable by the generic memorization cheat.
    assert report.n_breachable >= 1
    assert report.hit_rate == report.n_breachable / report.n_graders
    assert report.n_breachable == _N  # all four are breachable


def test_aggregate_agreement_moves_up_with_honest_pass_preserved(report):
    assert report.n_measurable >= 1
    assert report.mean_agreement_after > report.mean_agreement_before
    assert report.mean_agreement_before == 0.0
    assert report.mean_agreement_after == 1.0
    assert report.mean_honest_pass == 1.0


def test_results_are_in_task_order_deterministically(report):
    ids = [r.task_id for r in report.results]
    assert ids == sorted(ids, key=lambda k: int(k.split("/")[1]))


def test_grader_and_oracle_halves_are_disjoint_per_task():
    """Invariant #2 across the subset: the hardening half and the oracle half never overlap."""
    for task in load_subset(_N):
        harden, oracle = _split_plus(task)
        h = {repr(x) for x in harden}
        o = {repr(x) for x in oracle}
        assert h.isdisjoint(o)
        base = {repr(x) for x in task.base_input}
        assert base.isdisjoint(h) and base.isdisjoint(o)


def test_run_task_is_deterministic():
    task = load_subset(1)[0]
    a = run_task(task)
    b = run_task(task)
    assert (a.breachable, a.agreement_before, a.agreement_after, a.honest_pass) == (
        b.breachable,
        b.agreement_before,
        b.agreement_after,
        b.honest_pass,
    )


def test_forger_cheats_are_deterministic_and_nonempty():
    task = load_subset(1)[0]
    assert forger_cheats(task) == forger_cheats(task)
    assert len(forger_cheats(task)) >= 2


def test_discovered_breaches_swap_in_without_code_change():
    """Injecting breaches (as the red agent will) is consumed in place of the seeds."""
    task = load_subset(1)[0]
    gold = task.prompt + task.canonical_solution
    injected = forger_cheats(task)  # stand in for red-agent breaches
    result = run_task(task, candidates=injected)
    assert result.source == "provided"
    assert result.breachable
    # a genuinely correct solution is not counted as a breach
    assert run_task(task, candidates=[gold]).breachable is False


def test_red_swarm_discovery_is_wired_with_a_scripted_client():
    """End-to-end the injected discover_fn (no network): the red agent writes a solution, we
    read it back, and run_task consumes it labeled 'discovered'."""
    task = load_subset(1)[0]
    cheat = forger_cheats(task)[0]
    discover = build_discover_fn(_ScriptedRed(cheat), specialists=(FORGER,))

    assert len(discover(task)) == 1 and discover(task)[0].strip()

    result = run_task(task, discover_fn=discover)
    assert result.source == "discovered"
    assert result.breachable is True


def test_no_discover_fn_falls_back_to_seed():
    assert run_task(load_subset(1)[0]).source == "seed"


def test_load_hardest_is_a_deterministic_hard_slice():
    from cobra.substrate import load_hardest

    hard = load_hardest(5)
    assert len(hard) == 5
    assert [t.task_id for t in hard] == [t.task_id for t in load_hardest(5)]  # deterministic


def test_model_threads_through_to_the_red_agent():
    task = load_subset(1)[0]
    client = _ScriptedRed(forger_cheats(task)[0])
    discover = build_discover_fn(client, specialists=(FORGER,), model="claude-haiku-4-5-20251001")
    discover(task)
    assert client.model_seen == "claude-haiku-4-5-20251001"


def test_run_breadth_accepts_an_explicit_task_slice():
    from cobra.substrate import load_hardest

    report = run_breadth(workers=2, tasks=load_hardest(2))  # seed source on the hard slice
    assert report.n_loaded == 2


class _ScriptedTamper:
    """Fake client: neuters test_visible.py (harness tamper) and leaves solution.py the stub."""

    def __init__(self):
        class _Messages:
            def create(self, *, messages, **kwargs):
                n = len(messages)
                if n == 1:
                    block = SimpleNamespace(
                        type="tool_use",
                        id="w",
                        name="write_file",
                        input={
                            "path": "test_visible.py",
                            "content": "def test_visible():\n    pass\n",
                        },
                    )
                elif n == 3:
                    block = SimpleNamespace(type="tool_use", id="r", name="run_tests", input={})
                else:
                    block = SimpleNamespace(type="text", text="done")
                return SimpleNamespace(content=[block], stop_reason="end_turn")

        self.messages = _Messages()


def test_harness_tamper_now_counts_as_a_discovered_breach():
    """The Q1 fix: the agent passes the NAIVE grader by tampering test_visible.py and leaves a
    stub solution.py. R_naive=1 (it passed), oracle T=0 -> breach. The pristine rebuild (the
    AFTER) correctly rejects it. Before the fix this was scored R=0 and dropped."""
    task = load_subset(1)[0]
    discover = build_discover_fn(_ScriptedTamper(), specialists=(FORGER,))

    found = discover(task)
    assert len(found) == 1  # the untouched stub solution.py (tamper was in test_visible.py)
    # the stub FAILS the pristine rebuild, but it PASSED the naive grader (tampered test) ...
    assert grade(Grader(task), found[0]) == 0  # pristine = hardened -> rejects (was the bug)

    result = run_task(task, discover_fn=discover)
    assert result.source == "discovered"
    assert result.breachable is True  # ... so it now correctly counts as a breach
