"""Plan 007 research CLI.

Subcommands:

- ``resnapshot``  — capture an independent depth-two child snapshot from the
  sealed Plan 003 Witness (live Modal). Fails closed without credentials.
- ``depth-two``   — run the adaptive depth-two BranchRun batch from the child
  snapshot (live Modal + HUD + Anthropic). Fails closed without approval.
- ``integration`` — verify Plan 007 depth-two evidence. Exits 0 only when a real
  child re-snapshot and a completed depth-two BranchRun with measured values and
  an adaptive-stop event exist; otherwise it writes a blocked preflight and exits 2.

Pure policy validation is covered by unit tests.
"""

from __future__ import annotations

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any

from chronos.research.artifacts import build_depth_two_preflight_artifact
from chronos.research.depth_two import run_depth_two
from chronos.research.resnapshot import ResnapshotError, capture_child_snapshot
from chronos.witnesses.models import utc_now

ROOT = Path(__file__).resolve().parents[3]
PLAN003_MANIFEST = ROOT / "docs/plans/evidence/003/MANIFEST.json"
SEALED_WITNESS = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/witnesses/wit-run-20260621T075711-branch-08.json"
)
SEALED_CAUSAL_DELTA = (
    ROOT
    / "docs/plans/evidence/003/artifacts/sealed/causal-deltas/run-20260621T075711-branch-08.json"
)
DEFAULT_CHILD_SELECTION = (
    ROOT
    / "artifacts/chronos/research/child-selection-wit-run-20260621T075711-branch-08.json"
)
DEFAULT_CHILD_SNAPSHOT = (
    ROOT / "artifacts/chronos/research/depth-two-child-snapshot.json"
)
DEFAULT_DEPTH_TWO_RUN = ROOT / "artifacts/chronos/research/depth-two-run.json"
DEFAULT_PREFLIGHT = (
    ROOT / "artifacts/chronos/research/depth-two-integration-preflight.json"
)


def _load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_json_safe(path: Path) -> dict[str, Any] | None:
    """Load JSON, returning None when the file is missing or unreadable.

    Lets the CLI fail closed (a clean STOP / exit 2) instead of crashing on a
    corrupt or absent evidence file.
    """

    if not path.exists():
        return None
    try:
        return _load_json(path)
    except (OSError, json.JSONDecodeError):
        return None


def _write_json(path: Path, data: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(data, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )


def _display_path(path: Path) -> str:
    try:
        return str(path.relative_to(ROOT))
    except ValueError:
        return str(path)


def _existing_recorded_at(path: Path) -> str:
    if not path.exists():
        return utc_now()
    try:
        existing = _load_json(path)
    except json.JSONDecodeError:
        return utc_now()
    recorded_at = existing.get("recorded_at")
    return recorded_at if isinstance(recorded_at, str) and recorded_at else utc_now()


def resnapshot(*, output_path: Path = DEFAULT_CHILD_SNAPSHOT) -> int:
    """Capture the depth-two child snapshot from the sealed Witness."""

    witness = _load_json_safe(SEALED_WITNESS)
    causal_delta = _load_json_safe(SEALED_CAUSAL_DELTA)
    if witness is None or causal_delta is None:
        print("STOP: sealed Witness or causal delta is missing or unreadable")
        return 2
    try:
        artifact = capture_child_snapshot(
            root=ROOT,
            witness=witness,
            causal_delta=causal_delta,
            source_witness_ref=_display_path(SEALED_WITNESS),
            source_causal_delta_ref=_display_path(SEALED_CAUSAL_DELTA),
        )
    except ResnapshotError as exc:
        print(f"STOP: child re-snapshot failed closed ({exc.error_class}): {exc}")
        return 2

    if artifact.get("status") != "captured":
        print(f"STOP: child re-snapshot blocked: {artifact.get('blocker')}")
        return 2

    _write_json(output_path, artifact)
    print(
        f"OK child snapshot captured: {artifact['child_snapshot']['snapshot_ref']} "
        f"artifact={_display_path(output_path)}"
    )
    return 0


def depth_two(
    *,
    output_path: Path = DEFAULT_DEPTH_TWO_RUN,
    child_snapshot_path: Path = DEFAULT_CHILD_SNAPSHOT,
    branch_budget: int = 8,
    concurrency: int = 1,
) -> int:
    """Run the adaptive depth-two BranchRun batch from the child snapshot."""

    child_snapshot_artifact = _load_json_safe(child_snapshot_path)
    if child_snapshot_artifact is None:
        print(
            f"STOP: child snapshot artifact is missing or unreadable: {_display_path(child_snapshot_path)}"
        )
        return 2
    artifact = asyncio.run(
        run_depth_two(
            root=ROOT,
            child_snapshot_artifact=child_snapshot_artifact,
            child_snapshot_artifact_ref=_display_path(child_snapshot_path),
            branch_budget=branch_budget,
            concurrency=concurrency,
        )
    )
    _write_json(output_path, artifact)
    if artifact.get("status") != "completed":
        print(
            f"STOP: depth-two run blocked: {artifact['depth_two_run'].get('blocker')} "
            f"artifact={_display_path(output_path)}"
        )
        return 2
    measured = artifact.get("measured_values") or {}
    print(
        "OK depth-two run completed: "
        f"completed={measured.get('completed_depth_two_branch_count')} "
        f"clusters={measured.get('distinct_confirmed_depth_two_clusters')} "
        f"stop={measured.get('adaptive_stop_reason')} "
        f"artifact={_display_path(output_path)}"
    )
    return 0


def integration(
    *,
    output_path: Path = DEFAULT_PREFLIGHT,
    child_selection_path: Path = DEFAULT_CHILD_SELECTION,
    child_snapshot_path: Path = DEFAULT_CHILD_SNAPSHOT,
    depth_two_run_path: Path = DEFAULT_DEPTH_TWO_RUN,
) -> int:
    """Verify depth-two evidence; exit 0 only when it is real and complete."""

    manifest = _load_json_safe(PLAN003_MANIFEST)
    if manifest is None:
        print(
            "STOP: Plan 003 manifest is missing or unreadable; cannot verify depth-two evidence"
        )
        return 2
    # A corrupt/absent child-snapshot or depth-two-run reads as None, which the
    # verifier reports as a blocker (fail closed), never as a false "ready".
    child_snapshot = _load_json_safe(child_snapshot_path)
    depth_two_run = _load_json_safe(depth_two_run_path)
    artifact = build_depth_two_preflight_artifact(
        plan003_manifest=manifest,
        child_selection_ref=_display_path(child_selection_path),
        child_selection_exists=child_selection_path.exists(),
        command_ref="uv run python -m chronos.research.cli integration",
        recorded_at=_existing_recorded_at(output_path)
        if output_path == DEFAULT_PREFLIGHT
        else utc_now(),
        child_snapshot=child_snapshot,
        child_snapshot_ref=_display_path(child_snapshot_path)
        if child_snapshot
        else None,
        depth_two_run=depth_two_run,
        depth_two_run_ref=_display_path(depth_two_run_path) if depth_two_run else None,
        root=ROOT,
    )
    _write_json(output_path, artifact)
    if artifact["status"] == "ready":
        print(
            "OK Plan 007 depth-two evidence verified: child re-snapshot captured and a completed "
            f"depth-two BranchRun exists. Preflight artifact: {_display_path(output_path)}"
        )
        return 0
    for blocker in artifact["blockers"]:
        print(f"STOP: {blocker}")
    print(f"Preflight artifact: {_display_path(output_path)}")
    return 2


def main() -> int:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)

    resnap = sub.add_parser("resnapshot")
    resnap.add_argument("--output", type=Path, default=DEFAULT_CHILD_SNAPSHOT)

    d2 = sub.add_parser("depth-two")
    d2.add_argument("--output", type=Path, default=DEFAULT_DEPTH_TWO_RUN)
    d2.add_argument("--child-snapshot", type=Path, default=DEFAULT_CHILD_SNAPSHOT)
    d2.add_argument("--branch-budget", type=int, default=8)
    d2.add_argument("--concurrency", type=int, default=1)

    integ = sub.add_parser("integration")
    integ.add_argument("--output", type=Path, default=DEFAULT_PREFLIGHT)

    args = parser.parse_args()
    if args.command == "resnapshot":
        return resnapshot(output_path=args.output)
    if args.command == "depth-two":
        return depth_two(
            output_path=args.output,
            child_snapshot_path=args.child_snapshot,
            branch_budget=args.branch_budget,
            concurrency=args.concurrency,
        )
    if args.command == "integration":
        return integration(output_path=args.output)
    raise AssertionError(args.command)


if __name__ == "__main__":
    raise SystemExit(main())
