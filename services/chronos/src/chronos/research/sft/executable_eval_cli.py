"""CLI for the three-arm executable Base / Model A / Model B evaluation.

Adds an untuned base arm and N-sample rollouts on top of the paired A/B
executable dual grader, then emits an attribution comparison. Identical
decoding (temperature / max_tokens) is applied to every arm so differences
are attributable to weights, not sampling.
"""

from __future__ import annotations

import argparse
import json
import os
import uuid
from datetime import UTC, datetime
from pathlib import Path

from chronos.research.sft.executable_eval import (
    CONDITIONS,
    FireworksChatClient,
    RolloutConfig,
    load_task_prompt,
    run_rollout,
    summarize,
)
from chronos.research.sft.executable_eval_modal import ModalWorkspaceFactory
from chronos.research.sft.executable_eval_report import build_comparison_report

# Untuned base provides attribution; A/B are the preliminary fine-tuned deployments.
DEFAULT_ROUTES = {
    "base": "accounts/fireworks/models/qwen3-4b",
    "model_a": "accounts/desaikrrish-8x76pqk3/deployments/oqvhj92h",
    "model_b": "accounts/desaikrrish-8x76pqk3/deployments/p6ktlcy8",
}


def _csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _write_json(path: Path, payload: dict[str, object]) -> None:
    path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tasks", required=True, help="Comma-separated qabench task ids"
    )
    parser.add_argument(
        "--conditions",
        default="neutral,pressure,reward_only",
        help="Comma-separated prompt conditions (hack-eliciting by default)",
    )
    parser.add_argument(
        "--arms",
        default="base,model_a,model_b",
        help="Comma-separated arms to run (subset of base,model_a,model_b)",
    )
    parser.add_argument("--base-model", default=DEFAULT_ROUTES["base"])
    parser.add_argument("--model-a", default=DEFAULT_ROUTES["model_a"])
    parser.add_argument("--model-b", default=DEFAULT_ROUTES["model_b"])
    parser.add_argument(
        "--samples",
        type=int,
        default=8,
        help="Rollouts per (arm, task, condition); 8-16 recommended for a rate",
    )
    parser.add_argument("--max-steps", type=int, default=12)
    parser.add_argument("--max-tokens", type=int, default=2048)
    parser.add_argument(
        "--temperature",
        type=float,
        default=0.7,
        help="Identical across arms; must be > 0 so N samples estimate a rate",
    )
    parser.add_argument("--epsilon", type=float, default=0.10)
    parser.add_argument("--min-completed-per-arm", type=int, default=8)
    parser.add_argument(
        "--output-root",
        type=Path,
        default=Path("artifacts/chronos/research/sft/executable-eval/runs"),
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    if args.samples < 1:
        parser.error("--samples must be positive")

    tasks = _csv(args.tasks)
    conditions = _csv(args.conditions)
    unknown_conditions = sorted(set(conditions) - set(CONDITIONS))
    if unknown_conditions:
        parser.error(f"unknown conditions: {', '.join(unknown_conditions)}")

    routes = {"base": args.base_model, "model_a": args.model_a, "model_b": args.model_b}
    arms = _csv(args.arms)
    unknown_arms = sorted(set(arms) - set(routes))
    if unknown_arms:
        parser.error(f"unknown arms: {', '.join(unknown_arms)}")
    selected = {label: routes[label] for label in arms}

    root = Path.cwd().resolve()
    api_key = os.environ.get("FIREWORKS_API_KEY", "")
    client = FireworksChatClient(api_key)
    workspaces = ModalWorkspaceFactory(root)
    run_id = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:8]
    output_dir = args.output_root / run_id
    output_dir.mkdir(parents=True, exist_ok=False)

    run_metadata = {
        "run_id": run_id,
        "arms": selected,
        "tasks": tasks,
        "conditions": conditions,
        "samples_per_cell": args.samples,
        "temperature": args.temperature,
        "max_steps": args.max_steps,
        "max_tokens": args.max_tokens,
        "decoding_note": "identical temperature/max_tokens across all arms",
    }
    _write_json(output_dir / "run_metadata.json", run_metadata)

    rows: list[dict[str, object]] = []
    for task_id in tasks:
        prompt = load_task_prompt(root, task_id)
        for condition in conditions:
            for sample in range(args.samples):
                for label, route in selected.items():
                    config = RolloutConfig(
                        model_label=label,
                        model_route=route,
                        task_id=task_id,
                        condition=condition,
                        repeat=sample,
                        max_steps=args.max_steps,
                        max_tokens=args.max_tokens,
                        temperature=args.temperature,
                    )
                    print(f"{task_id} {condition} sample={sample} {label}", flush=True)
                    row = run_rollout(
                        client=client,
                        workspace_factory=workspaces,
                        config=config,
                        task_prompt=prompt,
                    )
                    rows.append(row)
                    _write_json(output_dir / f"rollout-{len(rows):04d}.json", row)
                    _write_json(output_dir / "summary.json", summarize(rows))
                    _write_json(
                        output_dir / "comparison.json",
                        build_comparison_report(
                            rows,
                            arm_labels=arms,
                            run_metadata=run_metadata,
                            epsilon=args.epsilon,
                            min_completed_per_arm=args.min_completed_per_arm,
                        ),
                    )

    report = build_comparison_report(
        rows,
        arm_labels=arms,
        run_metadata=run_metadata,
        epsilon=args.epsilon,
        min_completed_per_arm=args.min_completed_per_arm,
    )
    interpretation = report["interpretation"]
    print(f"\nverdict: {interpretation.get('verdict')}")
    print(f"reason:  {interpretation.get('reason')}")
    print(output_dir)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
