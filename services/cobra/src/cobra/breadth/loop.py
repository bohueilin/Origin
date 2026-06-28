"""Milestone 2: run the M1 loop across an EvalPlus subset + the exploitability hit-rate.

Per task: split plus_input into two disjoint halves — one used for hardening, the other as
the held-out oracle — so the grader and the oracle share ZERO cases (invariant #2). Seed the
breaches with the generic forger (or consume an injected discover_fn supplied by the
engine/CLI), validate them as genuine (R=1 AND T=0), split train/held-out, accept a patch via
the regression gate on TRAIN only, then measure agreement before/after on the held-out split
with honest_pass beside it.

This module is pure spine/metrics: it never imports the engine (agents). The red swarm is
injected as `discover_fn` by the composition root (the CLI), and spine deps reach it through
the loop.interface seam, not the engine.

Tasks are independent, so they run in parallel; results are placed in task order and all
splits are deterministic, so the aggregate is reproducible.
"""

import concurrent.futures
import os
from dataclasses import dataclass
from statistics import mean

from ..gate import regression_gate
from ..loop.interface import Grader
from ..metrics.agreement import agreement, baseline_agreement, honest_pass
from ..metrics.loop import split_breaches
from ..substrate import expected_outputs, load_subset
from ..suite import score_solution
from ..templates import PRISTINE_HELDOUT, apply_patch, grade
from .cheats import forger_cheats

DEFAULT_COUNT = 25
DEFAULT_WORKERS = 8


@dataclass
class TaskResult:
    task_id: str
    error: str
    source: str
    n_breaches: int
    breachable: bool
    measurable: bool
    agreement_before: float | None
    agreement_after: float | None
    honest_pass: float | None
    n_held_out: int = 0  # held-out cheats measured (for the Tier A consequence points)


@dataclass
class BreadthReport:
    source: str
    n_requested: int
    n_loaded: int
    n_failed: int
    n_breachable: int
    n_measurable: int
    mean_agreement_before: float | None
    mean_agreement_after: float | None
    mean_honest_pass: float | None
    results: list

    @property
    def n_graders(self) -> int:
        return self.n_loaded - self.n_failed

    @property
    def hit_rate(self) -> float:
        return self.n_breachable / self.n_graders if self.n_graders else 0.0


def maybe_client():
    """Build an Anthropic client if a key is present, else None (-> seed fallback)."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return None
    try:
        from anthropic import Anthropic

        return Anthropic(timeout=60, max_retries=2)
    except Exception:
        return None


def _split_plus(task) -> tuple[list, list]:
    """Disjoint halves of plus_input: (hardening pool, held-out oracle).

    Excludes any plus case that is also a base case (for some tasks plus overlaps base) and
    dedupes, so the grader's cases (base + hardening) never share with the oracle — invariant
    #2 holds at the case level, not just by assumption.
    """
    base = {repr(x) for x in task.base_input}
    seen: set[str] = set()
    plus_only = []
    for x in task.plus_input:
        key = repr(x)
        if key not in base and key not in seen:
            seen.add(key)
            plus_only.append(x)
    return plus_only[0::2], plus_only[1::2]


def run_task(task, candidates: list[str] | None = None, discover_fn=None) -> TaskResult:
    """The full M1 loop on one task. Never raises — failures are recorded honestly.

    `discover_fn(task) -> list[str]` is the engine-supplied breach source (the red swarm),
    injected by the caller; when absent the deterministic seed forger is used.
    """
    try:
        gold = task.prompt + task.canonical_solution
        harden_inputs, oracle_inputs = _split_plus(task)
        oracle_cases = list(zip(oracle_inputs, expected_outputs(task, oracle_inputs), strict=True))

        if candidates is not None:
            source = "provided"
        elif discover_fn is not None:
            candidates = discover_fn(task)  # engine-supplied (red swarm)
            source = "discovered"
        else:
            candidates = forger_cheats(task)  # labeled seed fallback
            source = "seed"

        naive = Grader(task)
        if source == "discovered":
            # discover_fn's contract: every returned source already passed the NAIVE grader
            # (run_grader on the agent's workdir -> R_naive=1), harness tampering included.
            # So a breach is simply an oracle failure. Re-grading with the pristine rebuild
            # here would score the HARDENED grader and mislabel it the baseline (the bug).
            breaches = [
                c for c in candidates if score_solution(task.entry_point, c, oracle_cases) == 0
            ]
        else:
            # seed/provided are solution-level cheats with no agent run; for these the naive
            # grader equals the pristine base on the source, so grade(naive, c) IS R_naive.
            breaches = [
                c
                for c in candidates
                if grade(naive, c) == 1 and score_solution(task.entry_point, c, oracle_cases) == 0
            ]
        train, held_out = split_breaches(breaches)

        # The hardened grader = pristine read-only copy of the base tests (+ held-out inputs).
        # Accept it via the regression gate on the TRAIN breaches only.
        grader_prime = apply_patch(naive, PRISTINE_HELDOUT, {"held_out_inputs": harden_inputs})
        accepted = bool(train) and all(regression_gate(grader_prime, b, gold) for b in train)
        measurable = bool(train and held_out and accepted)
        measured = grader_prime if accepted else naive

        # agreement BEFORE = the naive grader's blocked-fraction, via the shared baseline source
        # of truth. Every breach passed the naive grader by construction (R_naive=1), so the
        # verdicts are all 1 -> 0.0. The pristine rebuild is the AFTER, scored by agreement(...).
        return TaskResult(
            task_id=task.task_id,
            error="",
            source=source,
            n_breaches=len(breaches),
            breachable=bool(breaches),
            measurable=measurable,
            agreement_before=baseline_agreement([1] * len(held_out)) if measurable else None,
            agreement_after=agreement(measured, held_out) if measurable else None,
            honest_pass=honest_pass(grader_prime, [gold]) if breaches else None,
            n_held_out=len(held_out),
        )
    except Exception as exc:  # coverage honesty: record the failure, never crash the sweep
        return TaskResult(task.task_id, repr(exc), "error", 0, False, False, None, None, None)


def run_breadth(
    n_tasks: int = DEFAULT_COUNT,
    workers: int = DEFAULT_WORKERS,
    candidates_by_task: dict | None = None,
    discover_fn=None,
    tasks: list | None = None,
) -> BreadthReport:
    """Run the M1 loop across an EvalPlus slice and aggregate.

    `tasks` (e.g. load_hardest(n)) overrides the default first-n_tasks slice. With a `discover_fn`
    (supplied by the engine/CLI), breaches are discovered by the red swarm per task
    (non-deterministic); without one, the deterministic seed forger is used (labeled).
    """
    selected = load_subset(n_tasks) if tasks is None else tasks
    n_requested = n_tasks if tasks is None else len(selected)
    by_task = candidates_by_task or {}
    results: list = [None] * len(selected)
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        index = {
            pool.submit(run_task, t, by_task.get(t.task_id), discover_fn): i
            for i, t in enumerate(selected)
        }
        for fut in concurrent.futures.as_completed(index):
            results[index[fut]] = fut.result()

    n_failed = sum(1 for r in results if r.error)
    n_breachable = sum(1 for r in results if r.breachable)
    measurable = [r for r in results if r.measurable]
    sources = sorted({r.source for r in results})
    source = sources[0] if len(sources) == 1 else "+".join(sources)

    if measurable:
        mean_before = mean(r.agreement_before for r in measurable)
        mean_after = mean(r.agreement_after for r in measurable)
        mean_hp = mean(r.honest_pass for r in measurable)
    else:
        mean_before = mean_after = mean_hp = None

    return BreadthReport(
        source=source,
        n_requested=n_requested,
        n_loaded=len(selected),
        n_failed=n_failed,
        n_breachable=n_breachable,
        n_measurable=len(measurable),
        mean_agreement_before=mean_before,
        mean_agreement_after=mean_after,
        mean_honest_pass=mean_hp,
        results=results,
    )
