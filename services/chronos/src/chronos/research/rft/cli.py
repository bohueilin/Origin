"""CLI for the RFT launch-readiness pipeline."""

from __future__ import annotations

import argparse
from pathlib import Path

from chronos.research.rft.evaluator_binding import prepare_sealed_v2_evaluator_binding
from chronos.research.rft.pipeline import run_canonical_rft_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Chronos RFT launch-readiness pipeline.",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)
    for command, help_text in (
        ("prepare", "Prepare guarded RFT launch-readiness artifacts."),
        ("canonical", "Alias for prepare."),
    ):
        subcommand = subparsers.add_parser(command, help=help_text)
        subcommand.add_argument("--qabench-report", type=Path, required=True)
        subcommand.add_argument("--release-proof", type=Path, required=True)
        subcommand.add_argument(
            "--plan-008-manifest",
            type=Path,
            default=Path("docs/plans/evidence/008/MANIFEST.json"),
        )
        subcommand.add_argument(
            "--plan-005-manifest",
            type=Path,
            default=Path("docs/plans/evidence/005/MANIFEST.json"),
        )
        subcommand.add_argument(
            "--output",
            type=Path,
            default=Path("artifacts/chronos/research/rft/runs/manual"),
        )
    binding = subparsers.add_parser(
        "bind-evaluator",
        help="Prepare a non-registering evaluator binding from the sealed Plan 005 v2 proof.",
    )
    binding.add_argument("--release-proof", type=Path, required=True)
    binding.add_argument(
        "--plan-005-manifest",
        type=Path,
        default=Path("docs/plans/evidence/005/MANIFEST.json"),
    )
    binding.add_argument("--output", type=Path, required=True)
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.command == "bind-evaluator":
        result = prepare_sealed_v2_evaluator_binding(
            release_proof_path=args.release_proof,
            plan_005_manifest_path=args.plan_005_manifest,
            output_path=args.output,
        )
        print(f"Prepared sealed v2 evaluator binding at {result.output_path}")
        print(f"  release proof:       {result.release_proof_id}")
        print(f"  Witness regressions: {result.witness_count}")
        print(f"  control regressions: {result.control_count}")
        print(f"  subversion probes:   {result.subversion_probe_count}")
        print("  provider registration: not_run")
        print("  training:              not_run")
        return 0
    result = run_canonical_rft_pipeline(
        qabench_report_path=args.qabench_report,
        release_proof_path=args.release_proof,
        plan_008_manifest_path=args.plan_008_manifest,
        plan_005_manifest_path=args.plan_005_manifest,
        output_dir=args.output,
    )
    print(f"Wrote canonical RFT launch artifacts to {result.output_dir}")
    print(f"  raw RFT prompts:       {result.raw_prompt_count}")
    print(f"  hardened RFT prompts:  {result.hardened_prompt_count}")
    print(f"  rejected hack prompts: {result.rejected_hack_count}")
    print(f"  quarantined records:   {result.quarantined_count}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
