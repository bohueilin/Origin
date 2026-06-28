"""Oracle: the held-out ground-truth verdict T in {0,1}, and breach detection."""

from .runner import is_breach, run_oracle

__all__ = ["is_breach", "run_oracle"]
