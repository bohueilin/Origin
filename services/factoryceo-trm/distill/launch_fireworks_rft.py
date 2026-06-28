"""Launch the ShiftBench RFT job on Fireworks (managed, sub-16B = free).

Replaces the local HUD/Tinker GRPO (which 400'd at optim_step) with Fireworks
Reinforcement Fine-Tuning: same reward (our symbolic verifier), prompts = the 360
curated golden-hard tasks, reward space = shaped (coverage-gated, anti reward-hack).

    .venv-hud/bin/python distill/launch_fireworks_rft.py            # submit
    .venv-hud/bin/python distill/launch_fireworks_rft.py --wait     # submit + block
"""

from __future__ import annotations

import argparse
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# loads factoryceo_trm/.env (FIREWORKS_API_KEY) as a side effect
import src  # noqa: F401,E402  pylint: disable=unused-import
from fireworks import LLM, Dataset  # noqa: E402
from distill.fireworks_rft_evaluator import evaluate  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-model", default="accounts/fireworks/models/qwen2p5-7b-instruct")
    ap.add_argument("--dataset", default=os.path.join(ROOT, "results", "rft_golden_dataset.jsonl"))
    ap.add_argument("--job-id", default="shiftbench-golden-rft")
    ap.add_argument("--output-model", default="shiftbench-gateway-rft")
    ap.add_argument("--epochs", type=int, default=2)
    ap.add_argument("--group", type=int, default=8, help="rollouts per prompt (GRPO group size n)")
    ap.add_argument("--lora-rank", type=int, default=8)
    ap.add_argument("--learning-rate", type=float, default=1e-4)
    ap.add_argument("--max-context-length", type=int, default=8192)
    ap.add_argument("--max-tokens", type=int, default=2048)
    ap.add_argument("--wait", action="store_true")
    args = ap.parse_args()

    if not os.getenv("FIREWORKS_API_KEY"):
        print("FIREWORKS_API_KEY not set (expected in factoryceo_trm/.env)", file=sys.stderr)
        return 2

    print(f"[rft] base={args.base_model}")
    print(f"[rft] dataset={args.dataset}")
    llm = LLM(model=args.base_model, deployment_type="auto", id=f"{args.job_id}-base")
    dataset = Dataset.from_file(args.dataset)

    print("[rft] creating reinforcement fine-tuning job ...")
    job = llm.create_reinforcement_fine_tuning_job(
        id=args.job_id,
        dataset_or_id=dataset,
        reward_function=evaluate,
        output_model=args.output_model,
        epochs=args.epochs,
        n=args.group,
        lora_rank=args.lora_rank,
        learning_rate=args.learning_rate,
        max_context_length=args.max_context_length,
        max_tokens=args.max_tokens,
        temperature=1.0,
    )
    print(f"[rft] submitted: id={getattr(job, 'id', '?')} name={getattr(job, 'name', '?')}")
    print(f"[rft] state={getattr(job, 'state', '?')}")
    print("[rft] monitor in the Fireworks dashboard (Fine-tuning) or via job.get()/sync()")
    if args.wait:
        print("[rft] waiting for completion ...")
        job.wait_for_completion()
        print(f"[rft] done: state={getattr(job, 'state', '?')} output_model={args.output_model}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
