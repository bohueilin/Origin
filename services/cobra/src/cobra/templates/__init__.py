"""Hardening template library: parameterized patches that strengthen a grader."""

from .registry import PRISTINE_HELDOUT, apply_patch, grade
from .rg_templates import REJECT_MULTIPLE, REQUIRE_CUE, REQUIRE_DELIMITED

__all__ = [
    "PRISTINE_HELDOUT",
    "apply_patch",
    "grade",
    "REJECT_MULTIPLE",
    "REQUIRE_CUE",
    "REQUIRE_DELIMITED",
]
