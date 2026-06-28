"""Hardening templates + how a grader scores a solution.

apply_patch applies a template to a COPY of a grader, never the original. grade scores a
solution under a grader: a pristine copy of the base tests plus every applied patch's extra
cases / config. Expected outputs always come from the gold, and held-out hardening inputs
are kept disjoint from the oracle (plus_input) by the caller — the grader never borrows the
oracle's cases (eval-honesty invariant #2, SPEC §4/§5).
"""

from ..grader.spec import Grader, Patch
from ..sandbox import DEFAULT_MEM_MB, DEFAULT_TIMEOUT
from ..substrate import Task, expected_outputs
from ..substrate.rg_task import RGTask
from ..suite import score_solution
from .rg_templates import RG_TEMPLATES, rg_grade

# Template 1: grade from a pristine read-only copy of the visible tests + held-out inputs.
PRISTINE_HELDOUT = "pristine_readonly_plus_heldout"


def _pristine_heldout(task: Task, params: dict):
    """Add held-out inputs (gold-labeled) to the pristine base suite.

    params:
      held_out_inputs : extra input arg-lists to grade on (expected derived from the gold).
      per_test_timeout: optional, tightens the execution budget (an over-aggressive value
                        is how a patch over-tightens and shoots a friendly).
    Returns (extra_cases, config_overrides).
    """
    held = list(params.get("held_out_inputs", []))
    extra = list(zip(held, expected_outputs(task, held), strict=True)) if held else []
    overrides = {}
    if "per_test_timeout" in params:
        overrides["timeout"] = float(params["per_test_timeout"])
    return extra, overrides


_TEMPLATES = {PRISTINE_HELDOUT: _pristine_heldout}


def apply_patch(grader: Grader, template_id: str, params) -> Grader:
    """Apply a hardening template to a COPY of the grader; return grader' (patched).

    The original grader is never mutated (Grader is frozen; a new instance is returned).
    """
    valid = RG_TEMPLATES if isinstance(grader.task, RGTask) else _TEMPLATES
    if template_id not in valid:
        raise KeyError(f"unknown template_id: {template_id!r}")
    patch = Patch(template_id=template_id, params=dict(params))
    return Grader(task=grader.task, patches=grader.patches + (patch,))


def grade(
    grader: Grader,
    solution_src: str,
    timeout: float = DEFAULT_TIMEOUT,
    mem_mb: int = DEFAULT_MEM_MB,
) -> int:
    """Score a solution under a grader: pristine base tests + every applied patch's cases.

    Returns 1 iff the solution passes all resulting cases within the (possibly tightened)
    config; else 0. Deterministic: same grader + same solution -> same score.

    RG graders score a STRING answer through a parse-tightening chain (no sandbox); the
    code path below runs candidate code in the subprocess sandbox.
    """
    if isinstance(grader.task, RGTask):
        return rg_grade(grader, solution_src)
    task = grader.task
    cases = list(zip(task.base_input, expected_outputs(task, task.base_input), strict=True))
    config = {"timeout": timeout, "mem_mb": mem_mb}
    for patch in grader.patches:
        extra, overrides = _TEMPLATES[patch.template_id](task, patch.params)
        cases.extend(extra)
        config.update(overrides)
    return score_solution(
        task.entry_point, solution_src, cases, config["timeout"], config["mem_mb"]
    )
