"""A second BASELINE verifier: the LLM-as-judge grader.

Instead of running tests, ask an LLM 'does this solution correctly and generally solve the
task?' and use that as pass/fail. This is the popular 'just use an LLM to grade' approach — a
FOIL we measure against, NOT the product verdict path (SPEC keeps LLM-judge out of the core:
it's non-deterministic). The point of the comparison: every off-the-shelf verifier (sparse
tests OR a raw LLM judge) has failure modes; our loop hardens the test grader into something
deterministic and trustworthy.
"""

from __future__ import annotations

from typing import Any

from ..grader.spec import Grader
from ..substrate import Task
from ..templates import grade

DEFAULT_MODEL = "claude-sonnet-4-6"

JUDGE_SYSTEM = (
    "You are grading a candidate solution to a programming task. Decide whether it correctly and "
    "GENERALLY solves the problem for all valid inputs — not just memorized or special-cased ones. "
    "Reply with exactly one word: PASS or FAIL."
)


def _make_client():
    from anthropic import Anthropic

    return Anthropic(timeout=60, max_retries=2)


def llm_grade(
    task: Task, solution_src: str, *, client: Any = None, model: str = DEFAULT_MODEL
) -> int:
    """LLM-as-judge verdict for `solution_src`: 1 (PASS) / 0 (FAIL). Non-deterministic."""
    if client is None:
        client = _make_client()
    resp = client.messages.create(
        model=model,
        max_tokens=8,
        system=JUDGE_SYSTEM,
        messages=[
            {
                "role": "user",
                "content": f"Task:\n{task.prompt}\n\nCandidate solution:\n{solution_src}",
            }
        ],
    )
    text = "".join(b.text for b in resp.content if b.type == "text").strip().upper()
    return 1 if text.startswith("PASS") else 0


def compare_verdicts(
    task: Task, labeled: list[tuple[str, str]], *, client: Any = None, model: str = DEFAULT_MODEL
) -> list[dict]:
    """For each (label, solution_src), report the naive test grader vs the LLM-judge verdict.

    `labeled` is e.g. [("gold", gold_src), ("forger_cheat", cheat_src), ...]. A trustworthy
    verifier passes gold (1) and fails cheats (0); each row exposes where a verifier disagrees.
    """
    naive = Grader(task)
    rows = []
    for label, src in labeled:
        rows.append(
            {
                "label": label,
                "naive_test_grader": grade(naive, src),
                "llm_judge": llm_grade(task, src, client=client, model=model),
            }
        )
    return rows
