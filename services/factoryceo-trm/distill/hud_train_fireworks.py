"""Fireworks Training API GRPO over ShiftBench golden-hard tasks.

Follows the HUD cookbook (hud-python/cookbooks/fireworks-rl-training):
managed trainer + deployment sampler, local verifier grading, GRPO via
forward_backward_custom + optim_step. Does NOT use Fireworks native RFT jobs.

Calibration (see cookbook README):
  - ``--calibration-backend inference``: cheap serverless sanity check (NOT the
    training base unless you pass a deployed inference model id).
  - ``--calibration-backend managed``: provisions the deployment sampler on the
    actual base model — this is the calibration that counts. Still skips
    optim_step, but Fireworks pins GPU via the training shape (qwen3-8b-128k →
    B200 on current accounts; there is no separate "8GB" tier knob).

    # Cheap sanity check (no GPU provisioning):
    .venv-hud/bin/python distill/hud_train_fireworks.py --calibrate-only \
        --calibration-backend inference --profile 8b --reward-mode format

    # Real cal on training base (Qwen3 8B default):
    .venv-hud/bin/python distill/hud_train_fireworks.py --calibrate-only \
        --calibration-backend managed --profile 8b --reward-mode format \
        --groups-per-step 6 --rollouts-per-prompt 6 --debug-samples 4

    # Train only after managed cal passes (within_group_reward_std > 0):
    .venv-hud/bin/python distill/hud_train_fireworks.py --profile 8b --steps 5 \
        --reward-mode shaped --groups-per-step 6 --rollouts-per-prompt 6

Refs: https://github.com/hud-evals/hud-python/tree/main/cookbooks/fireworks-rl-training
"""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import random
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import tinker
import torch
from dotenv import load_dotenv
from fireworks.training.sdk import AdaptiveConcurrencyController, FiretitanServiceClient, GradAccNormalization
from openai import AsyncOpenAI
from transformers import AutoTokenizer

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import src  # noqa: F401,E402  loads factoryceo_trm/.env
from src.floor_prompt import JSON_SYSTEM_PROMPT, floor_prompt_and_state  # noqa: E402
from src.hud_env import reward_for_mode  # noqa: E402

DEFAULT_GOLDEN = ROOT / "results" / "golden_hard_tasks.json"
DEFAULT_INFERENCE_BASE_URL = "https://api.fireworks.ai/inference/v1"

# Cookbook defaults: Qwen3 8B full-param + qwen3-8b-128k shape (B200 pinned by Fireworks).
PROFILE_8B = {
    "base_model": "accounts/fireworks/models/qwen3-8b",
    "tokenizer_model": "Qwen/Qwen3-8B",
    "training_shape": "accounts/fireworks/trainingShapes/qwen3-8b-128k",
    "deployment_id": "shiftbench-qwen8-rl",
    "output_dir": "results/fireworks_rl_qwen8",
    "max_tokens": 4096,
    "parallelism": 18,
}
PROFILE_27B = {
    "base_model": "accounts/fireworks/models/qwen3p5-27b",
    "tokenizer_model": "Qwen/Qwen3.5-27B",
    "training_shape": "accounts/fireworks/trainingShapes/qwen3p5-27b-256k",
    "deployment_id": "shiftbench-qwen35-27b-rl",
    "output_dir": "results/fireworks_rl_qwen35_27b",
    "max_tokens": 8192,
    "parallelism": 8,
}
PROFILES = {"8b": PROFILE_8B, "27b": PROFILE_27B}


@dataclass(frozen=True, slots=True)
class FloorTask:
    group_index: int
    floor_id: str
    seed: int
    reward_mode: str = "format"

    @property
    def prompt(self) -> str:
        text, _ = floor_prompt_and_state(self.floor_id, self.seed)
        return text


@dataclass(slots=True)
class RolloutRecord:
    task: FloorTask
    text: str
    reward: float
    tokens: list[int]
    rollout_logprobs: list[float]
    loss_weights: torch.Tensor


def load_env() -> None:
    load_dotenv(ROOT / ".env")
    load_dotenv()


def resolve_base_model(cli_value: str) -> str:
    """Prefer FIREWORKS_RL_BASE_MODEL (deployed SFT checkpoint) over profile base."""
    return os.environ.get("FIREWORKS_RL_BASE_MODEL", cli_value)


def resolve_inference_model(explicit: str | None, base_model: str) -> str:
    """Inference cal model: explicit flag, then env, then training base."""
    if explicit:
        return explicit
    return os.environ.get("FIREWORKS_MODEL", base_model)


def apply_profile(args: argparse.Namespace) -> None:
    profile = PROFILES[args.profile]
    if args.base_model is None:
        args.base_model = profile["base_model"]
    if args.tokenizer_model is None:
        args.tokenizer_model = profile["tokenizer_model"]
    if args.training_shape is None:
        args.training_shape = profile["training_shape"]
    if args.deployment_id is None:
        args.deployment_id = profile["deployment_id"]
    if args.output_dir is None:
        args.output_dir = profile["output_dir"]
    if args.max_tokens is None:
        args.max_tokens = profile["max_tokens"]
    if args.parallelism is None:
        args.parallelism = profile["parallelism"]


def load_golden_tasks(path: Path, *, groups: int, seed: int, reward_mode: str) -> list[FloorTask]:
    data = json.loads(path.read_text(encoding="utf-8"))
    pool = data.get("tasks", [])
    by_floor: dict[str, list[dict]] = {}
    for t in pool:
        by_floor.setdefault(t["floor_id"], []).append(t)
    for fid in by_floor:
        by_floor[fid].sort(key=lambda x: x.get("golden_score", 0), reverse=True)
    rng = random.Random(seed)
    floors = sorted(by_floor)
    rng.shuffle(floors)
    picked: list[dict] = []
    idx = 0
    while len(picked) < min(groups, len(pool)):
        progressed = False
        for fid in floors:
            if idx < len(by_floor[fid]):
                picked.append(by_floor[fid][idx])
                progressed = True
                if len(picked) >= min(groups, len(pool)):
                    break
        if not progressed:
            break
        idx += 1
    return [
        FloorTask(
            group_index=i,
            floor_id=t["floor_id"],
            seed=int(t["seed"]),
            reward_mode=reward_mode,
        )
        for i, t in enumerate(picked)
    ]


def format_prompt_tokens(tokenizer: Any, prompt: str, *, enable_thinking: bool = False) -> list[int]:
    messages = [
        {"role": "system", "content": JSON_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]
    kwargs: dict[str, Any] = {"tokenize": False, "add_generation_prompt": True}
    try:
        text = tokenizer.apply_chat_template(messages, enable_thinking=enable_thinking, **kwargs)
    except TypeError:
        text = tokenizer.apply_chat_template(messages, **kwargs)
    return list(tokenizer.encode(text))


def chat_messages(prompt: str) -> list[dict[str, str]]:
    return [
        {"role": "system", "content": JSON_SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ]


def grade_answer(text: str, task: FloorTask) -> float:
    _, state = floor_prompt_and_state(task.floor_id, task.seed)
    return float(reward_for_mode(state, text, task.reward_mode))


async def sample_one(
    sampler: Any,
    tokenizer: Any,
    task: FloorTask,
    *,
    max_tokens: int,
    temperature: float,
    top_p: float,
    enable_thinking: bool,
) -> RolloutRecord:
    prompt_tokens = format_prompt_tokens(tokenizer, task.prompt, enable_thinking=enable_thinking)
    completions = await sampler.sample_with_prompt_tokens(
        prompt_tokens,
        n=1,
        max_tokens=max_tokens,
        temperature=temperature,
        top_p=top_p,
        logprobs=True,
    )
    completion = completions[0]
    tokens = list(completion.full_tokens)
    prompt_len = int(completion.prompt_len)
    output_len = max(0, len(tokens) - prompt_len)
    output_logprobs = list(completion.inference_logprobs)
    text = str(completion.text)
    reward = grade_answer(text, task)
    model_input_len = max(0, len(tokens) - 1)
    rollout_logprobs = [0.0] * max(0, prompt_len - 1) + output_logprobs[:output_len]
    if len(rollout_logprobs) < model_input_len:
        rollout_logprobs.extend([0.0] * (model_input_len - len(rollout_logprobs)))
    else:
        rollout_logprobs = rollout_logprobs[:model_input_len]
    weights = torch.zeros(model_input_len, dtype=torch.float32)
    if output_len:
        weights[max(0, prompt_len - 1) :] = 1.0
    return RolloutRecord(
        task=task,
        text=text,
        reward=reward,
        tokens=tokens,
        rollout_logprobs=rollout_logprobs,
        loss_weights=weights,
    )


async def sample_rollouts(
    sampler: Any,
    tokenizer: Any,
    tasks: list[FloorTask],
    *,
    rollouts_per_prompt: int,
    max_tokens: int,
    temperature: float,
    top_p: float,
    enable_thinking: bool,
) -> list[RolloutRecord]:
    jobs = [
        sample_one(
            sampler,
            tokenizer,
            task,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            enable_thinking=enable_thinking,
        )
        for task in tasks
        for _ in range(rollouts_per_prompt)
    ]
    return await asyncio.gather(*jobs)


async def sample_one_inference(
    client: AsyncOpenAI,
    task: FloorTask,
    *,
    model: str,
    max_tokens: int,
    temperature: float,
    top_p: float,
    json_mode: bool,
) -> RolloutRecord:
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": chat_messages(task.prompt),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": top_p,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}
    response = await client.chat.completions.create(**kwargs)
    text = response.choices[0].message.content or ""
    reward = grade_answer(text, task)
    return RolloutRecord(
        task=task,
        text=text,
        reward=reward,
        tokens=[],
        rollout_logprobs=[],
        loss_weights=torch.zeros(0, dtype=torch.float32),
    )


async def sample_rollouts_inference(
    client: AsyncOpenAI,
    tasks: list[FloorTask],
    *,
    model: str,
    rollouts_per_prompt: int,
    max_tokens: int,
    temperature: float,
    top_p: float,
    parallelism: int,
    json_mode: bool,
) -> list[RolloutRecord]:
    sem = asyncio.Semaphore(parallelism)

    async def run_one(task: FloorTask) -> RolloutRecord:
        async with sem:
            return await sample_one_inference(
                client,
                task,
                model=model,
                max_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                json_mode=json_mode,
            )

    jobs = [run_one(task) for task in tasks for _ in range(rollouts_per_prompt)]
    return await asyncio.gather(*jobs)


def reward_stats(records: list[RolloutRecord]) -> dict[str, float]:
    if not records:
        return {"reward_mean": 0.0, "reward_std": 0.0, "reward_min": 0.0, "reward_max": 0.0}
    rewards = [r.reward for r in records]
    mean = sum(rewards) / len(rewards)
    variance = sum((r - mean) ** 2 for r in rewards) / max(1, len(rewards) - 1)
    return {
        "reward_mean": mean,
        "reward_std": math.sqrt(variance),
        "reward_min": min(rewards),
        "reward_max": max(rewards),
    }


def within_group_reward_std(records: list[RolloutRecord]) -> float:
    """Mean per-group reward std — the spread GRPO actually trains on."""
    grouped: dict[int, list[float]] = {}
    for record in records:
        grouped.setdefault(record.task.group_index, []).append(record.reward)
    stds: list[float] = []
    for rewards in grouped.values():
        if len(rewards) < 2:
            continue
        mean = sum(rewards) / len(rewards)
        variance = sum((r - mean) ** 2 for r in rewards) / (len(rewards) - 1)
        stds.append(math.sqrt(variance))
    return sum(stds) / len(stds) if stds else 0.0


def advantages_by_record(records: list[RolloutRecord]) -> list[float]:
    grouped: dict[int, list[float]] = {}
    for record in records:
        grouped.setdefault(record.task.group_index, []).append(record.reward)
    stats: dict[int, tuple[float, float]] = {}
    for group, rewards in grouped.items():
        mean = sum(rewards) / len(rewards)
        variance = sum((r - mean) ** 2 for r in rewards) / max(1, len(rewards) - 1)
        std = math.sqrt(variance)
        stats[group] = (mean, std if std > 1e-6 else 1.0)
    return [
        (record.reward - stats[record.task.group_index][0]) / stats[record.task.group_index][1]
        for record in records
    ]


def make_datums(records: list[RolloutRecord]) -> list[tinker.Datum]:
    return [
        tinker.Datum(
            model_input=tinker.ModelInput.from_ints(record.tokens[:-1]),
            loss_fn_inputs={
                "target_tokens": tinker.TensorData(
                    data=record.tokens[1:],
                    dtype="int64",
                    shape=[len(record.tokens) - 1],
                ),
                "weights": tinker.TensorData(
                    data=record.loss_weights.tolist(),
                    dtype="float32",
                    shape=[len(record.tokens) - 1],
                ),
            },
        )
        for record in records
    ]


def make_grpo_loss(records: list[RolloutRecord], advantages: list[float]):
    rollout_logprobs = [
        torch.tensor(record.rollout_logprobs, dtype=torch.float32) for record in records
    ]
    advantage_tensors = [torch.tensor(value, dtype=torch.float32) for value in advantages]

    def loss_fn(
        data: list[tinker.Datum], logprobs_list: list[torch.Tensor]
    ) -> tuple[torch.Tensor, dict[str, float]]:
        total_loss = torch.tensor(0.0)
        total_tokens = 0.0
        ratios: list[float] = []
        for i, logprobs in enumerate(logprobs_list):
            weights = torch.tensor(data[i].loss_fn_inputs["weights"].data, dtype=torch.float32)
            min_len = min(len(logprobs), len(weights), len(rollout_logprobs[i]))
            if min_len == 0:
                continue
            pi = logprobs[:min_len].float()
            old = rollout_logprobs[i][:min_len]
            mask = weights[:min_len]
            ratio = torch.exp((pi - old).clamp(-8.0, 8.0))
            clipped = torch.clamp(ratio, 0.8, 1.2)
            surrogate = torch.minimum(ratio * advantage_tensors[i], clipped * advantage_tensors[i])
            total_loss = total_loss - torch.dot(surrogate, mask)
            total_tokens += float(mask.sum().item())
            if mask.sum().item() > 0:
                ratios.append(float((ratio * mask).sum().item() / mask.sum().item()))
        mean_ratio = sum(ratios) / len(ratios) if ratios else 0.0
        return total_loss, {
            "policy_loss_sum": float(total_loss.item()),
            "tokens": total_tokens,
            "mean_ratio": mean_ratio,
        }

    return loss_fn


def append_jsonl(path: Path, item: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(item, sort_keys=True) + "\n")


def maybe_plot(metrics_path: Path, output_path: Path) -> None:
    try:
        import matplotlib.pyplot as plt
    except Exception:
        return
    if not metrics_path.exists():
        return
    rows = [json.loads(line) for line in metrics_path.read_text(encoding="utf-8").splitlines() if line]
    plottable = [row for row in rows if row.get("phase") in {"calibrate", "train"}]
    if not plottable:
        return
    steps = [row["step"] for row in plottable]
    rewards = [row["reward_mean"] for row in plottable]
    losses = [row.get("policy_loss_sum", 0.0) for row in plottable]
    fig, ax1 = plt.subplots(figsize=(8, 4))
    ax1.plot(steps, rewards, marker="o", label="reward_mean", color="tab:green")
    ax1.set_xlabel("step")
    ax1.set_ylabel("reward_mean", color="tab:green")
    ax2 = ax1.twinx()
    ax2.plot(steps, losses, marker="x", label="policy_loss_sum", color="tab:blue")
    ax2.set_ylabel("policy_loss_sum", color="tab:blue")
    fig.tight_layout()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(output_path, dpi=160)


def check_grpo_gate(
    records: list[RolloutRecord],
    *,
    min_std: float,
    reward_mode: str,
    base_model: str,
    phase: str,
) -> float:
    wg_std = within_group_reward_std(records)
    stats = reward_stats(records)
    print(
        f"[fw-rl] {phase}: model={base_model} reward={reward_mode} "
        f"within_group_reward_std={wg_std:.4f} "
        f"mean={stats['reward_mean']:.4f} min={stats['reward_min']:.4f} max={stats['reward_max']:.4f}",
        flush=True,
    )
    if wg_std <= min_std:
        print(
            f"[fw-rl] ABORT: flat GRPO signal (within_group_reward_std={wg_std} <= {min_std}). "
            "Tune task difficulty, use --reward-mode format, raise --max-tokens, "
            "or point FIREWORKS_RL_BASE_MODEL at your SFT checkpoint.",
            flush=True,
        )
        raise SystemExit(2)
    return wg_std


def should_gate(args: argparse.Namespace, *, step: int) -> bool:
    if not args.abort_on_flat_grpo:
        return False
    if args.calibrate_only:
        # Cookbook: inference cal is a rough sanity check — do not block on flat spread.
        if args.calibration_backend == "inference" and not args.gate_inference_cal:
            return False
        return True
    return args.gate_train and step == 0


async def run(args: argparse.Namespace) -> None:
    load_env()
    apply_profile(args)
    api_key = os.environ["FIREWORKS_API_KEY"]
    base_model = resolve_base_model(args.base_model)
    inference_model = resolve_inference_model(args.inference_model, base_model)
    output_dir = Path(args.output_dir)
    metrics_path = output_dir / "metrics.jsonl"
    plot_path = output_dir / "reward_loss.png"
    if metrics_path.exists() and not args.resume_metrics:
        metrics_path.unlink()

    tasks = load_golden_tasks(
        Path(args.golden),
        groups=args.groups_per_step,
        seed=args.seed,
        reward_mode=args.reward_mode,
    )
    print(
        f"[fw-rl] profile={args.profile} tasks={len(tasks)} reward={args.reward_mode} "
        f"backend={args.calibration_backend} base_model={base_model}",
        flush=True,
    )

    if args.calibrate_only and args.calibration_backend == "inference":
        client = AsyncOpenAI(api_key=api_key, base_url=args.inference_base_url)
        t0 = time.perf_counter()
        records = await sample_rollouts_inference(
            client,
            tasks,
            model=inference_model,
            rollouts_per_prompt=args.rollouts_per_prompt,
            max_tokens=args.max_tokens,
            temperature=args.temperature,
            top_p=args.top_p,
            parallelism=args.parallelism,
            json_mode=args.json_mode,
        )
        seen_tasks: set[int] = set()
        for record in records[: args.debug_samples]:
            tag = "" if record.task.group_index in seen_tasks else " (new task)"
            seen_tasks.add(record.task.group_index)
            print(
                f"[sample] {record.task.floor_id}#{record.task.seed} "
                f"reward={record.reward:.4f} text={record.text[:120]!r}{tag}",
                flush=True,
            )
        wg_std = within_group_reward_std(records)
        if should_gate(args, step=0):
            wg_std = check_grpo_gate(
                records,
                min_std=args.min_within_group_std,
                reward_mode=args.reward_mode,
                base_model=inference_model,
                phase="calibrate-inference",
            )
        row = {
            "phase": "calibrate",
            "backend": "inference",
            "profile": args.profile,
            "step": 0,
            "base_model": inference_model,
            "reward_mode": args.reward_mode,
            "num_rollouts": len(records),
            "rollout_seconds": time.perf_counter() - t0,
            "within_group_reward_std": wg_std,
            **reward_stats(records),
        }
        append_jsonl(metrics_path, row)
        maybe_plot(metrics_path, plot_path)
        print(json.dumps(row, sort_keys=True), flush=True)
        return

    tokenizer = AutoTokenizer.from_pretrained(args.tokenizer_model, trust_remote_code=True)
    controller = AdaptiveConcurrencyController(initial_window=args.parallelism)
    fw_kwargs: dict[str, Any] = dict(
        api_key=api_key,
        base_url=args.base_url,
        base_model=base_model,
        tokenizer_model=args.tokenizer_model,
        lora_rank=args.lora_rank,
        training_shape_id=args.training_shape,
        deployment_id=args.deployment_id,
        learning_rate=args.learning_rate,
        replica_count=args.replicas,
        cleanup_trainer_on_close=not args.keep_trainer,
        cleanup_deployment_on_close=None if args.keep_deployment else "scale_to_zero",
    )
    service = FiretitanServiceClient.from_firetitan_config(**fw_kwargs)

    try:
        training_client = None
        if not args.calibrate_only:
            training_client = service.create_training_client(
                base_model=base_model,
                lora_rank=args.lora_rank,
            )
        sampler = service.create_deployment_sampler(tokenizer=tokenizer, concurrency_controller=controller)

        for step in range(args.steps if not args.calibrate_only else 1):
            t0 = time.perf_counter()
            records = await sample_rollouts(
                sampler,
                tokenizer,
                tasks,
                rollouts_per_prompt=args.rollouts_per_prompt,
                max_tokens=args.max_tokens,
                temperature=args.temperature,
                top_p=args.top_p,
                enable_thinking=args.enable_thinking,
            )
            rollout_seconds = time.perf_counter() - t0
            stats = reward_stats(records)
            seen_tasks = set()
            for record in records[: args.debug_samples]:
                prompt_len = len(
                    format_prompt_tokens(tokenizer, record.task.prompt, enable_thinking=args.enable_thinking)
                )
                tag = "" if record.task.group_index in seen_tasks else " (new task)"
                seen_tasks.add(record.task.group_index)
                print(
                    f"[sample] {record.task.floor_id}#{record.task.seed} "
                    f"reward={record.reward:.4f} output_tokens={max(0, len(record.tokens) - prompt_len)} "
                    f"text={record.text[:120]!r}{tag}",
                    flush=True,
                )
            wg_std = within_group_reward_std(records)
            if should_gate(args, step=step):
                check_grpo_gate(
                    records,
                    min_std=args.min_within_group_std,
                    reward_mode=args.reward_mode,
                    base_model=base_model,
                    phase="calibrate" if args.calibrate_only else f"train-step-{step}-gate",
                )
            row: dict[str, Any] = {
                "phase": "calibrate" if args.calibrate_only else "train",
                "backend": "managed",
                "profile": args.profile,
                "step": step,
                "base_model": base_model,
                "training_shape": args.training_shape,
                "reward_mode": args.reward_mode,
                "num_rollouts": len(records),
                "rollout_seconds": rollout_seconds,
                "within_group_reward_std": wg_std,
                "trainer_job_id": getattr(service, "trainer_job_id", None),
                "deployment_id": getattr(service, "deployment_id", None),
                **stats,
            }
            if args.calibrate_only:
                append_jsonl(metrics_path, row)
                maybe_plot(metrics_path, plot_path)
                print(json.dumps(row, sort_keys=True), flush=True)
                continue

            assert training_client is not None
            datums = make_datums(records)
            advantages = advantages_by_record(records)
            loss_fn = make_grpo_loss(records, advantages)
            fb_future = await training_client.forward_backward_custom_async(datums, loss_fn)
            fb = await fb_future.result_async()
            optim_future = await training_client.optim_step_async(
                tinker.AdamParams(
                    learning_rate=args.learning_rate,
                    beta1=0.9,
                    beta2=0.999,
                    eps=1e-8,
                    weight_decay=args.weight_decay,
                ),
                grad_accumulation_normalization=GradAccNormalization.NUM_LOSS_TOKENS,
            )
            await optim_future.result_async()
            row.update(fb.metrics)
            saved_future = await training_client.save_weights_for_sampler_async(f"step-{step:05d}")
            saved = await saved_future.result_async()
            row["checkpoint"] = saved.path
            sampler = service.create_deployment_sampler(
                model_path=saved.path,
                tokenizer=tokenizer,
                concurrency_controller=controller,
            )
            append_jsonl(metrics_path, row)
            maybe_plot(metrics_path, plot_path)
            print(json.dumps(row, sort_keys=True), flush=True)
    finally:
        service.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--profile",
        choices=sorted(PROFILES),
        default=os.environ.get("FIREWORKS_RL_PROFILE", "8b"),
        help="8b (cookbook default, cheaper) or 27b (large floor prompts)",
    )
    parser.add_argument("--base-url", default=os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai"))
    parser.add_argument("--base-model", default=None, help="Override profile base; env FIREWORKS_RL_BASE_MODEL wins")
    parser.add_argument("--inference-model", default=None, help="Inference cal model (default: FIREWORKS_MODEL or base)")
    parser.add_argument("--tokenizer-model", default=None)
    parser.add_argument("--training-shape", default=None, help="Fireworks pins GPU via shape (8b-128k → B200 today)")
    parser.add_argument("--golden", default=str(DEFAULT_GOLDEN))
    parser.add_argument(
        "--reward-mode",
        default=os.environ.get("FIREWORKS_RL_REWARD_MODE", "format"),
        choices=["format", "shaped", "strict"],
    )
    parser.add_argument("--deployment-id", default=None)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--steps", type=int, default=5)
    parser.add_argument("--groups-per-step", type=int, default=6)
    parser.add_argument("--rollouts-per-prompt", type=int, default=6)
    parser.add_argument("--parallelism", type=int, default=None)
    parser.add_argument("--replicas", type=int, default=1)
    parser.add_argument("--lora-rank", type=int, default=0)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--temperature", type=float, default=1.0)
    parser.add_argument("--top-p", type=float, default=1.0)
    parser.add_argument("--max-tokens", type=int, default=None)
    parser.add_argument("--seed", type=int, default=9300)
    parser.add_argument("--debug-samples", type=int, default=4)
    parser.add_argument(
        "--enable-thinking",
        action="store_true",
        help="Keep Qwen reasoning block (off by default — tight budgets never reach JSON answer)",
    )
    parser.add_argument("--json-mode", action="store_true", default=True)
    parser.add_argument("--no-json-mode", action="store_false", dest="json_mode")
    parser.add_argument("--calibrate-only", action="store_true")
    parser.add_argument(
        "--calibration-backend",
        choices=("inference", "managed"),
        default="inference",
        help="inference=cheap serverless sanity; managed=samples actual training base",
    )
    parser.add_argument("--inference-base-url", default=DEFAULT_INFERENCE_BASE_URL)
    parser.add_argument("--min-within-group-std", type=float, default=0.001)
    parser.add_argument("--abort-on-flat-grpo", action="store_true", default=True)
    parser.add_argument("--no-abort-on-flat-grpo", action="store_false", dest="abort_on_flat_grpo")
    parser.add_argument(
        "--gate-inference-cal",
        action="store_true",
        help="Also abort inference sanity cal when spread is flat (off by default, per cookbook)",
    )
    parser.add_argument("--gate-train", action="store_true", default=True)
    parser.add_argument("--no-gate-train", action="store_false", dest="gate_train")
    parser.add_argument("--keep-trainer", action="store_true")
    parser.add_argument("--keep-deployment", action="store_true")
    parser.add_argument("--resume-metrics", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
