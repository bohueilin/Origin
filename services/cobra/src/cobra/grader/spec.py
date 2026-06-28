"""The grader as data: a task plus an ordered list of hardening patches.

A Grader is immutable. Hardening never mutates a grader in place — apply_patch returns a
new Grader with one more patch (see templates/). Scoring a solution under a grader
(templates.grade) rebuilds the test suite from the task each time (a pristine copy), so the
verdict can't be fooled by tampering with any on-disk test files.
"""

from dataclasses import dataclass, field

from ..substrate import Task


@dataclass(frozen=True)
class Patch:
    template_id: str
    params: dict = field(default_factory=dict)


@dataclass(frozen=True)
class Grader:
    task: Task
    patches: tuple[Patch, ...] = ()
