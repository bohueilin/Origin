"""Generic, deterministic seed breaches: the input-memorizing forger cheat.

For any task this builds cheating solutions that memorize the gold outputs for the VISIBLE
base inputs and return a fixed default for anything else. Such a solution passes the sparse
base grader (it reproduces the visible answers) but fails the expanded oracle (it has no real
logic) — the canonical reason EvalPlus exists. This is a generic cheat STRATEGY (a forger),
not a per-task planted answer; the red agent will replace it via discovered_breaches.
"""

from ..substrate import Task, expected_outputs


def _distinct_defaults(gold_base: list) -> list:
    """A few distinct 'always return this' defaults, so we get >=2 breach variants to split."""
    out = []
    for value in (gold_base[0], gold_base[-1], None, 0):
        if all(repr(value) != repr(seen) for seen in out):
            out.append(value)
    return out[:4]


def forger_cheats(task: Task) -> list[str]:
    """Memorize-the-visible-inputs cheats (one per distinct default)."""
    gold_base = expected_outputs(task, task.base_input)
    if not gold_base:
        return []
    memo = ", ".join(
        f"{repr(tuple(args))!r}: {out!r}"
        for args, out in zip(task.base_input, gold_base, strict=True)
    )
    return [
        f"def {task.entry_point}(*args):\n"
        f"    _MEMO = {{{memo}}}\n"
        f"    return _MEMO.get(repr(args), {default!r})\n"
        for default in _distinct_defaults(gold_base)
    ]
