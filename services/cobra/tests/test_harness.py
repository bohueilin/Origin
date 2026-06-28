"""Harness: the workdir holds exactly the three visible files, and the eval-honesty
boundary holds — the gold and the oracle are unreachable from the agent's dir.
"""

import importlib
import sys

from cobra.harness import make_workdir
from cobra.substrate import load_task


def _normalize(s: str) -> str:
    """Whitespace-insensitive form, so absence checks don't hinge on formatting."""
    return " ".join(s.split())


def _workdir_text(workdir) -> str:
    return "\n".join(p.read_text() for p in workdir.rglob("*") if p.is_file())


def test_workdir_has_exactly_three_visible_files(tmp_path):
    task = load_task("HumanEval/0")
    wd = make_workdir(task, root=tmp_path)
    assert sorted(p.name for p in wd.rglob("*") if p.is_file()) == [
        "runner.py",
        "solution.py",
        "test_visible.py",
    ]


def test_visible_suite_materializes_exactly_base_input_cases(tmp_path):
    """The one assertion that catches a plus input slipping into the visible grader."""
    task = load_task("HumanEval/0")
    wd = make_workdir(task, root=tmp_path)
    sys.path.insert(0, str(wd))
    try:
        tv = importlib.import_module("test_visible")
        assert len(tv.CASES) == len(task.base_input)
    finally:
        sys.path.remove(str(wd))
        for name in ("solution", "test_visible"):
            sys.modules.pop(name, None)
        importlib.invalidate_caches()


def test_gold_and_oracle_are_unreachable_from_the_workdir(tmp_path):
    task = load_task("HumanEval/0")
    wd = make_workdir(task, root=tmp_path)

    # (1) Not on disk — normalized, not a raw substring scan.
    blob = _normalize(_workdir_text(wd))
    assert _normalize(task.canonical_solution) not in blob
    base_norm = {_normalize(repr(x)) for x in task.base_input}
    plus_only = [x for x in task.plus_input if _normalize(repr(x)) not in base_norm]
    assert plus_only, "sanity: the oracle should have inputs beyond the base set"
    for x in plus_only[:50]:
        assert _normalize(repr(x)) not in blob

    # (2) Not importable — no module in the workdir exposes the gold source or plus inputs.
    sys.path.insert(0, str(wd))
    try:
        modules = [importlib.import_module(n) for n in ("solution", "test_visible")]
        for mod in modules:
            for val in vars(mod).values():
                assert val != task.plus_input
                if isinstance(val, str):
                    assert _normalize(task.canonical_solution) not in _normalize(val)
    finally:
        sys.path.remove(str(wd))
        for name in ("solution", "test_visible"):
            sys.modules.pop(name, None)
        importlib.invalidate_caches()
