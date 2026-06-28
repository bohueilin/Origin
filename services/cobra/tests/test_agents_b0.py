"""B.0 — confirm Track B can build against the locked seams, and the dev stubs behave."""

from cobra.agents import _stubs
from cobra.loop import interface


def test_seam1_contract_is_importable():
    # Track B builds against these 9 names; they must exist to import (bodies are A's).
    for name in (
        "load_task",
        "make_workdir",
        "run_grader",
        "run_oracle",
        "is_breach",
        "apply_patch",
        "regression_gate",
        "agreement",
        "honest_pass",
    ):
        assert callable(getattr(interface, name))


def test_dev_stub_grader_has_breach_shape():
    # R=1 (visible pass), T=0 (oracle fail) — the breach shape the red agent chases.
    assert _stubs.stub_run_grader(workdir=None) == 1
    assert _stubs.stub_run_oracle(workdir=None) == 0
