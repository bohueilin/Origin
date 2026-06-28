"""Grader: the naive runtime verdict (run_grader) and the grader-as-data spec."""

from .runner import run_grader
from .spec import Grader, Patch

__all__ = ["Grader", "Patch", "run_grader"]
