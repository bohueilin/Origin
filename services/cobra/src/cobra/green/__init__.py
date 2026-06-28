"""Track B — the green team. An LLM selects + parameterizes a hardening template to seal a
discovered breach, then checks the regression gate. It hardens the grader; it never fixes
the cheat's code (SPEC §4)."""

from .green import GreenResult, harden

__all__ = ["GreenResult", "harden"]
