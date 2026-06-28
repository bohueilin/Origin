"""Evaluator execution-surface contracts for Plan 005."""

from __future__ import annotations

from pathlib import PurePosixPath
from typing import Any

from .models import ReleaseError, missing_fields


REQUIRED_EVALUATOR_CONTEXT_FIELDS = {
    "context_id",
    "phase",
    "environment_version",
    "grader_path",
    "grader_digest",
    "grader_entrypoint_digest",
    "cwd",
    "rootdir",
    "python_executable",
    "python_executable_digest",
    "import_path",
    "verifier_plugins",
    "test_asset_digests",
    "trusted_test_roots",
    "untrusted_writable_roots",
    "captured_at",
}


def _normal_path(value: Any) -> str | None:
    if not isinstance(value, str) or "://" in value:
        return None
    path = PurePosixPath(value)
    if not path.is_absolute():
        return None
    return path.as_posix().rstrip("/") or "/"


def _is_within(path: str, root: str) -> bool:
    if path == root:
        return True
    return path.startswith(root.rstrip("/") + "/")


def _path_list(record: dict[str, Any], field: str) -> list[str]:
    value = record[field]
    if not isinstance(value, list):
        raise ReleaseError("evaluator_context_invalid", f"{field} must be a list")
    paths = []
    for item in value:
        normalized = _normal_path(item)
        if normalized is None:
            raise ReleaseError(
                "evaluator_context_invalid", f"{field} contains non-absolute path"
            )
        paths.append(normalized)
    return paths


def _digest_map(record: dict[str, Any], field: str) -> dict[str, str]:
    value = record[field]
    if not isinstance(value, dict) or not value:
        raise ReleaseError(
            "evaluator_context_invalid", f"{field} must be a non-empty object"
        )
    for key, digest in value.items():
        if _normal_path(key) is None:
            raise ReleaseError(
                "evaluator_context_invalid", f"{field} contains non-absolute path"
            )
        if not isinstance(digest, str) or not digest:
            raise ReleaseError(
                "evaluator_context_invalid", f"{field} contains empty digest"
            )
    return dict(value)


def _assert_not_branch_writable(
    *, record: dict[str, Any], field: str, paths: list[str]
) -> None:
    writable_roots = _path_list(record, "untrusted_writable_roots")
    for path in paths:
        for root in writable_roots:
            if _is_within(path, root):
                raise ReleaseError(
                    "evaluator_context_branch_writable",
                    f"{field} is under untrusted writable root: {path}",
                )


def validate_evaluator_contexts(
    contexts: list[dict[str, Any]],
    *,
    expected_phase: str,
    expected_environment: str,
    expected_grader_digest: str,
) -> None:
    """Require immutable, non-shadowed runtime identity before trusting a gate result."""

    if not contexts:
        raise ReleaseError("evaluator_context_missing", "evaluator context is required")
    seen_contexts = set()
    for record in contexts:
        missing = missing_fields(record, REQUIRED_EVALUATOR_CONTEXT_FIELDS)
        if missing:
            raise ReleaseError(
                "evaluator_context_incomplete", f"context missing {missing}"
            )
        context_id = record["context_id"]
        if context_id in seen_contexts:
            raise ReleaseError(
                "evaluator_context_invalid", f"duplicate context id: {context_id}"
            )
        seen_contexts.add(context_id)
        if record["phase"] != expected_phase:
            raise ReleaseError(
                "evaluator_context_invalid", f"context phase mismatch: {context_id}"
            )
        if record["environment_version"] != expected_environment:
            raise ReleaseError(
                "environment_mismatch",
                f"context used mixed environment: {context_id}",
            )
        if record["grader_digest"] != expected_grader_digest:
            raise ReleaseError(
                "grader_mismatch",
                f"context used mixed grader digest: {context_id}",
            )

        grader_path = _normal_path(record["grader_path"])
        cwd = _normal_path(record["cwd"])
        rootdir = _normal_path(record["rootdir"])
        python_executable = _normal_path(record["python_executable"])
        if (
            grader_path is None
            or cwd is None
            or rootdir is None
            or python_executable is None
        ):
            raise ReleaseError(
                "evaluator_context_invalid",
                f"context paths must be absolute local paths: {context_id}",
            )
        import_path = _path_list(record, "import_path")
        trusted_test_roots = _path_list(record, "trusted_test_roots")
        _digest_map(record, "test_asset_digests")

        _assert_not_branch_writable(
            record=record, field="grader_path", paths=[grader_path]
        )
        _assert_not_branch_writable(
            record=record, field="trusted_test_roots", paths=trusted_test_roots
        )
        _assert_not_branch_writable(
            record=record, field="import_path", paths=import_path
        )
