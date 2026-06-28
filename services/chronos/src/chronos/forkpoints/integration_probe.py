"""Plan 002 mapped integration probe.

This command binds the ForkPoint contract to checked-in Plan 001 evidence and
records an honest readiness artifact. It exits non-zero in --require-real mode
until the real HUD completed-action boundary and Modal task snapshot adapter are
available.
"""

from __future__ import annotations

import argparse
import json
import tempfile
from pathlib import Path

from .core import (
    ForkPointError,
    ForkPointStore,
    InMemorySnapshotProvider,
    boundary_token,
    capture_forkpoint,
    load_source_trace,
    restore_forkpoint,
)
from .live_boundary_probe import run_live_boundary_probe
from .modal_probe import run_modal_filesystem_probe
from .replay_probe import run_trace_replay_probe
from .trace_probe import fetch_trace_summary

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / "docs" / "plans" / "evidence" / "002" / "artifacts"


def _sample_history() -> list[dict[str, str]]:
    return [
        {
            "role": "user",
            "content": "Implement SalesAnalyzer using aggregation pipelines.",
        },
        {"role": "assistant", "content": "Created query.py and ran the grader."},
        {"role": "tool", "content": "pytest task_assets/test_outputs.py: 13 passed"},
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--require-real", action="store_true")
    args = parser.parse_args()

    source = load_source_trace(ROOT / "docs" / "plans" / "repo-map" / "STATUS.json")
    trace_summary = fetch_trace_summary()
    modal_summary = run_modal_filesystem_probe()
    replay_summary = run_trace_replay_probe()
    live_boundary_summary = run_live_boundary_probe()
    provider = InMemorySnapshotProvider()
    try:
        with tempfile.TemporaryDirectory(prefix="forkpoint-readiness-") as tmp:
            store = ForkPointStore(Path(tmp))
            hud_step_id = "completed-action:accepted-live-reward1-final"
            task_state = {
                "task_state_root": "/app",
                "query_py": "present in accepted live trace; exact file evidence unavailable",
                "mongodb_dbpath": "/data/db requires real Modal filesystem snapshot",
                "mongo_log": "/var/log/mongodb.log requires real Modal filesystem snapshot",
                "pytest_plugin_surface": "/app/task_assets is branch-writable verifier surface",
            }
            record = capture_forkpoint(
                source=source,
                hud_step_id=hud_step_id,
                history_prefix=_sample_history(),
                task_state=task_state,
                snapshot_mode="filesystem",
                provider=provider,
                store=store,
            )
            handoff = restore_forkpoint(
                record=record,
                provider=provider,
                expected_boundary_token=boundary_token(source, hud_step_id),
                history_prefix=_sample_history(),
                grader_digest=source["grader_digest"],
            )
    except ForkPointError as exc:
        print(f"ERROR {exc.error_class}: {exc}")
        return 1

    artifact = {
        "status": "readiness-pass",
        "scope": "checked-in-trace-evidence plus local provider contract",
        "fork_point_id": record["fork_point_id"],
        "trace_boundary_summary_ref": "docs/plans/evidence/002/artifacts/trace-boundary-summary.json",
        "trace_event_count": trace_summary["event_count"],
        "trace_raw_events_sha256": trace_summary["raw_events_sha256"],
        "modal_filesystem_probe_ref": "docs/plans/evidence/002/artifacts/modal-filesystem-probe.json",
        "modal_snapshot_id": modal_summary["snapshot_id"],
        "modal_snapshot_mode": modal_summary["snapshot_mode"],
        "trace_replay_snapshot_ref": "docs/plans/evidence/002/artifacts/trace-replay-snapshot.json",
        "trace_replay_snapshot_id": replay_summary["snapshot_id"],
        "trace_replay_tool_count": replay_summary["replayed_tool_count"],
        "live_boundary_forkpoint_ref": "docs/plans/evidence/002/artifacts/live-boundary-forkpoint.json",
        "live_boundary_forkpoint_id": live_boundary_summary["fork_point_id"],
        "live_boundary_snapshot_id": live_boundary_summary["snapshot_id"],
        "handoff_keys": sorted(handoff),
        "remaining_real_system_gaps": [
            "Live boundary capture is an orchestrated accepted-trace rerun, not the already-finished historical sandbox instance",
            "full branch security acceptance remains outside Plan 002 despite restored-sandbox surface inventory",
            "environment image identity records Docker registry base manifest plus the checked-in source tree and Modal recipe; a Modal-internal built image manifest remains unavailable",
        ],
    }
    EVIDENCE.mkdir(parents=True, exist_ok=True)
    path = EVIDENCE / "integration-readiness.json"
    path.write_text(
        json.dumps(artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"PASS integration-readiness artifact={path}")
    if args.require_real:
        print("STOP real ForkPoint capture is not proven by this readiness probe")
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
