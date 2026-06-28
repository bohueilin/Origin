"""Shared Plan 006 demo model helpers."""

from __future__ import annotations

from typing import Any

from chronos.releases.models import digest_json, utc_now


class DemoError(RuntimeError):
    """Semantic Plan 006 validation failure."""

    def __init__(self, error_class: str, message: str):
        super().__init__(message)
        self.error_class = error_class


def require_fields(
    record: dict[str, Any], fields: set[str], *, error_class: str
) -> None:
    missing = sorted(
        key for key in fields if key not in record or record[key] in (None, "", [])
    )
    if missing:
        raise DemoError(error_class, f"missing required field(s): {missing}")


def content_digest(record: dict[str, Any]) -> str:
    return digest_json({k: v for k, v in record.items() if k != "content_digest"})


def assert_content_digest(record: dict[str, Any]) -> None:
    expected = record.get("content_digest")
    if expected != content_digest(record):
        raise DemoError("digest_mismatch", "content digest mismatch")


def with_content_digest(record: dict[str, Any]) -> dict[str, Any]:
    sealed = dict(record)
    sealed["content_digest"] = content_digest(sealed)
    return sealed


__all__ = [
    "DemoError",
    "assert_content_digest",
    "content_digest",
    "require_fields",
    "utc_now",
    "with_content_digest",
]
