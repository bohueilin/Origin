"""Prepare a non-registering RFT evaluator binding from a sealed ReleaseProof."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Any

from chronos.research.canonical.errors import CanonicalInputError
from chronos.research.canonical.inputs import (
    LoadedArtifact,
    assert_manifest_complete,
    load_release_proof,
)
from chronos.research.canonical.releaseproof import (
    ReleaseGateIndex,
    build_release_gate_index,
)


@dataclass(frozen=True, slots=True)
class EvaluatorBindingResult:
    """Prepared binding artifact and recorded regression counts."""

    output_path: Path
    release_proof_id: str
    witness_count: int
    control_count: int
    subversion_probe_count: int


def _canonical_digest(payload: dict[str, Any]) -> str:
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _non_empty_string(value: Any, *, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise CanonicalInputError(
            f"evaluator context {field} must be a non-empty string"
        )
    return value.strip()


def _string_list(value: Any, *, field: str) -> list[str]:
    if not isinstance(value, list) or not value:
        raise CanonicalInputError(f"evaluator context {field} must be a non-empty list")
    result = []
    for item in value:
        result.append(_non_empty_string(item, field=field))
    return result


def _absolute_posix(value: str, *, field: str) -> PurePosixPath:
    path = PurePosixPath(value)
    if not path.is_absolute() or ".." in path.parts:
        raise CanonicalInputError(
            f"evaluator context {field} must be an absolute normalized path"
        )
    return path


def _within(path: PurePosixPath, root: PurePosixPath) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def _manifest_lists_release_proof(
    manifest: LoadedArtifact, release_proof: LoadedArtifact
) -> None:
    entries = manifest.data.get("artifacts")
    if not isinstance(entries, list):
        raise CanonicalInputError("Plan 005 manifest has no artifact list")
    target = release_proof.path.resolve()
    for entry in entries:
        if isinstance(entry, str):
            raw_path = entry
        elif isinstance(entry, dict):
            raw_path = next(
                (
                    entry.get(field)
                    for field in ("path", "artifact_path", "ref", "uri")
                    if isinstance(entry.get(field), str)
                ),
                None,
            )
        else:
            raw_path = None
        if raw_path and Path(raw_path).resolve() == target:
            return
    raise CanonicalInputError(
        "ReleaseProof is not listed in the completed Plan 005 manifest"
    )


def _select_v2_context(
    proof: dict[str, Any], release: ReleaseGateIndex
) -> dict[str, Any]:
    raw_contexts = proof.get("evaluator_context_refs")
    if not isinstance(raw_contexts, list):
        raise CanonicalInputError("ReleaseProof evaluator_context_refs must be a list")
    matches = [
        context
        for context in raw_contexts
        if isinstance(context, dict)
        and context.get("phase") == "v2"
        and context.get("environment_version") == release.environment_v2
        and context.get("grader_digest") == release.grader_v2_digest
    ]
    if len(matches) != 1:
        raise CanonicalInputError(
            "ReleaseProof must contain exactly one v2 evaluator context matching its identities"
        )
    return matches[0]


def _audit_security(context: dict[str, Any]) -> dict[str, Any]:
    trusted = [
        _absolute_posix(path, field="trusted_test_roots")
        for path in _string_list(
            context.get("trusted_test_roots"), field="trusted_test_roots"
        )
    ]
    writable = [
        _absolute_posix(path, field="untrusted_writable_roots")
        for path in _string_list(
            context.get("untrusted_writable_roots"), field="untrusted_writable_roots"
        )
    ]
    for trusted_root in trusted:
        for writable_root in writable:
            if _within(trusted_root, writable_root) or _within(
                writable_root, trusted_root
            ):
                raise CanonicalInputError(
                    f"trusted evaluator root overlaps agent-writable root: {trusted_root} / {writable_root}"
                )

    grader_path = _absolute_posix(
        _non_empty_string(context.get("grader_path"), field="grader_path"),
        field="grader_path",
    )
    rootdir = _absolute_posix(
        _non_empty_string(context.get("rootdir"), field="rootdir"),
        field="rootdir",
    )
    if not any(_within(grader_path, root) for root in trusted):
        raise CanonicalInputError("grader path is outside trusted evaluator roots")
    if not any(_within(rootdir, root) for root in trusted):
        raise CanonicalInputError(
            "evaluator rootdir is outside trusted evaluator roots"
        )

    import_paths = [
        _absolute_posix(path, field="import_path")
        for path in _string_list(context.get("import_path"), field="import_path")
    ]
    if any(_within(path, root) for path in import_paths for root in writable):
        raise CanonicalInputError(
            "evaluator import path includes an agent-writable root"
        )

    assets = context.get("test_asset_digests")
    if not isinstance(assets, dict) or not assets:
        raise CanonicalInputError(
            "evaluator context test_asset_digests must be a non-empty object"
        )
    for raw_path, digest in assets.items():
        asset_path = _absolute_posix(
            _non_empty_string(raw_path, field="test asset path"),
            field="test asset path",
        )
        if not any(_within(asset_path, root) for root in trusted):
            raise CanonicalInputError(
                f"test asset is outside trusted evaluator roots: {asset_path}"
            )
        _non_empty_string(digest, field=f"test_asset_digests[{raw_path!r}]")

    entrypoint_digest = _non_empty_string(
        context.get("grader_entrypoint_digest"), field="grader_entrypoint_digest"
    )
    if assets.get(str(grader_path)) != entrypoint_digest:
        raise CanonicalInputError(
            "grader entrypoint digest does not match trusted test assets"
        )

    return {
        "trusted_test_roots": [str(path) for path in trusted],
        "untrusted_writable_roots": [str(path) for path in writable],
        "grader_path": str(grader_path),
        "rootdir": str(rootdir),
        "import_path": [str(path) for path in import_paths],
        "test_asset_digests": assets,
        "verifier_plugins": _string_list(
            context.get("verifier_plugins"), field="verifier_plugins"
        ),
        "reward_record_policy": {
            "transport": "trusted_evaluator_return_value",
            "agent_writable_reward_paths": [],
            "persisted_by": "trusted_rft_orchestrator",
        },
    }


def _recorded_regression(
    proof: dict[str, Any], release: ReleaseGateIndex
) -> dict[str, Any]:
    cases = []
    for case_id in sorted(release.cases):
        case = release.cases[case_id]
        expected_v2 = 0.0 if case.case_kind == "witness" else 1.0
        if case.v2_reward != expected_v2:
            raise CanonicalInputError(f"sealed v2 regression failed for {case_id}")
        cases.append(
            {
                "case_id": case.case_id,
                "case_kind": case.case_kind,
                "v1_reward": case.v1_reward,
                "v2_reward": case.v2_reward,
                "expected_v2_reward": expected_v2,
                "passed": True,
            }
        )

    raw_subversion = proof.get("subversion_results")
    if not isinstance(raw_subversion, list) or not raw_subversion:
        raise CanonicalInputError(
            "ReleaseProof has no recorded evaluator-subversion probes"
        )
    subversion = []
    for row in raw_subversion:
        if not isinstance(row, dict):
            raise CanonicalInputError(
                "ReleaseProof subversion result must be an object"
            )
        case_id = _non_empty_string(row.get("case_id"), field="subversion case_id")
        reward = row.get("reward")
        status = str(row.get("status") or "").lower()
        if reward != 0.0 or status != "blocked":
            raise CanonicalInputError(
                f"evaluator-subversion probe did not fail closed: {case_id}"
            )
        subversion.append({"case_id": case_id, "reward": 0.0, "status": "blocked"})

    return {"proofset_cases": cases, "subversion_probes": subversion}


def prepare_sealed_v2_evaluator_binding(
    *,
    release_proof_path: str | Path,
    plan_005_manifest_path: str | Path,
    output_path: str | Path,
) -> EvaluatorBindingResult:
    """Bind launch preparation to Plan 005 identities without registering or training."""
    manifest = assert_manifest_complete(plan_005_manifest_path, plan_id="005")
    release_proof = load_release_proof(release_proof_path)
    _manifest_lists_release_proof(manifest, release_proof)
    release = build_release_gate_index(release_proof.data)
    context = _select_v2_context(release_proof.data, release)
    security = _audit_security(context)
    regression = _recorded_regression(release_proof.data, release)

    payload: dict[str, Any] = {
        "schema_version": 1,
        "status": "prepared_not_registered",
        "claim_guard": (
            "This artifact binds and audits recorded Plan 005 evidence only. It does not prove "
            "a live Fireworks evaluator registration, RFT launch, or model improvement."
        ),
        "release_proof": {
            "path": str(release_proof.path),
            "file_sha256": release_proof.digest,
            "content_digest": release_proof.data["content_digest"],
            "release_proof_id": release.release_proof_id,
            "proof_set_id": release.proof_set_id,
        },
        "binding": {
            "environment_v2": release.environment_v2,
            "grader_v2_digest": release.grader_v2_digest,
            "context_id": _non_empty_string(
                context.get("context_id"), field="context_id"
            ),
            "grader_entrypoint_digest": _non_empty_string(
                context.get("grader_entrypoint_digest"),
                field="grader_entrypoint_digest",
            ),
            "python_executable": _non_empty_string(
                context.get("python_executable"), field="python_executable"
            ),
            "python_executable_digest": _non_empty_string(
                context.get("python_executable_digest"),
                field="python_executable_digest",
            ),
        },
        "security": security,
        "recorded_regression": regression,
        "provider_registration": {"status": "not_run", "evaluator_id": "TBD"},
        "training": {"status": "not_run", "job_id": "TBD"},
    }
    payload["content_digest"] = _canonical_digest(payload)

    out = Path(output_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    witness_count = sum(
        row["case_kind"] == "witness" for row in regression["proofset_cases"]
    )
    control_count = sum(
        row["case_kind"] == "control" for row in regression["proofset_cases"]
    )
    return EvaluatorBindingResult(
        output_path=out,
        release_proof_id=release.release_proof_id,
        witness_count=witness_count,
        control_count=control_count,
        subversion_probe_count=len(regression["subversion_probes"]),
    )
