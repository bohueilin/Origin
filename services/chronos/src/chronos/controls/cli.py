"""CLI entry points for Plan 004 control workflows."""

from __future__ import annotations

import argparse
import json

from chronos.controls.diversity import validate_all_paths, write_diversity_rationales
from chronos.controls.freeze import (
    apply_phase2,
    load_controls,
    seal_phase1,
    verify_sealed_digests,
)
from chronos.controls.grade_local import grade_all_controls
from chronos.controls.hud_baseline import (
    run_baselines_sync,
    run_corrupt_negative_sync,
    write_baseline_artifact,
)
from chronos.controls.task_identity import verify_task_identity, write_task_identity


def cmd_materialize(_: argparse.Namespace) -> int:
    write_task_identity()
    validate_all_paths()
    write_diversity_rationales()
    grade_all_controls()
    seal_phase1()
    print(
        "materialize: task identity, diversity, local grades, and Phase 1 seal complete"
    )
    return 0


def cmd_integration(_: argparse.Namespace) -> int:
    verify_task_identity()
    controls = load_controls()
    if len(controls) != 3:
        raise SystemExit(f"expected 3 sealed controls, found {len(controls)}")
    verify_sealed_digests()
    grade_all_controls()

    baseline_by_control = run_baselines_sync(runs_per_control=3)
    corrupt_reward = run_corrupt_negative_sync("path-a")
    if corrupt_reward != 0.0:
        raise SystemExit(
            f"corrupt-control negative check failed: reward={corrupt_reward}"
        )

    manifest = apply_phase2(baseline_by_control)
    artifact = write_baseline_artifact(
        {
            "baseline_by_control": {
                control_id: [run.to_dict() for run in runs]
                for control_id, runs in baseline_by_control.items()
            },
            "corrupt_control_reward": corrupt_reward,
        }
    )
    print(
        json.dumps(
            {
                "controls_phase": manifest.get("phase"),
                "baseline_artifact": str(artifact),
            }
        )
    )
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="chronos.controls.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("materialize").set_defaults(func=cmd_materialize)
    sub.add_parser("integration").set_defaults(func=cmd_integration)
    args = parser.parse_args(argv)
    return int(args.func(args))


if __name__ == "__main__":
    raise SystemExit(main())
