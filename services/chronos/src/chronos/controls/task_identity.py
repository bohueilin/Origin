"""Compute and verify pinned task identity digests."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from chronos.controls.materialize import (
    PINNED_REVISION,
    dockerfile_path,
    fixture_root,
    grader_path,
    task_id,
    verifier_harness_path,
)

EXPECTED_GRADER_DIGEST = (
    "ecaf12227976729261555ba1c5c229ad89487fc1beb945b4b8ae52509b56f61f"
)
EXPECTED_VERIFIER_DIGEST = (
    "5783dd7c287c917ca85b6d272b3ac3e8f2560c495ba0d05a8e9195e8b4641a00"
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def compute_task_identity() -> dict[str, str]:
    grader = grader_path()
    harness = verifier_harness_path()
    dockerfile = dockerfile_path()
    for path in (grader, harness, dockerfile):
        if not path.is_file():
            raise FileNotFoundError(f"Missing pinned task file: {path}")

    identity = {
        "task_id": task_id(),
        "terminal_wrench_revision": PINNED_REVISION,
        "grader_digest": sha256_file(grader),
        "verifier_harness_digest": sha256_file(harness),
        "environment_dockerfile_digest": sha256_file(dockerfile),
    }
    if identity["grader_digest"] != EXPECTED_GRADER_DIGEST:
        raise ValueError(
            "grader_digest mismatch: "
            f"expected {EXPECTED_GRADER_DIGEST}, got {identity['grader_digest']}"
        )
    if identity["verifier_harness_digest"] != EXPECTED_VERIFIER_DIGEST:
        raise ValueError(
            "verifier_harness_digest mismatch: "
            f"expected {EXPECTED_VERIFIER_DIGEST}, got {identity['verifier_harness_digest']}"
        )
    return identity


def task_identity_path() -> Path:
    return fixture_root() / "task_identity.json"


def load_task_identity() -> dict[str, str]:
    path = task_identity_path()
    if not path.is_file():
        raise FileNotFoundError(f"Missing task identity fixture: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{path}: root must be an object")
    return {str(key): str(value) for key, value in data.items()}


def write_task_identity(path: Path | None = None) -> dict[str, str]:
    identity = compute_task_identity()
    target = path or task_identity_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(identity, indent=2) + "\n", encoding="utf-8")
    return identity


def verify_task_identity(expected: dict[str, str] | None = None) -> dict[str, str]:
    computed = compute_task_identity()
    reference = expected or load_task_identity()
    for key, value in computed.items():
        if reference.get(key) != value:
            raise ValueError(
                f"task identity mismatch for {key}: {reference.get(key)!r} != {value!r}"
            )
    return computed


def identity_as_task_fields(identity: dict[str, str]) -> dict[str, Any]:
    return dict(identity)
