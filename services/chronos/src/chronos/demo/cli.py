"""Plan 006 demo command entrypoints."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from .models import DemoError, utc_now, with_content_digest
from .orchestration import (
    prepare_publication,
    record_published_publication,
    run_acceptance_demo,
)
from .publication import publication_preflight, validate_publication_attempt
from .readiness import validate_readiness_pack
from .redaction import redact_record
from .report import validate_demo_report

ROOT = Path(__file__).resolve().parents[3]
PLAN_005_MANIFEST = Path("docs/plans/evidence/005/MANIFEST.json")
PUBLISH_INTERFACE_REF = Path("docs/plans/repo-map/INTERFACES.md")
RELEASE_PROOFS = Path("artifacts/chronos/releases/release-proofs")
RELEASE_CANDIDATES = Path("artifacts/chronos/releases/candidates")


def _write_json(path: Path, record: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(with_content_digest(record), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _load_json(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise DemoError("input_unavailable", f"input file not found: {path}") from exc
    except json.JSONDecodeError as exc:
        raise DemoError("input_invalid", f"input is not valid JSON: {exc.msg}") from exc
    if not isinstance(value, dict):
        raise DemoError("input_invalid", "input JSON must be an object")
    return value


def _safe_observed_behavior(exc: DemoError) -> str:
    return str(redact_record(str(exc)))


def _print_failure(exc: DemoError) -> None:
    print(f"FAIL: {exc.error_class}: {_safe_observed_behavior(exc)}")


def _manifest_artifact_path(manifest: dict, *, prefix: str, suffix: str) -> Path | None:
    refs = [
        artifact.get("ref")
        for artifact in manifest.get("artifacts", [])
        if isinstance(artifact, dict) and isinstance(artifact.get("ref"), str)
    ]
    matches = [
        Path(ref)
        for ref in refs
        if ref.startswith(prefix) and ref.endswith(suffix) and "*" not in ref
    ]
    if len(matches) == 1:
        return ROOT / matches[0]
    return None


def _release_candidate_path(proof: dict) -> Path | None:
    raw_ref = proof.get("release_candidate_ref")
    if not isinstance(raw_ref, str) or not raw_ref:
        return None
    candidate = ROOT / RELEASE_CANDIDATES / Path(raw_ref).name
    return candidate if candidate.is_file() else None


def _validate_candidate_binding(proof: dict, candidate_path: Path) -> None:
    candidate = _load_json(candidate_path)
    mismatched = [
        field
        for field in ("environment_v2", "grader_v2_digest")
        if candidate.get(field) != proof.get(field)
    ]
    if mismatched:
        raise DemoError(
            "missing_artifacts",
            f"release candidate does not match ReleaseProof fields {mismatched}",
        )
    proof_candidate_id = Path(str(proof.get("release_candidate_ref", ""))).stem
    if (
        proof_candidate_id
        and candidate.get("release_candidate_id") != proof_candidate_id
    ):
        raise DemoError(
            "missing_artifacts", "release candidate id does not match ReleaseProof ref"
        )


def _plan_005_release_inputs() -> tuple[dict, Path, Path]:
    manifest_path = ROOT / PLAN_005_MANIFEST
    manifest = _load_json(manifest_path)
    if manifest.get("status") != "complete":
        raise DemoError("dependency_gate", "Plan 005 evidence manifest is not complete")
    proof_path = _manifest_artifact_path(
        manifest,
        prefix=RELEASE_PROOFS.as_posix(),
        suffix=".json",
    )
    if not proof_path or not proof_path.is_file():
        raise DemoError(
            "missing_artifacts", "Plan 005 ReleaseProof artifact is not present"
        )
    proof = _load_json(proof_path)
    candidate_path = _release_candidate_path(proof)
    manifest_candidate_path = _manifest_artifact_path(
        manifest,
        prefix=RELEASE_CANDIDATES.as_posix(),
        suffix=".json",
    )
    if (
        not candidate_path
        or not manifest_candidate_path
        or candidate_path != manifest_candidate_path
    ):
        raise DemoError(
            "missing_artifacts", "Plan 005 release candidate artifact is not present"
        )
    _validate_candidate_binding(proof, candidate_path)
    return proof, proof_path, candidate_path


def demo_preflight() -> int:
    """Record the current Plan 006 demo/publication readiness boundary."""

    path = ROOT / "artifacts/chronos/demo/preflight-blockers/plan-006-demo.json"
    publication_path = (
        ROOT
        / "artifacts/chronos/demo/preflight-blockers/plan-006-publication-attempt.json"
    )
    blockers: list[dict] = []
    release_proof_ref = None
    release_candidate_ref = None
    publication_attempt_ref = None
    try:
        proof, proof_path, candidate_path = _plan_005_release_inputs()
        release_proof_ref = proof_path.relative_to(ROOT).as_posix()
        release_candidate_ref = candidate_path.relative_to(ROOT).as_posix()
        attempt = publication_preflight(
            release_proof=proof,
            target_id=proof.get("environment_v2"),
            trusted_context_ref="docs/plans/repo-map/COMMANDS.json:integration-publication",
            publish_binding_ref=None,
            publisher_capability_label=None,
            release_candidate_ref=release_candidate_ref,
            evidence_refs=[
                PLAN_005_MANIFEST.as_posix(),
                release_proof_ref,
                release_candidate_ref,
                PUBLISH_INTERFACE_REF.as_posix(),
            ],
        )
        validate_publication_attempt(attempt)
        _write_json(publication_path, attempt)
        publication_attempt_ref = publication_path.relative_to(ROOT).as_posix()
        if attempt["outcome"] == "blocked-with-proof":
            blockers.append(
                {
                    "type": "PUBLISH_BINDING",
                    "reason": "No repository-bound publish primitive or publisher capability is recorded for Plan 006.",
                    "evidence_refs": [
                        PUBLISH_INTERFACE_REF.as_posix(),
                        publication_attempt_ref,
                    ],
                }
            )
        else:
            blockers.append(
                {
                    "type": "PUBLISH_TARGET",
                    "reason": f"Publication preflight failed closed with {attempt['normalized_error_class']}.",
                    "evidence_refs": [
                        PUBLISH_INTERFACE_REF.as_posix(),
                        publication_attempt_ref,
                    ],
                }
            )
    except DemoError as exc:
        result = {
            "schema_version": 1,
            "status": "failed",
            "error_class": exc.error_class,
            "observed_behavior": _safe_observed_behavior(exc),
            "release_proof_ref": release_proof_ref,
            "release_candidate_ref": release_candidate_ref,
            "created_at": utc_now(),
        }
        _write_json(publication_path, result)
        publication_attempt_ref = publication_path.relative_to(ROOT).as_posix()
        blocker_type = (
            "DEPENDENCY_GATE"
            if exc.error_class == "dependency_gate"
            else "PUBLISH_TARGET"
        )
        blockers.append(
            {
                "type": blocker_type,
                "reason": _safe_observed_behavior(exc),
                "evidence_refs": [
                    PLAN_005_MANIFEST.as_posix(),
                    PUBLISH_INTERFACE_REF.as_posix(),
                    publication_attempt_ref,
                ],
            }
        )
    blockers.append(
        {
            "type": "ACCEPTANCE_DEMO_ORCHESTRATION",
            "reason": "No Plan 006-owned noninteractive orchestration has launched a fresh full-budget Acceptance Demo Run on this branch.",
            "evidence_refs": [
                "docs/plans/006-demo-observability-and-publication.md",
                "docs/plans/evidence/003/MANIFEST.json",
            ],
        }
    )
    record = {
        "schema_version": 1,
        "status": "blocked",
        "release_proof_ref": release_proof_ref,
        "release_candidate_ref": release_candidate_ref,
        "publication_attempt_ref": publication_attempt_ref,
        "blockers": blockers,
        "observed_behavior": (
            "Demo preflight consumed the merged Plan 005 evidence where available, then refused to claim "
            "an Acceptance Demo Run or publication without a fresh full-budget branch launch and a "
            "repository-bound publish target/binding."
        ),
    }
    _write_json(path, record)
    print(f"WROTE {path}")
    for blocker in record["blockers"]:
        print(f"STOP: {blocker['type']}: {blocker['reason']}")
    return 2


def validate_report(*, report: Path, output: Path | None) -> int:
    """Validate an existing report.json and optionally persist the result."""

    try:
        record = _load_json(report)
        validate_demo_report(record)
    except DemoError as exc:
        result = {
            "schema_version": 1,
            "status": "failed",
            "source_report_ref": report.as_posix(),
            "error_class": exc.error_class,
            "observed_behavior": _safe_observed_behavior(exc),
            "validated_at": utc_now(),
        }
        if output:
            _write_json(output, result)
            print(f"WROTE {output}")
        _print_failure(exc)
        return 2
    result = {
        "schema_version": 1,
        "status": "pass",
        "source_report_ref": report.as_posix(),
        "source_invocation_id": record["invocation_id"],
        "demo_mode": record["demo_mode"],
        "observed_behavior": "Report validated without creating new proof, replay, publication, or branch evidence.",
        "validated_at": utc_now(),
    }
    if output:
        _write_json(output, result)
        print(f"WROTE {output}")
    print(f"PASS: report={report} invocation={record['invocation_id']}")
    return 0


def report_replay(*, source_report: Path, output: Path) -> int:
    """Audit-only report replay validation."""

    try:
        record = _load_json(source_report)
        validate_demo_report(record)
    except DemoError as exc:
        result = {
            "schema_version": 1,
            "status": "failed",
            "replay_type": "demo-report-replay",
            "source_report_ref": source_report.as_posix(),
            "error_class": exc.error_class,
            "observed_behavior": _safe_observed_behavior(exc),
            "validated_at": utc_now(),
        }
        _write_json(output, result)
        print(f"WROTE {output}")
        _print_failure(exc)
        return 2
    result = {
        "schema_version": 1,
        "status": "pass",
        "replay_type": "demo-report-replay",
        "source_report_ref": source_report.as_posix(),
        "source_invocation_id": record["invocation_id"],
        "created_branch_refs": [],
        "new_replay_ref": None,
        "new_release_proof_ref": None,
        "new_publication_attempt_ref": None,
        "published_environment_ref": None,
        "observed_behavior": "Audit-only replay revalidated the source report and created no new branch, replay, ReleaseProof, publication attempt, or publish evidence.",
        "validated_at": utc_now(),
    }
    _write_json(output, result)
    print(f"WROTE {output}")
    print(f"PASS: report-replay source_invocation_id={record['invocation_id']}")
    return 0


def validate_publication(*, attempt: Path, output: Path | None) -> int:
    """Validate a PublicationAttempt artifact without invoking publish."""

    try:
        record = _load_json(attempt)
        validate_publication_attempt(record)
    except DemoError as exc:
        result = {
            "schema_version": 1,
            "status": "failed",
            "source_publication_attempt_ref": attempt.as_posix(),
            "error_class": exc.error_class,
            "observed_behavior": _safe_observed_behavior(exc),
            "validated_at": utc_now(),
        }
        if output:
            _write_json(output, result)
            print(f"WROTE {output}")
        _print_failure(exc)
        return 2
    result = {
        "schema_version": 1,
        "status": "pass",
        "source_publication_attempt_ref": attempt.as_posix(),
        "publication_attempt_id": record["publication_attempt_id"],
        "outcome": record["outcome"],
        "idempotency_key": record["idempotency_key"],
        "observed_behavior": "PublicationAttempt validated without invoking a publish API.",
        "validated_at": utc_now(),
    }
    if output:
        _write_json(output, result)
        print(f"WROTE {output}")
    print(f"PASS: publication_attempt={attempt} outcome={record['outcome']}")
    return 0


def publication_preflight_command(
    *,
    release_proof: Path,
    target_id: str | None,
    trusted_context_ref: str | None,
    publish_binding_ref: str | None,
    publisher_capability_label: str | None,
    release_candidate_ref: str | None,
    permission_denied: bool,
    evidence_refs: list[str],
    output: Path,
) -> int:
    """Write a PublicationAttempt preflight artifact without invoking publish."""

    try:
        proof = _load_json(release_proof)
        attempt = publication_preflight(
            release_proof=proof,
            target_id=target_id,
            trusted_context_ref=trusted_context_ref,
            publish_binding_ref=publish_binding_ref,
            publisher_capability_label=publisher_capability_label,
            release_candidate_ref=release_candidate_ref,
            permission_denied=permission_denied,
            evidence_refs=evidence_refs or [release_proof.as_posix()],
        )
        validate_publication_attempt(attempt)
    except DemoError as exc:
        result = {
            "schema_version": 1,
            "status": "failed",
            "source_release_proof_ref": release_proof.as_posix(),
            "error_class": exc.error_class,
            "observed_behavior": _safe_observed_behavior(exc),
            "validated_at": utc_now(),
        }
        _write_json(output, result)
        print(f"WROTE {output}")
        _print_failure(exc)
        return 2
    _write_json(output, attempt)
    print(f"WROTE {output}")
    if attempt["outcome"] == "failed":
        print(
            f"FAIL: publication-preflight {attempt['normalized_error_class']} id={attempt['publication_attempt_id']}"
        )
        return 2
    print(
        f"PASS: publication-preflight outcome={attempt['outcome']} id={attempt['publication_attempt_id']}"
    )
    return 0


def validate_readiness(*, pack: Path, output: Path | None) -> int:
    """Validate a demo readiness pack without probing live systems."""

    try:
        record = _load_json(pack)
        validate_readiness_pack(record)
    except DemoError as exc:
        result = {
            "schema_version": 1,
            "status": "failed",
            "source_readiness_pack_ref": pack.as_posix(),
            "error_class": exc.error_class,
            "observed_behavior": _safe_observed_behavior(exc),
            "validated_at": utc_now(),
        }
        if output:
            _write_json(output, result)
            print(f"WROTE {output}")
        _print_failure(exc)
        return 2
    result = {
        "schema_version": 1,
        "status": "pass",
        "source_readiness_pack_ref": pack.as_posix(),
        "readiness_pack_id": record["readiness_pack_id"],
        "readiness_status": record["status"],
        "observed_behavior": "Readiness pack validated without probing live auth, network, quota, HUD, Modal, or publish systems.",
        "validated_at": utc_now(),
    }
    if output:
        _write_json(output, result)
        print(f"WROTE {output}")
    print(f"PASS: readiness_pack={pack} status={record['status']}")
    return 0


def acceptance_demo_command(*, count: int, concurrency: int) -> int:
    """Run the noninteractive Acceptance Demo Run and report its outcome."""

    try:
        outcome = run_acceptance_demo(count=count, concurrency=concurrency)
    except DemoError as exc:
        _print_failure(exc)
        return 2
    if outcome.report_ref:
        print(f"WROTE {outcome.report_ref}")
    if outcome.publication_attempt_ref:
        print(f"WROTE {outcome.publication_attempt_ref}")
    if outcome.readiness_pack_ref:
        print(f"WROTE {outcome.readiness_pack_ref}")
    if outcome.resource_stop_ref:
        print(f"STOP: {outcome.resource_stop_ref}: {outcome.observed_behavior}")
        return outcome.exit_code
    print(f"PASS: acceptance-demo invocation={outcome.invocation_id}")
    return outcome.exit_code


def publish_prepare_command() -> int:
    """Write a validated `prepared` PublicationAttempt (binding ready, upload deferred)."""

    try:
        exit_code, ref = prepare_publication()
    except DemoError as exc:
        _print_failure(exc)
        return 2
    print(f"WROTE {ref}")
    print("PASS: publish-prepare outcome=prepared (registry upload deferred)")
    return exit_code


def publish_record_command() -> int:
    """Write a validated `published` PublicationAttempt from the deploy receipt."""

    try:
        exit_code, ref = record_published_publication()
    except DemoError as exc:
        _print_failure(exc)
        return 2
    print(f"WROTE {ref}")
    print("PASS: publish-record outcome=published")
    return exit_code


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("demo-preflight")
    acceptance_parser = sub.add_parser("acceptance-demo")
    acceptance_parser.add_argument("--count", type=int, default=12)
    acceptance_parser.add_argument("--concurrency", type=int, default=12)
    sub.add_parser("publish-prepare")
    sub.add_parser("publish-record")
    validate_parser = sub.add_parser("validate-report")
    validate_parser.add_argument("--report", required=True, type=Path)
    validate_parser.add_argument("--output", type=Path)
    replay_parser = sub.add_parser("report-replay")
    replay_parser.add_argument("--source-report", required=True, type=Path)
    replay_parser.add_argument("--output", required=True, type=Path)
    pub_parser = sub.add_parser("validate-publication-attempt")
    pub_parser.add_argument("--attempt", required=True, type=Path)
    pub_parser.add_argument("--output", type=Path)
    preflight_parser = sub.add_parser("publication-preflight")
    preflight_parser.add_argument("--release-proof", required=True, type=Path)
    preflight_parser.add_argument("--target-id")
    preflight_parser.add_argument("--trusted-context-ref")
    preflight_parser.add_argument("--publish-binding-ref")
    preflight_parser.add_argument("--publisher-capability-label")
    preflight_parser.add_argument("--release-candidate-ref")
    preflight_parser.add_argument("--permission-denied", action="store_true")
    preflight_parser.add_argument("--evidence-ref", action="append", default=[])
    preflight_parser.add_argument("--output", required=True, type=Path)
    readiness_parser = sub.add_parser("validate-readiness-pack")
    readiness_parser.add_argument("--pack", required=True, type=Path)
    readiness_parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if args.command == "demo-preflight":
        return demo_preflight()
    if args.command == "acceptance-demo":
        return acceptance_demo_command(count=args.count, concurrency=args.concurrency)
    if args.command == "publish-prepare":
        return publish_prepare_command()
    if args.command == "publish-record":
        return publish_record_command()
    if args.command == "validate-report":
        return validate_report(report=args.report, output=args.output)
    if args.command == "report-replay":
        return report_replay(source_report=args.source_report, output=args.output)
    if args.command == "validate-publication-attempt":
        return validate_publication(attempt=args.attempt, output=args.output)
    if args.command == "publication-preflight":
        return publication_preflight_command(
            release_proof=args.release_proof,
            target_id=args.target_id,
            trusted_context_ref=args.trusted_context_ref,
            publish_binding_ref=args.publish_binding_ref,
            publisher_capability_label=args.publisher_capability_label,
            release_candidate_ref=args.release_candidate_ref,
            permission_denied=args.permission_denied,
            evidence_refs=args.evidence_ref,
            output=args.output,
        )
    if args.command == "validate-readiness-pack":
        return validate_readiness(pack=args.pack, output=args.output)
    raise AssertionError(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
