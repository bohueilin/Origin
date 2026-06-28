"""HUD TrainingClient smoke for ShiftBench open students.

This is the missing cookbook-style loop:

  trainable gateway model -> floor taskset rollout -> TrainingClient.step()
  -> promoted weights behind the same model string -> re-eval.

It intentionally trains only a HUD gateway model supplied by --model or
HUD_TRAIN_MODEL. Use Gemma/Qwen-style trainable models from `hud models list`.
The default is dry-run unless a model is supplied, so we do not accidentally train
Claude/fallback baselines.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=import-error,no-name-in-module,wrong-import-position
from dotenv import load_dotenv  # noqa: E402
from hud import LocalRuntime, TrainingClient  # noqa: E402
from hud.agents import create_agent  # noqa: E402
from hud.agents.types import AgentStep  # noqa: E402
from hud.eval import Job, Taskset  # noqa: E402

from distill.hud_app import operate, operate_floor  # noqa: E402
from distill.hud_rollout_util import run_taskset_with_retry  # noqa: E402
from src.floor_prompt import JSON_SYSTEM_PROMPT  # noqa: E402
from src.library import ARCHETYPES  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
APP = ROOT / "distill" / "hud_app.py"
OUT = ROOT / "results" / "hud_train_open_student.json"


def _output_tokens(runs: list) -> int:
    total = 0
    for run in runs:
        trace = getattr(run, "trace", None)
        if not trace:
            continue
        for sample in trace.collect(lambda s: s.sample if isinstance(s, AgentStep) and s.sample else None):
            total += len(sample.output_token_ids or [])
    return total


def _mean_reward(runs: list) -> float:
    return sum(float(getattr(r, "reward", 0.0) or 0.0) for r in runs) / max(1, len(runs))


def _sample_texts(runs: list, limit: int = 3) -> list[dict]:
    out = []
    for run in runs[:limit]:
        text = ""
        trace = getattr(run, "trace", None)
        if trace:
            for step in trace.collect(lambda s: s if isinstance(s, AgentStep) else None):
                content = getattr(step, "content", "")
                if content:
                    text = str(content)
        out.append({
            "reward": float(getattr(run, "reward", 0.0) or 0.0),
            "has_json": "{" in text and "}" in text,
            "chars": len(text),
            "snippet": text[:500],
        })
    return out


def _floor_ids(max_floors: int, requested: list[str]) -> list[str]:
    known = [a["id"] for a in ARCHETYPES]
    if requested:
        return [fid for fid in requested if fid in known]
    return known[:max(1, max_floors)]


def _reward_std(runs: list) -> float:
    import statistics
    vals = [float(getattr(r, "reward", 0.0) or 0.0) for r in runs]
    return statistics.pstdev(vals) if len(vals) > 1 else 0.0


def _load_golden(path: str) -> list[dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    return data.get("tasks", [])


def _load_teacher_demos(path: str | None) -> dict[tuple[str, int], str]:
    if not path:
        return {}
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rows = data.get("demos", data if isinstance(data, list) else [])
    demos: dict[tuple[str, int], str] = {}
    for row in rows:
        try:
            floor_id = str(row["floor_id"])
            seed = int(row["seed"])
            answer = str(row.get("answer") or row.get("teacher_answer") or "")
        except Exception:
            continue
        if answer:
            demos[(floor_id, seed)] = answer
    return demos


def _sample_golden(golden: list[dict], n: int, seed: int) -> list[dict]:
    """Stratified, deterministic sample: round-robin across floors by descending
    golden_score, so each step trains on a balanced slice of the hardest tasks."""
    import random
    by_floor: dict[str, list[dict]] = {}
    for t in golden:
        by_floor.setdefault(t["floor_id"], []).append(t)
    for fid in by_floor:
        by_floor[fid].sort(key=lambda x: x.get("golden_score", 0), reverse=True)
    rng = random.Random(seed)
    floors = sorted(by_floor)
    rng.shuffle(floors)
    out: list[dict] = []
    idx = 0
    while len(out) < min(n, len(golden)):
        progressed = False
        for fid in floors:
            if idx < len(by_floor[fid]):
                out.append(by_floor[fid][idx])
                progressed = True
                if len(out) >= min(n, len(golden)):
                    break
        if not progressed:
            break
        idx += 1
    return out


def _build_taskset(args: argparse.Namespace, reward_mode: str, floors: list[str]) -> Taskset:
    """Build a taskset whose reward mode is baked into each task.

    The HUD reward is decided inside the template, so a curriculum phase needs its
    own taskset with the phase's reward_mode."""
    teacher_demos = _load_teacher_demos(getattr(args, "teacher_demos", None))
    if getattr(args, "golden_tasks", None):
        golden = _load_golden(args.golden_tasks)
        sample = _sample_golden(golden, args.golden_sample, args.seed)
        tasks = [
            operate_floor(
                floor_id=t["floor_id"], seed=int(t["seed"]), reward_mode=reward_mode,
                teacher_answer=teacher_demos.get((t["floor_id"], int(t["seed"])), ""),
            )
            for t in sample
        ]
        return Taskset(f"shiftbench-golden-{reward_mode}", tasks)
    if args.generic_env:
        tasks = [
            operate(
                seed=args.seed + i,
                horizon_days=args.horizon_days,
                n_jobs=args.curriculum_jobs,
                reward_mode=reward_mode,
            )
            for i in range(max(1, args.max_floors))
        ]
        return Taskset(f"shiftbench-generic-{reward_mode}", tasks)
    tasks = [
        operate_floor(
            floor_id=fid, seed=args.seed + i, reward_mode=reward_mode,
            teacher_answer=teacher_demos.get((fid, args.seed + i), ""),
        )
        for i, fid in enumerate(floors)
    ]
    return Taskset(f"shiftbench-floor-{reward_mode}", tasks)


async def _rollout(taskset: Taskset, runtime: LocalRuntime, agent, *, group: int,
                   max_concurrent: int, name: str):
    job = await Job.start(name, group=group)
    job_id = getattr(job, "id", None)
    if job_id:
        print(f"[hud] job {name}: https://hud.ai/jobs/{job_id}", flush=True)
    await run_taskset_with_retry(
        taskset, agent, runtime=runtime, group=group, job=job,
        max_concurrent=max_concurrent, label=name,
    )
    return job.runs


async def _train_phase(args, runtime, agent, trainer, reward_mode: str, floors: list[str],
                       n_steps: int, max_concurrent: int) -> dict:
    """Run n_steps of rollout+GRPO for one curriculum phase; return diagnostics."""
    taskset = _build_taskset(args, reward_mode, floors)
    baseline_runs = await _rollout(
        taskset, runtime, agent, group=args.group, max_concurrent=max_concurrent,
        name=f"shiftbench-{reward_mode}-baseline",
    )
    baseline_reward = _mean_reward(baseline_runs)
    step_rows = []
    session = await Job.start(f"shiftbench-{reward_mode}-rl", group=args.group)
    session_id = getattr(session, "id", None)
    if session_id:
        print(f"[hud] job shiftbench-{reward_mode}-rl: https://hud.ai/jobs/{session_id}", flush=True)
    for step in range(n_steps):
        start = len(session.runs)
        rs = time.perf_counter()
        await run_taskset_with_retry(
            taskset, agent, runtime=runtime, group=args.group, job=session,
            max_concurrent=max_concurrent, label=f"{reward_mode}-step-{step}",
        )
        batch = session.runs[start:]
        rollout_s = time.perf_counter() - rs
        std = _reward_std(batch)
        skipped = std < 1e-6
        loss = None
        optim_step = None
        train_s = 0.0
        if skipped:
            # GRPO advantages are all ~0 with no reward variance, so an optim step
            # is a no-op that still burns gateway budget. Skip and surface it.
            print(f"[{reward_mode}] step {step} skipped optim: no reward variance "
                  f"(reward={_mean_reward(batch):.4f})", flush=True)
        else:
            train_s0 = time.perf_counter()
            # HUD rl-training cookbook: forward_backward then optim_step on the batch.
            fb = await trainer.forward_backward(
                batch, loss_fn=args.loss_fn, group_size=args.group,
                reward_scale=args.reward_scale,
            )
            opt = await trainer.optim_step(learning_rate=args.learning_rate)
            train_s = time.perf_counter() - train_s0
            loss = getattr(fb, "metrics", {}).get("loss:sum")
            optim_step = getattr(opt, "step", None)
        step_rows.append({
            "phase": reward_mode,
            "step": step,
            "reward": round(_mean_reward(batch), 4),
            "reward_std": round(std, 4),
            "rewards": [float(getattr(r, "reward", 0.0) or 0.0) for r in batch],
            "runs": len(batch),
            "tokens": _output_tokens(batch),
            "rollout_s": round(rollout_s, 3),
            "train_s": round(train_s, 3),
            "loss": loss,
            "optim_step": optim_step,
            "skipped_optim": skipped,
        })
        print(
            f"[{reward_mode}] step {step} reward={step_rows[-1]['reward']} "
            f"std={step_rows[-1]['reward_std']} runs={len(batch)} optim={optim_step}",
            flush=True,
        )
    final_runs = await _rollout(
        taskset, runtime, agent, group=args.group, max_concurrent=max_concurrent,
        name=f"shiftbench-{reward_mode}-final",
    )
    final_reward = _mean_reward(final_runs)
    return {
        "phase": reward_mode,
        "baseline_reward": round(baseline_reward, 4),
        "final_reward": round(final_reward, 4),
        "lift": round(final_reward - baseline_reward, 4),
        "steps": step_rows,
        "baseline_samples": _sample_texts(baseline_runs),
        "final_samples": _sample_texts(final_runs),
    }


def _phase_plan(args: argparse.Namespace) -> list[tuple[str, int]]:
    """Resolve (reward_mode, n_steps) phases for the run.

    With --curriculum the model first climbs format adherence (emit valid
    ActionPlan JSON), then shaped scheduling, then optionally strict verifier
    reward. Without it, a single phase uses --reward-mode for --steps."""
    if not args.curriculum:
        return [(args.reward_mode, args.steps)]
    phases = [p.strip() for p in args.phases.split(",") if p.strip()]
    return [(p, args.phase_steps) for p in phases]


async def main(args: argparse.Namespace) -> dict:
    load_dotenv(ROOT / ".env")
    model = args.model or os.environ.get("HUD_TRAIN_MODEL")
    floors = _floor_ids(args.max_floors, args.floor_id)
    runtime = LocalRuntime(APP, env="factoryceo-trm")
    phases = _phase_plan(args)
    summary: dict = {
        "kind": "hud_trainingclient_open_student",
        "model": model,
        "floors": floors,
        "generic_env": args.generic_env,
        "curriculum": args.curriculum,
        "phases": [{"mode": m, "steps": s} for m, s in phases],
        "group": args.group,
        "learning_rate": args.learning_rate,
        "loss_fn": args.loss_fn,
        "curriculum_jobs": args.curriculum_jobs,
        "teacher_demos": args.teacher_demos,
        "dry_run": args.dry_run or not model,
    }

    if not model:
        summary["ok"] = False
        summary["error"] = "Set --model or HUD_TRAIN_MODEL to a trainable HUD gateway model from `hud models list`."
        return summary
    if args.dry_run:
        summary["ok"] = True
        summary["note"] = "Dry run only: phases planned, no rollouts or training submitted."
        return summary

    extra_body: dict = {"return_token_ids": True}
    if args.no_think:
        # Qwen "thinking" models burn the whole token budget on a reasoning
        # preamble and get truncated before the JSON; disable it at the template.
        extra_body["chat_template_kwargs"] = {"enable_thinking": False}
    completion_kwargs = {
        "max_tokens": args.max_tokens,
        "extra_body": extra_body,
    }
    if args.json_mode:
        completion_kwargs["response_format"] = {"type": "json_object"}
    agent_kwargs = {"completion_kwargs": completion_kwargs}
    if args.system_prompt:
        agent_kwargs["system_prompt"] = args.system_prompt
    agent = create_agent(model, **agent_kwargs)
    trainer = TrainingClient(model)

    t0 = time.perf_counter()
    phase_results = []
    for reward_mode, n_steps in phases:
        print(f"=== phase {reward_mode}: {n_steps} step(s) ===", flush=True)
        phase_results.append(await _train_phase(
            args, runtime, agent, trainer, reward_mode, floors,
            n_steps=n_steps, max_concurrent=args.max_concurrent,
        ))

    # Lift is only comparable within one reward mode (format/shaped/strict use
    # different scales), so the headline measures the last phase in its own mode and
    # per-phase lifts are reported separately. A cross-mode first->last delta would
    # be meaningless.
    last = phase_results[-1]
    modes = [m for m, _ in phases]
    same_mode = len(set(modes)) == 1
    headline_baseline = phase_results[0]["baseline_reward"] if same_mode else last["baseline_reward"]
    summary.update({
        "ok": True,
        "reward_mode_compared": last["phase"],
        "baseline_reward": headline_baseline,
        "final_reward": last["final_reward"],
        "lift": round(last["final_reward"] - headline_baseline, 4),
        "lift_pct": round(((last["final_reward"] / headline_baseline) - 1) * 100, 2)
        if headline_baseline else None,
        "phase_lifts": {ph["phase"]: ph["lift"] for ph in phase_results},
        "phase_results": phase_results,
        "elapsed_s": round(time.perf_counter() - t0, 3),
        "note": (
            "Lift is within the last reward mode; per-phase lifts in phase_lifts. "
            "TrainingClient promoted a checkpoint whenever a step had reward variance."
        ),
    })
    return summary


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", default=None, help="Trainable HUD gateway model, e.g. Gemma/Qwen from `hud models list`.")
    parser.add_argument("--steps", type=int, default=1)
    parser.add_argument("--group", type=int, default=4, help="GRPO group size; >=4 gives usable reward variance.")
    parser.add_argument("--max-floors", type=int, default=2)
    parser.add_argument("--floor-id", action="append", default=[])
    parser.add_argument("--generic-env", action="store_true", help="Use the known-good generic operate template for TrainingClient smoke.")
    parser.add_argument("--horizon-days", type=int, default=14)
    parser.add_argument("--curriculum-jobs", type=int, default=4)
    parser.add_argument("--reward-mode", default="shaped", choices=["format", "shaped", "strict"])
    parser.add_argument("--golden-tasks", default=None,
                        help="Path to a curated golden-hard taskset (results/golden_hard_tasks.json). "
                             "When set, each phase trains on a stratified sample of these hard tasks "
                             "instead of one task per floor.")
    parser.add_argument("--teacher-demos", default=None,
                        help="Optional JSON file of Claude teacher trajectories keyed by floor_id/seed.")
    parser.add_argument("--golden-sample", type=int, default=4,
                        help="Golden tasks sampled per taskset build (keeps rollouts/step bounded).")
    parser.add_argument("--curriculum", action="store_true", help="Run a format -> shaped -> strict reward curriculum.")
    parser.add_argument("--phases", default="format,shaped", help="Comma list of reward modes when --curriculum is set.")
    parser.add_argument("--phase-steps", type=int, default=2, help="GRPO steps per curriculum phase.")
    parser.add_argument("--seed", type=int, default=9000)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--loss-fn", default="importance_sampling")
    parser.add_argument("--reward-scale", type=float, default=1.0)
    parser.add_argument("--max-concurrent", type=int, default=1,
                        help="Concurrent rollouts (1 avoids 504 bursts on 27B golden tasks).")
    parser.add_argument("--max-tokens", type=int, default=8000,
                        help="Output cap; must fit reasoning + the JSON plan or rollouts truncate before the answer.")
    parser.add_argument("--json-mode", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("--no-think", action=argparse.BooleanOptionalAction, default=True,
                        help="Disable the model's reasoning preamble (Qwen enable_thinking=False) so it emits JSON directly.")
    parser.add_argument(
        "--system-prompt",
        default=JSON_SYSTEM_PROMPT,
        help="System message prepended to every rollout; set empty to disable.",
    )
    parser.add_argument("--out", default=str(OUT))
    parser.add_argument("--dry-run", action="store_true")
    ns = parser.parse_args()
    result = asyncio.run(main(ns))
    out = Path(ns.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if result.get("ok") else 2)
