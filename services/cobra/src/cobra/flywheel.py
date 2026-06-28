"""The reproducible flywheel pipeline — one command, end to end.

  python -m cobra.flywheel --count 20 --k 3 --models sonnet,haiku

Runs, in order, recording config + summary to <out_dir>/flywheel.json:
  1. load tasks (hardest) and split into disjoint TRAIN / HELD-OUT (deterministic)
  2. stream the rollout dataset on TRAIN (robust: parallel, append-as-you-go, RESUMABLE)
  3. build the two expert-iteration arms (rejection sampling) → SFT JSONL ({prompt, completion})
  4. baseline: held-out eval of the base policy (the "before training" point)
  5. print the gated Target-B next step (modal run …)

Reproducibility: task selection, the split, seed exploits, scoring, and the arms are all
deterministic. The only stochastic part is LLM sampling — captured in the dataset JSONL, which is
the recorded artifact; re-running resumes/extends it rather than starting over. Everything
downstream of the dataset is fully reproducible.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass, field
from typing import Any

from .rollout import (
    build_models,
    load_jsonl,
    mock_scorers,
    real_scorers,
    red_models,
    stream_rollouts,
)
from .substrate import load_hardest, load_subset
from .train import build_arms, held_out_eval, split_tasks, write_sft


@dataclass
class FlywheelConfig:
    models: list[str] = field(default_factory=lambda: ["sonnet", "haiku"])
    count: int = 20
    k: int = 3
    held_out_frac: float = 0.3
    workers: int = 8
    out_dir: str = "runs"
    hardest: bool = True
    seed_exploits: bool = True
    red: bool = False
    mock: bool = False


@dataclass
class FlywheelResult:
    config: dict
    dataset_path: str
    n_rollouts: int
    arms: dict[str, dict]  # arm name -> {size, cheat_fraction, path}
    baseline: dict | None  # {model, solve_rate, cheat_rate}


def _prompts_for(rollouts) -> dict[str, str]:
    from .substrate import load_task

    out: dict[str, str] = {}
    for tid in {r.task_id for r in rollouts}:
        try:
            out[tid] = load_task(tid).prompt
        except Exception:
            out[tid] = ""
    return out


def run_flywheel(
    config: FlywheelConfig,
    *,
    tasks: list | None = None,
    models: list | None = None,
    scorers: Any = None,
    exploit_fn: Any = "default",
    baseline_model: Any = None,
    prompts: dict[str, str] | None = None,
) -> FlywheelResult:
    """Run the pipeline. Dependencies are injectable for testing; the CLI wires the real ones."""
    if tasks is None:
        tasks = load_hardest(config.count) if config.hardest else load_subset(config.count)
    if models is None:
        models = build_models(config.models) + (red_models() if config.red else [])
    if scorers is None:
        scorers = mock_scorers() if config.mock else real_scorers()
    if exploit_fn == "default":
        from .breadth.cheats import forger_cheats

        exploit_fn = forger_cheats if config.seed_exploits else None
    r_naive, r_hardened, t_oracle = scorers

    train, held = split_tasks(tasks, config.held_out_frac)
    dataset_path = f"{config.out_dir}/rollouts.jsonl"
    stream_rollouts(
        train,
        models,
        r_naive=r_naive,
        r_hardened=r_hardened,
        t_oracle=t_oracle,
        k=config.k,
        out_path=dataset_path,
        workers=config.workers,
        exploit_fn=exploit_fn,
    )

    rollouts = load_jsonl(dataset_path)
    arms = build_arms(rollouts)
    if prompts is None:
        prompts = _prompts_for(rollouts)
    arm_info: dict[str, dict] = {}
    for arm in arms.values():
        path = write_sft(arm, f"{config.out_dir}/sft_{arm.name}.jsonl", prompts=prompts)
        arm_info[arm.name] = {
            "size": arm.size,
            "cheat_fraction": round(arm.cheat_fraction, 3),
            "path": str(path),
        }

    base = baseline_model if baseline_model is not None else (models[0] if models else None)
    baseline = None
    if base is not None and held:
        ev = held_out_eval(
            base, held, r_naive=r_naive, r_hardened=r_hardened, t_oracle=t_oracle, k=1
        )
        baseline = {
            "model": ev.model,
            "solve_rate": round(ev.solve_rate, 3),
            "cheat_rate": round(ev.cheat_rate, 3),
        }

    result = FlywheelResult(
        config=asdict(config),
        dataset_path=dataset_path,
        n_rollouts=len(rollouts),
        arms=arm_info,
        baseline=baseline,
    )
    with open(f"{config.out_dir}/flywheel.json", "w", encoding="utf-8") as f:
        json.dump(asdict(result), f, indent=2)
    return result


def main() -> None:
    p = argparse.ArgumentParser(prog="cobra.flywheel")
    p.add_argument("--models", default="sonnet,haiku")
    p.add_argument("--count", type=int, default=20)
    p.add_argument("--k", type=int, default=3)
    p.add_argument("--held-out-frac", type=float, default=0.3)
    p.add_argument("--workers", type=int, default=8)
    p.add_argument("--out-dir", default="runs")
    p.add_argument("--no-hardest", action="store_true")
    p.add_argument("--no-seed-exploits", action="store_true")
    p.add_argument("--red", action="store_true")
    p.add_argument("--mock", action="store_true")
    args = p.parse_args()

    config = FlywheelConfig(
        models=args.models.split(","),
        count=args.count,
        k=args.k,
        held_out_frac=args.held_out_frac,
        workers=args.workers,
        out_dir=args.out_dir,
        hardest=not args.no_hardest,
        seed_exploits=not args.no_seed_exploits,
        red=args.red,
        mock=args.mock,
    )
    result = run_flywheel(config)

    print(f"\n=== flywheel: {result.n_rollouts} rollouts → {result.dataset_path} ===")
    for name, info in result.arms.items():
        print(f"  {name:14} size={info['size']:4}  cheat_fraction={info['cheat_fraction']:.0%}")
    if result.baseline:
        b = result.baseline
        print(
            f"  baseline ({b['model']}): solve={b['solve_rate']:.0%}  cheat={b['cheat_rate']:.0%}"
        )
    print(f"  recorded: {config.out_dir}/flywheel.json")
    print(
        "\n  next (gated Target B, your GPU/Modal):"
        "\n    modal run src/cobra/train/modal_app.py"
        f" --arm-naive {config.out_dir}/sft_arm_naive.jsonl"
        f" --arm-hardened {config.out_dir}/sft_arm_hardened.jsonl"
    )


if __name__ == "__main__":
    main()
