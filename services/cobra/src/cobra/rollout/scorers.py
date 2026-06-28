"""Injected reward scorers for the rollout harness — the composition root that knows the grader.

The rollout loop stays free of grader internals; it just calls three callables (task, completion)
-> int. `mock_scorers` lets the harness run before the real reward lands (parallel dev / tests);
`real_scorers` wraps the hardened grader + oracle with the 3-disjoint-input-set split
(base→r_naive, harden→r_hardened, oracle→t_oracle), mirroring breadth.loop._split_plus for
eval-honesty #2. When a real env's reward lands, swap a new provider here — nothing else changes.
"""

from __future__ import annotations

from collections.abc import Callable

Scorer = Callable[[object, str], int]


def mock_scorers() -> tuple[Scorer, Scorer, Scorer]:
    """Marker scorers for tests/parallel dev: 'HONEST' passes all; 'CHEAT' passes naive only."""

    def r_naive(task, c: str) -> int:
        return 1 if ("HONEST" in c or "CHEAT" in c) else 0

    def r_hardened(task, c: str) -> int:
        return 1 if "HONEST" in c else 0

    def t_oracle(task, c: str) -> int:
        return 1 if "HONEST" in c else 0

    return r_naive, r_hardened, t_oracle


def _split_plus(task):
    """Disjoint halves of plus_input (hardening pool, held-out oracle), excluding base cases.
    Mirrors breadth.loop._split_plus so grader and oracle never share a case (eval-honesty #2)."""
    base = {repr(x) for x in task.base_input}
    seen: set[str] = set()
    plus_only = []
    for x in task.plus_input:
        key = repr(x)
        if key not in base and key not in seen:
            seen.add(key)
            plus_only.append(x)
    return plus_only[0::2], plus_only[1::2]


def real_scorers() -> tuple[Scorer, Scorer, Scorer]:
    """Reward scorers over the real hardened grader + oracle. Grader internals are imported HERE
    (not in the rollout loop); per-task setup is cached. Swap point for a real env's reward."""
    from ..grader.spec import Grader
    from ..substrate import expected_outputs
    from ..suite import score_solution
    from ..templates import PRISTINE_HELDOUT, apply_patch, grade

    cache: dict = {}  # task_id -> (naive_grader, hardened_grader, oracle_cases)

    def _prep(task):
        if task.task_id not in cache:
            harden_inputs, oracle_inputs = _split_plus(task)
            oracle_cases = list(
                zip(oracle_inputs, expected_outputs(task, oracle_inputs), strict=True)
            )
            naive = Grader(task)
            hardened = apply_patch(naive, PRISTINE_HELDOUT, {"held_out_inputs": harden_inputs})
            cache[task.task_id] = (naive, hardened, oracle_cases)
        return cache[task.task_id]

    def _safe(fn) -> int:
        try:
            return fn()
        except Exception:
            return 0

    def r_naive(task, c: str) -> int:
        naive, _, _ = _prep(task)
        return _safe(lambda: grade(naive, c))

    def r_hardened(task, c: str) -> int:
        _, hardened, _ = _prep(task)
        return _safe(lambda: grade(hardened, c))

    def t_oracle(task, c: str) -> int:
        _, _, oracle_cases = _prep(task)
        return _safe(
            lambda: (
                1 if oracle_cases and score_solution(task.entry_point, c, oracle_cases) == 1 else 0
            )
        )

    return r_naive, r_hardened, t_oracle


def rg_real_scorers() -> tuple[Scorer, Scorer, Scorer]:
    """Reward scorers over the REAL reasoning-gym grader + oracle (the RGTask swap-in provider).

    r_naive    = lenient substring grader (reasoning-gym's default scorer, binarized);
    r_hardened = the same grader cue-patched (REQUIRE_CUE);
    t_oracle   = the strict final-number oracle.

    Eval honesty: grader and oracle are disjoint by construction (different parse rules), and the
    oracle is the FINAL scorer only — it is never exposed to a policy or used to select.
    """
    from ..grader.spec import Grader
    from ..substrate import rg_oracle
    from ..templates import REQUIRE_CUE, apply_patch, grade

    def _safe(fn) -> int:
        try:
            return fn()
        except Exception:
            return 0

    def r_naive(task, c: str) -> int:
        return _safe(lambda: grade(Grader(task), c))

    def r_hardened(task, c: str) -> int:
        return _safe(lambda: grade(apply_patch(Grader(task), REQUIRE_CUE, {}), c))

    def t_oracle(task, c: str) -> int:
        return _safe(lambda: rg_oracle(task, c))

    return r_naive, r_hardened, t_oracle
