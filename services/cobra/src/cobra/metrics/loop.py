"""The Milestone 1 loop: discover/seed breaches -> patch on TRAIN -> measure on HELD-OUT.

Eval-honesty (non-negotiable, CLAUDE.md): breaches are split into a train split (used to
choose/parameterize the patch) and a held-out split (used only to measure). choose_patch only
ever receives the train split, so the patch never sees the held-out breaches. Agreement is
measured on the held-out split and always reported with honest_pass beside it.
"""

from dataclasses import dataclass

from ..grader import Grader
from ..substrate import Task, expected_outputs, load_task
from ..suite import score_solution
from ..templates import PRISTINE_HELDOUT, apply_patch
from .agreement import agreement, honest_pass
from .population import (
    CANDIDATE_POOL,
    discovered_breaches,
    genuine_breaches,
    seed_breaches,
)

TASK_ID = "HumanEval/0"


@dataclass
class MetricsReport:
    task_id: str
    source: str
    n_dropped: int
    train: list
    held_out: list
    grader_prime: Grader
    agreement_before: float
    agreement_after: float
    honest_pass: float
    patch_template: str

    @property
    def n_breaches(self) -> int:
        return len(self.train) + len(self.held_out)

    @property
    def hardening_inputs(self) -> list:
        if not self.grader_prime.patches:
            return []
        return self.grader_prime.patches[-1].params.get("held_out_inputs", [])


def split_breaches(breaches: list[str]) -> tuple[list[str], list[str]]:
    """Deterministic, disjoint train/held-out split (sorted for stability, then alternating)."""
    ordered = sorted(breaches)
    return ordered[0::2], ordered[1::2]


def choose_patch(task: Task, train_breaches: list[str], pool=CANDIDATE_POOL) -> Grader:
    """Tune a patch using ONLY the train breaches.

    Select candidate hardening inputs that expose at least one train breach (it disagrees
    with the gold there). The held-out breaches are never an input here.
    """
    chosen = []
    for inp in pool:
        expected = expected_outputs(task, [inp])[0]
        case = [(inp, expected)]
        exposes_train = any(score_solution(task.entry_point, b, case) == 0 for b in train_breaches)
        if exposes_train:
            chosen.append(inp)
    return apply_patch(Grader(task), PRISTINE_HELDOUT, {"held_out_inputs": chosen})


def run_m1(task: Task | None = None, candidates: list[str] | None = None) -> MetricsReport:
    """Run the full M1 loop on the task and return the before/after/honest-pass report."""
    task = task or load_task(TASK_ID)
    gold = task.prompt + task.canonical_solution

    if candidates is not None:
        source = "provided"
    else:
        candidates = discovered_breaches(task)
        source = "red_agent"
        if not candidates:
            candidates, source = seed_breaches(task), "seed"

    breaches = genuine_breaches(task, candidates)
    train, held_out = split_breaches(breaches)
    grader_prime = choose_patch(task, train)  # tuned on TRAIN only

    return MetricsReport(
        task_id=task.task_id,
        source=source,
        n_dropped=len(candidates) - len(breaches),
        train=train,
        held_out=held_out,
        grader_prime=grader_prime,
        agreement_before=agreement(Grader(task), held_out),  # un-hardened grader
        agreement_after=agreement(grader_prime, held_out),  # measured on HELD-OUT
        honest_pass=honest_pass(grader_prime, [gold]),
        patch_template=PRISTINE_HELDOUT,
    )
