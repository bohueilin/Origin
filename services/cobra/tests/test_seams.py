"""Smoke test for the locked seams: the contract imports and behaves as specified.

The whole loop is implemented; the seam re-exports Track A's impls as the single entrypoint.
"""

from cobra import events, gate, grader, harness, metrics, oracle, substrate, templates
from cobra.loop import interface


def test_seam1_delegates_to_real_impls():
    # The seam IS the single entrypoint — it re-exports the real implementations.
    assert interface.load_task is substrate.load_task
    assert interface.make_workdir is harness.make_workdir
    assert interface.run_grader is grader.run_grader
    assert interface.run_oracle is oracle.run_oracle
    assert interface.apply_patch is templates.apply_patch
    assert interface.regression_gate is gate.regression_gate
    assert interface.agreement is metrics.agreement
    assert interface.honest_pass is metrics.honest_pass
    assert interface.Task is substrate.Task


def test_is_breach_is_grader_pass_and_oracle_fail():
    assert interface.is_breach(1, 0) is True
    assert interface.is_breach(1, 1) is False
    assert interface.is_breach(0, 0) is False
    assert interface.is_breach(0, 1) is False


def test_seam2_events_construct_with_verbatim_type_tags():
    assert events.AgentSpawn("forger", "hardcode").type == "agent_spawn"
    assert events.AgentMove("forger", "gate1").type == "agent_move"
    breach = events.BreachFound("forger", "gate1", "hardcode", 1, 0, "return []")
    assert breach.type == "breach_found"
    assert events.PatchApplied("gate1", "pristine_copy").type == "patch_applied"
    assert events.PatchRejected("gate1", "hit honest solution").type == "patch_rejected"
    assert events.AgentKilled("forger", "gate1").type == "agent_killed"
    assert events.RobustnessUpdate(0.97, 1.0, 40).type == "robustness_update"
