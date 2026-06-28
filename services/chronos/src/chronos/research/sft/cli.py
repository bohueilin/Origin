"""CLI for the SFT extension pipeline."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from chronos.research.sft.canonical_pipeline import run_canonical_sft_pipeline
from chronos.research.sft.loader import DEFAULT_MOCK_FIXTURE
from chronos.research.sft.model_a_pipeline import prepare_model_a_from_plan008
from chronos.research.sft.pipeline import run_sft_pipeline
from chronos.research.sft.preliminary_model_a import prepare_preliminary_model_a
from chronos.research.sft.preliminary_model_b import prepare_preliminary_model_b
from chronos.research.sft.qabench_pipeline import run_qabench_sft_pipeline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Run the Chronos SFT data-quality pipeline.",
    )
    subparsers = parser.add_subparsers(dest="command")

    mock = subparsers.add_parser(
        "mock", help="Run the development JSONL/mock pipeline."
    )
    mock.add_argument(
        "--input",
        type=Path,
        default=Path(DEFAULT_MOCK_FIXTURE),
        help="Chronos trace export JSONL (default: mock fixture)",
    )
    mock.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/sft/mock_run"),
        help="Directory for reports and exported datasets",
    )
    mock.add_argument(
        "--source-label",
        default=None,
        help="Provenance label for reports (default: input filename)",
    )

    canonical = subparsers.add_parser(
        "canonical",
        help="Run the manifest-backed Plan 008 + Plan 005 SFT pipeline.",
    )
    canonical.add_argument("--qabench-report", type=Path, required=True)
    canonical.add_argument("--release-proof", type=Path, required=True)
    canonical.add_argument(
        "--plan-008-manifest",
        type=Path,
        default=Path("docs/plans/evidence/008/MANIFEST.json"),
    )
    canonical.add_argument(
        "--plan-005-manifest",
        type=Path,
        default=Path("docs/plans/evidence/005/MANIFEST.json"),
    )
    canonical.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/chronos/research/sft/runs/manual"),
    )

    qabench = subparsers.add_parser(
        "qabench",
        help="Run SFT from a Plan 008 qabench benchmark report (preliminary path).",
    )
    qabench.add_argument(
        "--report",
        type=Path,
        default=Path("artifacts/chronos/qabench/benchmark-report.json"),
        help="Plan 008 qabench benchmark report JSON",
    )
    qabench.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/chronos/research/sft/runs/qabench_preliminary"),
    )
    qabench.add_argument(
        "--source-label",
        default="qabench_preliminary",
        help="Provenance label for reports (default: qabench_preliminary)",
    )

    model_a = subparsers.add_parser(
        "model-a-prepare",
        help="Freeze the private Model A pilot from completed sterile-referee Plan 008 evidence.",
    )
    model_a.add_argument("--qabench-report", type=Path, required=True)
    model_a.add_argument(
        "--plan-008-manifest",
        type=Path,
        default=Path("docs/plans/evidence/008/MANIFEST.json"),
    )
    model_a.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/chronos/research/sft/model-a/manual"),
    )

    preliminary_model_a = subparsers.add_parser(
        "model-a-prepare-preliminary",
        help="Prepare a disposable private Model A pilot from unverified diff labels.",
    )
    preliminary_model_a.add_argument("--qabench-report", type=Path, required=True)
    preliminary_model_a.add_argument("--output", type=Path, required=True)
    preliminary_model_a.add_argument(
        "--acknowledge-unverified-labels",
        action="store_true",
        help="Required acknowledgement that this cannot support model-quality claims.",
    )

    preliminary_model_b = subparsers.add_parser(
        "model-b-prepare-preliminary",
        help="Prepare matched Model B by removing confirmed hacks from Model A's train split.",
    )
    preliminary_model_b.add_argument(
        "--model-a-output",
        type=Path,
        required=True,
        help="Directory containing a frozen preliminary Model A experiment",
    )
    preliminary_model_b.add_argument("--output", type=Path, required=True)

    # Backward-compatible root flags keep older mock invocations working.
    parser.add_argument(
        "--input",
        type=Path,
        default=Path(DEFAULT_MOCK_FIXTURE),
        help="Chronos trace export JSONL (default: mock fixture)",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("artifacts/sft/mock_run"),
        help="Directory for reports and exported datasets",
    )
    parser.add_argument(
        "--source-label",
        default=None,
        help="Provenance label for reports (default: input filename)",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.command == "qabench":
        if not args.report.is_file():
            print(f"error: qabench report not found: {args.report}", file=sys.stderr)
            return 1
        result = run_qabench_sft_pipeline(
            args.report,
            args.output,
            source_label=args.source_label,
        )
        print(f"Wrote qabench pipeline outputs to {result.output_dir}")
        print(f"  report digest:         {result.report_digest[:12]}...")
        print(f"  raw SFT examples:      {result.raw_sft_examples}")
        print(f"  hardened SFT examples: {result.hardened_sft_examples}")
        print(f"  rejected hack records: {result.rejected_hack_records}")
        print(f"  quarantined records:   {len(result.quarantined)}")
        print(
            "  contamination (raw):   "
            f"{result.metrics.raw_contamination_rate * 100:.1f}%"
        )
        return 0

    if args.command == "model-a-prepare":
        result = prepare_model_a_from_plan008(
            qabench_report_path=args.qabench_report,
            plan_008_manifest_path=args.plan_008_manifest,
            output_dir=args.output,
        )
        print(f"Prepared private Model A files at {result.output_dir}")
        print(f"  dataset id:        {result.dataset_id}")
        print(f"  split digest:      {result.split_digest}")
        print(f"  train examples:    {result.train_count}")
        print(f"  held-out examples: {result.heldout_count}")
        print(f"  quarantined:       {result.quarantine_count}")
        print("  Fireworks upload:  not_run")
        print("  training:          not_run")
        return 0

    if args.command == "model-a-prepare-preliminary":
        if not args.acknowledge_unverified_labels:
            print(
                "error: --acknowledge-unverified-labels is required for preliminary mode",
                file=sys.stderr,
            )
            return 2
        result = prepare_preliminary_model_a(
            qabench_report_path=args.qabench_report,
            output_dir=args.output,
        )
        print(f"Prepared disposable preliminary Model A files at {result.output_dir}")
        print(f"  dataset id:        {result.dataset_id}")
        print(f"  split digest:      {result.split_digest}")
        print(f"  train examples:    {result.train_count}")
        print(f"  held-out examples: {result.heldout_count}")
        print(f"  quarantined:       {result.quarantine_count}")
        print("  evidence level:    preliminary_diff_labeled_unverified")
        print("  Fireworks upload:  not_run")
        print("  training:          not_run")
        return 0

    if args.command == "model-b-prepare-preliminary":
        result = prepare_preliminary_model_b(
            model_a_output_dir=args.model_a_output,
            output_dir=args.output,
        )
        print(f"Prepared matched preliminary Model B files at {result.output_dir}")
        print(f"  dataset id:             {result.dataset_id}")
        print(f"  content digest:         {result.content_digest}")
        print(f"  train examples:         {result.train_count}")
        print(f"  removed confirmed hacks:{result.removed_hack_count}")
        print(f"  hack-prone eval prompts:{result.hack_prone_prompt_count}")
        print(f"  matched model A dir:    {result.model_a_output_dir}")
        print("  evidence level:         preliminary_diff_labeled_unverified")
        print("  Fireworks upload:       not_run")
        print("  training:               not_run")
        return 0

    if args.command == "canonical":
        result = run_canonical_sft_pipeline(
            qabench_report_path=args.qabench_report,
            release_proof_path=args.release_proof,
            plan_008_manifest_path=args.plan_008_manifest,
            plan_005_manifest_path=args.plan_005_manifest,
            output_dir=args.output,
        )
        print(f"Wrote canonical pipeline outputs to {result.output_dir}")
        print(f"  raw SFT examples:      {result.raw_sft_examples}")
        print(f"  hardened SFT examples: {result.hardened_sft_examples}")
        print(f"  rejected hack records: {result.rejected_hack_records}")
        print(f"  quarantined records:   {len(result.quarantined)}")
        return 0

    if not args.input.is_file():
        print(f"error: input file not found: {args.input}", file=sys.stderr)
        return 1

    result = run_sft_pipeline(
        args.input,
        args.output,
        source_label=args.source_label,
    )

    print(f"Wrote pipeline outputs to {result.output_dir}")
    print(f"  raw SFT examples:      {result.raw_sft_examples}")
    print(f"  hardened SFT examples: {result.hardened_sft_examples}")
    print(f"  rejected hack records: {result.rejected_hack_records}")
    print(
        f"  contamination (raw):   {result.metrics.raw_contamination_rate * 100:.1f}%"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
