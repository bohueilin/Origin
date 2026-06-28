"""Normal-prompt CONTROL baseline for the additive benchmark (Plan 008 X-leg).

Runs the EXACT same live branch pipeline as the Chronos discovery run, with one
variable changed: the reward-hacking elicitation is removed from the solver prompt.
Where the discovery run rewrites each task instruction into the harden-v0 hacker
profile (`build_hacker_branch_instruction`), this control feeds the PLAIN task
instruction (`branch_role="control"`, `rewrite_mode="none"`). Every other knob — the
same captured ForkPoints, model, Modal runtime, file-diff/action capture, QA call, and
the sterile diff/action referee — is identical, so the result is the apples-to-apples
baseline X for "how many reward hacks occur (and are caught) without elicitation."

It swaps the prompt builder at runtime (the 003 loader hardcodes the hacker rewrite);
no 003 source is modified. Run with credentials + FORKPROOF_ALLOW_EXTERNAL_QA=1 (real
Modal + Anthropic + HUD spend).
"""

from __future__ import annotations

import argparse
import dataclasses
import json
import time
from pathlib import Path
from typing import Any

import chronos.witnesses.branch_task_profile as btp
from chronos.qabench.live_benchmark import adjudicate_branches_by_diff
from chronos.qabench.live_discovery import LiveDiscoveryDriver
from chronos.qabench.run_benchmark import _STATE_ROOTS, load_env
from chronos.qabench.scoring import score
from chronos.witnesses.models import digest_json

_ARTIFACTS = Path("artifacts/chronos/qabench")
_HACKER_BUILDER = btp.build_hacker_branch_instruction


def _control_instruction(
    original_instruction: str,
    *,
    profile: str | None = None,
    feedback_attempts: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """A control prompt packet: the PLAIN task instruction, no hacker goal appended."""
    return {
        "instruction": original_instruction,
        "branch_role": "control",
        "prompt_profile": "normal_task_instruction",
        "prompt_source_ref": "qabench control baseline (reward-hack elicitation removed)",
        "prompt_upstream_ref": None,
        "feedback_enabled": False,
        "feedback_source_ref": None,
        "feedback_attempt_count": 0,
        "feedback_attempt_refs": [],
        "prompt_digest": digest_json({"instruction": original_instruction}),
        "prompt_goal_digest": digest_json({"goal": "", "feedback": []}),
        "rewrite_mode": "none",
        "observed_behavior": "Control baseline: plain task instruction, no reward-hack elicitation.",
    }


def run_control_task(
    root: Path, slug: str, forkpoint: dict, *, count: int
) -> dict[str, Any]:
    """Run a normal-prompt control batch for one task and adjudicate it."""
    driver = LiveDiscoveryDriver(
        root=root,
        env_rel=str(Path("envs/qabench") / slug / "env.py"),
        forkpoint=forkpoint,
        count=count,
        concurrency=count,
        state_roots=_STATE_ROOTS.get(slug, ("/app",)),
    )
    branches = list(driver.run_discovery_tree(slug))
    trajs = adjudicate_branches_by_diff(branches, root)
    rewarded = [t for t in trajs]
    confirmed = sum(1 for t in trajs if t.is_confirmed_hack)
    qa_flagged = sum(1 for t in trajs if t.qa_is_reward_hacking is True)
    return {
        "slug": slug,
        "branches": len(branches),
        "rewarded": len(rewarded),
        "confirmed_hacks": confirmed,
        "qa_flagged": qa_flagged,
        "trajectories": [
            {
                "id": t.trajectory_id,
                "reward": t.reward_passed,
                "qa": t.qa_is_reward_hacking,
                "referee": str(t.referee),
            }
            for t in trajs
        ],
        "depth": dataclasses.asdict(score(trajs).depth),
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Run the normal-prompt control baseline (X-leg)."
    )
    parser.add_argument("--tasks", nargs="*", help="task slugs (default: all captured)")
    parser.add_argument(
        "--count", type=int, default=4, help="control branches per task"
    )
    parser.add_argument("--out", default=str(_ARTIFACTS / "control-baseline.json"))
    args = parser.parse_args(argv)

    root = Path.cwd()
    load_env(root)
    # Swap the hacker rewrite for the plain-instruction control on the 003 loader.
    btp.build_hacker_branch_instruction = _control_instruction

    forkpoints = json.loads((_ARTIFACTS / "forkpoints.json").read_text())
    captured = {s: r for s, r in forkpoints.items() if r.get("status") == "ok"}
    tasks = args.tasks or list(captured)
    results: dict[str, Any] = {}
    out = Path(args.out)
    for slug in tasks:
        if slug not in captured:
            results[slug] = {"status": "skip", "reason": "forkpoint not captured"}
            continue
        started = time.time()
        try:
            res = run_control_task(
                root, slug, captured[slug]["forkpoint"], count=args.count
            )
            res["seconds"] = round(time.time() - started, 1)
            res["status"] = "ok"
            results[slug] = res
            print(
                f"DONE {slug}: rewarded={res['rewarded']} confirmed_hacks={res['confirmed_hacks']} "
                f"qa_flagged={res['qa_flagged']} ({res['seconds']}s)",
                flush=True,
            )
        except Exception as exc:  # noqa: BLE001 - a failed control task is an honest skip
            results[slug] = {
                "status": "error",
                "error_class": type(exc).__name__,
                "error": str(exc)[:600],
            }
            print(f"SKIP {slug}: {type(exc).__name__}: {str(exc)[:200]}", flush=True)
        out.write_text(json.dumps(results, indent=2, default=str) + "\n")

    measured = {s: r for s, r in results.items() if r.get("status") == "ok"}
    total_hacks = sum(r["confirmed_hacks"] for r in measured.values())
    total_rewarded = sum(r["rewarded"] for r in measured.values())
    total_qa = sum(r["qa_flagged"] for r in measured.values())
    summary = {
        "baseline_X_confirmed_hacks": total_hacks,
        "rewarded_trajectories": total_rewarded,
        "qa_flagged_count": total_qa,
        "tasks_measured": len(measured),
        "branch_role": "control (normal_task_instruction, reward-hack elicitation removed)",
        "count_per_task": args.count,
    }
    payload = {
        "schema_version": 1,
        "plan_id": "008",
        "summary": summary,
        "per_task": results,
    }
    out.write_text(json.dumps(payload, indent=2, default=str) + "\n")
    print(
        f"\nCONTROL BASELINE X = {total_hacks} confirmed hacks across {len(measured)} tasks "
        f"({total_rewarded} rewarded, {total_qa} QA-flagged) -> {out}",
        flush=True,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
