"""Tier A consequence number: naive pays for cheating, hardened pays ~0; exposed as the
robustness_update events the dashboard's Tier A slot consumes.
"""

import json

from cobra.breadth.loop import BreadthReport, TaskResult
from cobra.consequence import (
    as_robustness_updates,
    measure_consequence,
    run_consequence,
    tier_a_payload,
    write_tier_a,
)


def _fake_report(source="seed"):
    # Two measurable tasks: naive blocks nothing (pays full), hardened blocks all (pays 0).
    results = [
        TaskResult("HumanEval/0", "", source, 4, True, True, 0.0, 1.0, 1.0, n_held_out=2),
        TaskResult("HumanEval/1", "", source, 4, True, True, 0.0, 1.0, 1.0, n_held_out=2),
        TaskResult("HumanEval/2", "", source, 0, False, False, None, None, None, n_held_out=0),
    ]
    return BreadthReport(source, 3, 3, 0, 2, 2, 0.0, 1.0, 1.0, results)


def test_measure_consequence_naive_pays_hardened_does_not():
    c = measure_consequence(_fake_report())
    assert c.n_cheats == 4  # 2 + 2 held-out cheats
    assert c.reward_naive_points == 4.0  # naive pays for every cheat
    assert c.reward_hardened_points == 0.0  # hardened pays nothing
    assert c.reward_naive_rate == 1.0
    assert c.reward_hardened_rate == 0.0


def test_partial_hardening_gives_a_fractional_reward():
    # A hardened grader that only blocks half the held-out cheats still pays for the rest.
    results = [
        TaskResult("HumanEval/0", "", "discovered", 4, True, True, 0.0, 0.5, 1.0, n_held_out=4)
    ]
    report = BreadthReport("discovered", 1, 1, 0, 1, 1, 0.0, 0.5, 1.0, results)
    c = measure_consequence(report)
    assert c.reward_naive_points == 4.0
    assert c.reward_hardened_points == 2.0  # 4 * (1 - 0.5)
    assert c.reward_hardened_rate == 0.5


def test_exposed_as_robustness_update_events_for_the_dashboard():
    c = measure_consequence(_fake_report())
    events = as_robustness_updates(c)
    assert [e.type for e in events] == ["robustness_update", "robustness_update"]
    # naive = first reading (blocked_before), hardened = latest (blocked_after);
    # the dashboard computes reward = 1 - held_out_blocked.
    assert events[0].held_out_blocked == c.blocked_before
    assert events[1].held_out_blocked == c.blocked_after
    assert 1 - events[0].held_out_blocked == c.reward_naive_rate
    assert 1 - events[1].held_out_blocked == c.reward_hardened_rate
    assert all(e.probes == c.n_cheats for e in events)


def test_run_consequence_end_to_end_seed_is_deterministic():
    c = run_consequence(n_tasks=2, workers=2)  # seed source (no client)
    assert c.source == "seed"
    assert c.reward_naive_rate == 1.0  # leaky reward fully pays for cheating
    assert c.reward_hardened_rate == 0.0  # hardened pays ~0
    assert c.n_cheats >= 1


def test_write_tier_a_is_self_describing(tmp_path):
    c = measure_consequence(_fake_report(source="seed"))
    path = tmp_path / "tier_a.json"
    write_tier_a(c, path)
    assert json.loads(path.read_text()) == {
        "tier_a": {
            "naive_points": c.reward_naive_points,
            "hardened_points": c.reward_hardened_points,
            "source": "seed",
            "n_measurable": 2,
        }
    }


def test_tier_a_source_reflects_the_actual_run_never_confused():
    # source is written from the run, so a seed run can never be shown as discovered.
    assert tier_a_payload(measure_consequence(_fake_report("seed")))["tier_a"]["source"] == "seed"
    discovered = tier_a_payload(measure_consequence(_fake_report("discovered")))
    assert discovered["tier_a"]["source"] == "discovered"
