"""Property-based hardening of the oracle — the one thing that must never be wrong.

The example-based suite (test_oracle.py) pins the oracle contract on HumanEval/0.
This suite proves the SAME invariants hold for GENERATED inputs across a pool of
tasks — the moat is only a moat if it is right everywhere, not on the one case we
hand-picked. Every property here defends eval-honesty (see CLAUDE.md):

  * invariant #2 — grader (base) and oracle (plus) never share a case;
  * the oracle is sound (gold passes, a crash/wrong answer fails);
  * the oracle is deterministic and never mutates the agent's workdir.

Sandbox-executing properties are bounded (small max_examples, deadline=None)
because each runs a real subprocess; the pure properties run wider.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from cobra.grader import run_grader
from cobra.harness import make_workdir
from cobra.oracle import is_breach, run_oracle
from cobra.substrate import expected_outputs, load_subset

# A small, deterministic pool loaded once (dataset caches on first call). Kept
# tiny so the sandbox-executing properties stay fast in CI.
try:
    _POOL = load_subset(8)
except Exception as exc:  # pragma: no cover - dataset unavailable offline
    _POOL = []
    _POOL_ERR = exc

pytestmark = pytest.mark.skipif(not _POOL, reason="EvalPlus dataset unavailable")

SANDBOX = settings(max_examples=5, deadline=None,
                   suppress_health_check=[HealthCheck.function_scoped_fixture])


def _gold(task) -> str:
    return task.prompt + task.canonical_solution


def _digest_tree(root: Path) -> str:
    """Order-independent content digest of every file under root."""
    h = hashlib.sha256()
    for p in sorted(root.rglob("*")):
        if p.is_file():
            h.update(p.relative_to(root).as_posix().encode())
            h.update(b"\0")
            h.update(p.read_bytes())
            h.update(b"\0")
    return h.hexdigest()


# ── pure invariants (wide) ────────────────────────────────────────────────────

@given(R=st.sampled_from([0, 1]), T=st.sampled_from([0, 1]))
def test_is_breach_is_exactly_grader_pass_oracle_fail(R, T):
    """A breach is R=1 & T=0 and nothing else — the whole robustness metric hangs on this."""
    assert is_breach(R, T) == (R == 1 and T == 0)


@given(i=st.integers(min_value=0, max_value=len(_POOL) - 1))
@settings(max_examples=len(_POOL))
def test_oracle_holdout_dominates_the_visible_set(i):
    """Invariant #2, the load-bearing version: the oracle's held-out set (plus - base)
    dominates. Raw EvalPlus occasionally regenerates a single base case into plus (e.g.
    HumanEval/3 shares 1 of 898), so exact disjointness is a property of the dataset, not
    of cobra — but the held-out signal must stay overwhelming (>=95% of plus is unseen by
    the grader) or the robustness number is measuring visible cases."""
    task = _POOL[i]
    base = {repr(x) for x in task.base_input}
    plus = {repr(x) for x in task.plus_input}
    holdout = plus - base
    assert len(holdout) >= 0.95 * len(plus), (
        f"{task.task_id}: only {len(holdout)}/{len(plus)} plus cases are held out"
    )
    assert holdout, f"{task.task_id}: oracle has no held-out cases"


@given(i=st.integers(min_value=0, max_value=len(_POOL) - 1))
@settings(max_examples=len(_POOL))
def test_expected_outputs_are_deterministic(i):
    """The held-out expected values are a pure function of the gold + inputs."""
    task = _POOL[i]
    assert expected_outputs(task, task.plus_input) == expected_outputs(task, task.plus_input)


# ── soundness + safety (sandbox, bounded) ─────────────────────────────────────

@given(i=st.integers(min_value=0, max_value=len(_POOL) - 1))
@SANDBOX
def test_gold_always_passes_the_oracle(i, tmp_path_factory):
    """Ground truth is sound: the canonical solution scores T=1 on every task."""
    task = _POOL[i]
    wd = make_workdir(task, root=tmp_path_factory.mktemp("gold"))
    (wd / "solution.py").write_text(_gold(task))
    assert run_oracle(task, wd) == 1


@given(i=st.integers(min_value=0, max_value=len(_POOL) - 1))
@SANDBOX
def test_crashing_solution_never_passes(i, tmp_path_factory):
    """Soundness the other way: a solution that raises can never earn T=1."""
    task = _POOL[i]
    wd = make_workdir(task, root=tmp_path_factory.mktemp("crash"))
    (wd / "solution.py").write_text(
        f"def {task.entry_point}(*args, **kwargs):\n    raise ValueError('nope')\n"
    )
    assert run_oracle(task, wd) == 0


@given(i=st.integers(min_value=0, max_value=len(_POOL) - 1))
@SANDBOX
def test_oracle_is_deterministic(i, tmp_path_factory):
    """The same solution scores the same verdict twice — no hidden state, no flakiness."""
    task = _POOL[i]
    wd = make_workdir(task, root=tmp_path_factory.mktemp("det"))
    (wd / "solution.py").write_text(_gold(task))
    assert run_oracle(task, wd) == run_oracle(task, wd)


@given(i=st.integers(min_value=0, max_value=len(_POOL) - 1))
@SANDBOX
def test_oracle_never_mutates_the_agent_workdir(i, tmp_path_factory):
    """The oracle reads the workdir; it must never write to it (SPEC §4)."""
    task = _POOL[i]
    wd = make_workdir(task, root=tmp_path_factory.mktemp("nomut"))
    (wd / "solution.py").write_text(_gold(task))
    before = _digest_tree(wd)
    run_oracle(task, wd)
    assert _digest_tree(wd) == before


@given(i=st.integers(min_value=0, max_value=len(_POOL) - 1))
@SANDBOX
def test_breach_relation_holds_end_to_end(i, tmp_path_factory):
    """The gold is never a breach: grader and oracle agree it passes (R=1, T=1)."""
    task = _POOL[i]
    wd = make_workdir(task, root=tmp_path_factory.mktemp("e2e"))
    (wd / "solution.py").write_text(_gold(task))
    R = run_grader(wd)
    T = run_oracle(task, wd)
    assert not is_breach(R, T)
