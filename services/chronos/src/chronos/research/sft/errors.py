"""Errors raised while loading Chronos trace exports."""

from chronos.research.canonical.errors import CanonicalInputError

__all__ = ["CanonicalInputError", "TraceLoadError", "TraceValidationError"]


class TraceLoadError(Exception):
    """Base error for trace loading failures."""


class TraceValidationError(TraceLoadError):
    """A row or file failed structural validation."""

    def __init__(self, message: str, *, line_number: int | None = None) -> None:
        self.line_number = line_number
        if line_number is not None:
            super().__init__(f"line {line_number}: {message}")
        else:
            super().__init__(message)
