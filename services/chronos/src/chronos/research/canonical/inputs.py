"""Load and verify canonical Chronos artifacts for research training paths."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from chronos.research.canonical.errors import CanonicalInputError


JsonObject = dict[str, Any]


@dataclass(frozen=True, slots=True)
class LoadedArtifact:
    """A parsed JSON artifact with its path and content digest."""

    path: Path
    digest: str
    data: JsonObject


def _require_object(data: Any, *, label: str) -> JsonObject:
    if not isinstance(data, dict):
        raise CanonicalInputError(f"{label} must be a JSON object")
    return data


def _read_json(path: str | Path, *, label: str) -> LoadedArtifact:
    resolved = Path(path)
    if not resolved.is_file():
        raise CanonicalInputError(f"{label} not found: {resolved}")
    raw = resolved.read_bytes()
    try:
        data = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError as exc:
        raise CanonicalInputError(f"{label} is invalid JSON: {exc.msg}") from exc
    return LoadedArtifact(
        path=resolved,
        digest=hashlib.sha256(raw).hexdigest(),
        data=_require_object(data, label=label),
    )


def _digest_json_without_content_digest(data: JsonObject) -> str:
    canonical = {key: value for key, value in data.items() if key != "content_digest"}
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()
    return hashlib.sha256(encoded).hexdigest()


def _artifact_entries(manifest: LoadedArtifact) -> list[dict[str, Any]]:
    raw_entries = manifest.data.get("artifacts")
    if not isinstance(raw_entries, list) or not raw_entries:
        raise CanonicalInputError(
            f"Plan {manifest.data.get('plan_id')!s} manifest lists no artifacts"
        )
    entries: list[dict[str, Any]] = []
    for raw in raw_entries:
        if isinstance(raw, str):
            entries.append({"path": raw})
        elif isinstance(raw, dict):
            entries.append(raw)
    return entries


def _entry_path(entry: dict[str, Any]) -> str | None:
    for field in ("path", "artifact_path", "ref", "uri"):
        value = entry.get(field)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _entry_digest(entry: dict[str, Any]) -> str | None:
    for field in ("digest", "sha256", "content_digest"):
        value = entry.get(field)
        if isinstance(value, str) and value.strip():
            return value.removeprefix("sha256:").strip()
    return None


def assert_manifest_lists_artifact(
    manifest: LoadedArtifact,
    artifact: LoadedArtifact,
    *,
    label: str,
) -> None:
    """Require a completed upstream manifest to name the exact artifact and digest."""
    artifact_path = artifact.path
    matches = []
    for entry in _artifact_entries(manifest):
        raw_path = _entry_path(entry)
        if raw_path is None:
            continue
        candidate = Path(raw_path)
        if candidate == artifact_path or candidate.resolve() == artifact_path.resolve():
            matches.append(entry)

    if not matches:
        raise CanonicalInputError(
            f"{label} is not listed in Plan {manifest.data.get('plan_id')!s} manifest artifacts"
        )

    for entry in matches:
        digest = _entry_digest(entry)
        if digest == artifact.digest:
            return
    raise CanonicalInputError(
        f"{label} digest does not match Plan {manifest.data.get('plan_id')!s} manifest"
    )


def assert_manifest_complete(
    manifest_path: str | Path, *, plan_id: str
) -> LoadedArtifact:
    """Load a plan manifest and require it to represent completed evidence."""
    artifact = _read_json(manifest_path, label=f"Plan {plan_id} manifest")
    data = artifact.data
    observed_plan = str(data.get("plan_id") or "")
    if observed_plan != plan_id:
        raise CanonicalInputError(
            f"expected Plan {plan_id} manifest, got plan_id={observed_plan!r}"
        )
    if data.get("status") != "complete":
        raise CanonicalInputError(
            f"Plan {plan_id} manifest is not complete: status={data.get('status')!r}"
        )
    return artifact


def load_qabench_report(path: str | Path) -> LoadedArtifact:
    """Load the Plan 008 qabench report artifact."""
    artifact = _read_json(path, label="qabench report")
    trajectories = artifact.data.get("trajectories")
    if not isinstance(trajectories, list):
        raise CanonicalInputError("qabench report must include trajectories[]")
    return artifact


def load_release_proof(path: str | Path) -> LoadedArtifact:
    """Load a Plan 005 ReleaseProof artifact."""
    artifact = _read_json(path, label="ReleaseProof")
    required = (
        "schema_version",
        "release_proof_id",
        "proof_set_id",
        "environment_v1",
        "grader_v1_digest",
        "environment_v2",
        "grader_v2_digest",
        "patch_ref",
        "fixer_run_ref",
        "v1_results",
        "v2_results",
        "subversion_results",
        "evaluator_context_refs",
        "rejection_history",
        "family_variant_results",
        "witnesses_killed",
        "controls_preserved",
        "gate_status",
        "trace_links",
        "release_candidate_ref",
        "created_at",
        "content_digest",
    )
    missing = [field for field in required if field not in artifact.data]
    if missing:
        raise CanonicalInputError(
            "ReleaseProof missing required fields: " + ", ".join(sorted(missing))
        )
    if not isinstance(artifact.data["v1_results"], list):
        raise CanonicalInputError("ReleaseProof v1_results must be a list")
    if not isinstance(artifact.data["v2_results"], list):
        raise CanonicalInputError("ReleaseProof v2_results must be a list")
    for field in (
        "trace_links",
        "subversion_results",
        "evaluator_context_refs",
        "rejection_history",
        "family_variant_results",
    ):
        if not isinstance(artifact.data[field], list):
            raise CanonicalInputError(f"ReleaseProof {field} must be a list")
    expected = str(artifact.data["content_digest"]).removeprefix("sha256:")
    actual = _digest_json_without_content_digest(artifact.data)
    if expected != actual:
        raise CanonicalInputError("ReleaseProof content_digest mismatch")
    return artifact
