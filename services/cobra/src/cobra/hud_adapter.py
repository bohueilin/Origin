"""Map a HUD environment into a Cobra EnvAdapter — run any dataset-style HUD env through the
verifier-safety pipeline with no extra work from its author.

A HUD env gives tasks + a reward in 0.0–1.0 (`@env.template`). We binarize that reward (the
verifier under test) at a threshold, and source the oracle: use the env's ground-truth if it has
one, else a DERIVED strong-model oracle (independent of the reward, but approximate — flag it).

Scope: dataset-style envs (prompt → answer → reward). Interactive/agentic envs (e.g. an SSH
workspace coding agent) need trajectory rollouts and are out of scope for single-completion scoring.
"""

from __future__ import annotations

from collections.abc import Callable

from .pipeline import EnvAdapter, Scorer

RewardFn = Callable[[object, str], float]  # HUD reward: (task, completion) -> 0.0..1.0


def threshold_scorer(reward: RewardFn, tau: float = 0.5) -> Scorer:
    """Binarize a continuous HUD reward: accept iff reward >= tau."""
    return lambda task, c: 1 if reward(task, c) >= tau else 0


def hud_adapter(
    load_tasks: Callable[[int], list],
    reward: RewardFn,
    *,
    oracle: Scorer,
    threshold: float = 0.5,
    name: str = "hud",
) -> EnvAdapter:
    """A HUD env as a Cobra adapter: its (thresholded) reward is the verifier under test.

    `oracle` is the env's ground truth if it has one, else `derive_oracle(...)`. `hardened` is left
    None — Cobra's harden loop produces it; until then the leaderboard compares naive vs naive.
    """
    return EnvAdapter(
        name=name,
        load_tasks=load_tasks,
        naive=threshold_scorer(reward, threshold),
        oracle=oracle,
    )


def derive_oracle(
    *, model: str = "claude-opus-4-8", client=None, prompt_of: Callable[[object], str] | None = None
) -> Scorer:
    """APPROXIMATE oracle for envs with no ground truth: a strong model judges correctness.

    Independent of the env's reward (different mechanism), but NOT gold — report results as
    'derived oracle'. `prompt_of` extracts the task statement (defaults to `task.prompt`).
    """
    from .baselines.llm_grader import llm_grade

    get_prompt = prompt_of or (lambda t: t.prompt)

    class _T:  # llm_grade reads task.prompt
        def __init__(self, p: str):
            self.prompt = p

    def oracle(task, completion: str) -> int:
        return llm_grade(_T(get_prompt(task)), completion, client=client, model=model)

    return oracle
