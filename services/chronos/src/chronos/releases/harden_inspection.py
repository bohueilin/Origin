"""Inspection helpers for harden-v0 output artifacts."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Any

from .models import digest_json


def inspect_fixer_artifact_layouts(
    harden_output: Path, task_id: str
) -> list[dict[str, Any]]:
    """Inspect harden-v0 fixer artifact repos without treating them as release proof."""

    jobs_root = harden_output / task_id / "jobs"
    if not jobs_root.is_dir():
        return []
    layouts: list[dict[str, Any]] = []
    for job_dir in sorted(p for p in jobs_root.glob("fixer_*") if p.is_dir()):
        for trial_dir in sorted(p for p in job_dir.iterdir() if p.is_dir()):
            expected = trial_dir / "artifacts"
            nested = expected / "logs" / "artifacts"
            expected_repo = _git_repo_status(expected)
            nested_repo = _git_repo_status(nested)
            layout_status = "missing"
            changed_files: list[str] = []
            patch_digest = None
            if expected_repo["is_git_repo"]:
                layout_status = "expected"
                changed_files = _git_changed_files(expected)
                patch_digest = _git_patch_digest(expected)
            elif nested_repo["is_git_repo"]:
                layout_status = "nested_logs_artifacts"
                changed_files = _git_changed_files(nested)
                patch_digest = _git_patch_digest(nested)
            layouts.append(
                {
                    "schema_version": 1,
                    "job_dir": str(job_dir),
                    "trial_dir": str(trial_dir),
                    "expected_artifacts_path": str(expected),
                    "expected_artifacts_git": expected_repo,
                    "nested_logs_artifacts_path": str(nested),
                    "nested_logs_artifacts_git": nested_repo,
                    "layout_status": layout_status,
                    "changed_files": changed_files,
                    "patch_digest": patch_digest,
                }
            )
    return layouts


def inspect_solver_validation_results(
    harden_output: Path, task_id: str
) -> list[dict[str, Any]]:
    """Read compact solver-validation outcomes from harden-v0 Harbor trials."""

    jobs_root = harden_output / task_id / "jobs"
    if not jobs_root.is_dir():
        return []
    results: list[dict[str, Any]] = []
    for trial_result_path in sorted(jobs_root.glob("solver_validate_*/*/result.json")):
        try:
            trial_result = json.loads(trial_result_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        rewards = (trial_result.get("verifier_result") or {}).get("rewards") or {}
        results.append(
            {
                "schema_version": 1,
                "trial_result_ref": str(trial_result_path),
                "trial_dir": str(trial_result_path.parent),
                "job_dir": str(trial_result_path.parent.parent),
                "reward": rewards.get("reward"),
                "task_checksum": trial_result.get("task_checksum"),
                "started_at": trial_result.get("started_at"),
                "finished_at": trial_result.get("finished_at"),
                "exception_info": trial_result.get("exception_info"),
            }
        )
    return results


def inspect_hacker_refusal_loops(
    harden_output: Path,
    task_id: str,
    *,
    min_declines: int = 3,
) -> list[dict[str, Any]]:
    """Detect generic repeated refusal loops in harden-v0 hacker trajectories."""

    jobs_root = harden_output / task_id / "jobs"
    if not jobs_root.is_dir():
        return []
    loops: list[dict[str, Any]] = []
    for trajectory_path in sorted(jobs_root.glob("hacker_*/*/agent/trajectory.json")):
        try:
            trajectory = json.loads(trajectory_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        steps = trajectory.get("steps")
        if not isinstance(steps, list):
            continue
        decline_steps = [
            step
            for step in steps
            if isinstance(step, dict) and _looks_like_refusal(step.get("message"))
        ]
        if len(decline_steps) < min_declines:
            continue
        last_step = decline_steps[-1]
        loops.append(
            {
                "schema_version": 1,
                "trajectory_ref": str(trajectory_path),
                "trial_dir": str(trajectory_path.parents[1]),
                "job_dir": str(trajectory_path.parents[2]),
                "step_count": len(steps),
                "decline_step_count": len(decline_steps),
                "last_decline_step_id": last_step.get("step_id"),
                "last_decline_timestamp": last_step.get("timestamp"),
                "last_model_name": last_step.get("model_name"),
                "last_message_excerpt": _message_excerpt(last_step.get("message")),
                "final_metrics": trajectory.get("final_metrics"),
            }
        )
    return loops


def _git_repo_status(path: Path) -> dict[str, Any]:
    if not (path / ".git").exists():
        return {"is_git_repo": False, "has_initial_ref": False}
    return {
        "is_git_repo": True,
        "has_initial_ref": _git_has_ref(path, "initial"),
    }


def _git_has_ref(repo: Path, ref: str) -> bool:
    result = subprocess.run(
        ["git", "-C", str(repo), "rev-parse", "--verify", "--quiet", ref],
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode == 0


def _git_changed_files(repo: Path) -> list[str]:
    if not _git_has_ref(repo, "initial"):
        return []
    result = subprocess.run(
        ["git", "-C", str(repo), "diff", "--name-only", "initial", "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return []
    return sorted(line for line in result.stdout.splitlines() if line)


def _git_patch_digest(repo: Path) -> str | None:
    if not _git_has_ref(repo, "initial"):
        return None
    result = subprocess.run(
        ["git", "-C", str(repo), "diff", "--binary", "initial", "HEAD"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0 or not result.stdout:
        return None
    return digest_json({"patch": result.stdout})


def _looks_like_refusal(message: Any) -> bool:
    if not isinstance(message, str):
        return False
    lowered = message.lower()
    refusal_markers = (
        "analysis: declined",
        "plan: cannot proceed",
        "i will not continue",
        "i refuse",
        "will not help",
        "cannot assist",
    )
    return any(marker in lowered for marker in refusal_markers)


def _message_excerpt(message: Any, *, limit: int = 240) -> str | None:
    if not isinstance(message, str):
        return None
    compact = " ".join(message.split())
    if len(compact) <= limit:
        return compact
    return compact[: limit - 3] + "..."
