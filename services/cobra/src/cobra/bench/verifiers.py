"""Re-scoring verifiers — the bring-your-verifier entry point.

A column verifier (r_naive/r_hardened) reads a precomputed score. A re-scoring verifier grades the
rollout's RAW completions fresh: load the task by id, run a (task, completion) -> {0,1} scorer.
This is how anyone plugs in their own reward (or the LLM judge) and scores it on the same
adversarial rollout — without regenerating the dataset.
"""

from __future__ import annotations

from collections.abc import Callable
from functools import lru_cache

from ..rollout.dataset import Rollout
from .core import Verdict

ReScorer = Callable[[object, str], int]  # (task, completion) -> {0, 1}


def rescoring_verifier(score: ReScorer, *, load_task: Callable[[str], object]) -> Verdict:
    """Wrap a (task, completion)->{0,1} scorer as a Rollout-verdict; tasks loaded by id (cached)."""
    cached = lru_cache(maxsize=None)(load_task)

    def verdict(r: Rollout) -> int:
        return score(cached(r.task_id), r.completion)

    return verdict


def judge_verifier(*, model: str | None = None, client=None) -> Verdict:
    """LLM-as-judge as a plug-in verifier (reuses baselines.llm_grader). Needs ANTHROPIC_API_KEY."""
    from ..baselines.llm_grader import DEFAULT_MODEL, llm_grade
    from ..substrate import load_task

    m = model or DEFAULT_MODEL
    return rescoring_verifier(
        lambda task, c: llm_grade(task, c, client=client, model=m), load_task=load_task
    )
