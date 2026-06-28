"""HUD baseline evaluation for sealed legitimate controls."""

from __future__ import annotations

import asyncio
import hashlib
import importlib.util
import json
import subprocess
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from hud.agents.base import Agent
from hud.eval.runtime import DockerRuntime

from chronos.controls.freeze import load_controls
from chronos.controls.materialize import hud_env_path, repo_root, solution_path
from chronos.controls.models import BaselineRun, PATH_LABELS

ENV_IMAGE = "chronos/mongodb-sales-aggregation-engine-v1"
ENV_DIR = repo_root() / "envs" / "mongodb-sales-aggregation-engine"


@dataclass(frozen=True)
class BaselineResult:
    run_id: str
    reward: float
    trace_ref: str
    environment_version: str
    task_checksum: str


class GradeOnlyAgent(Agent):
    """Agent that skips LLM work; the control solution is pre-mounted in /app."""

    async def __call__(self, run) -> None:  # noqa: ANN001
        return


def _load_hud_env_module():
    spec = importlib.util.spec_from_file_location("mongodb_hud_env", hud_env_path())
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load HUD env from {hud_env_path()}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _environment_version() -> str:
    config_path = ENV_DIR / ".hud" / "config.json"
    data = json.loads(config_path.read_text(encoding="utf-8"))
    registry_id = data.get("registryId")
    if not registry_id:
        raise ValueError(f"{config_path}: missing registryId")
    return str(registry_id)


def _task_checksum() -> str:
    digest = hashlib.sha256()
    for path in sorted(ENV_DIR.rglob("*")):
        if path.is_file() and ".hud" not in path.parts:
            digest.update(str(path.relative_to(ENV_DIR)).encode())
            digest.update(path.read_bytes())
    return digest.hexdigest()


def ensure_env_image() -> str:
    inspect = subprocess.run(
        ["docker", "image", "inspect", ENV_IMAGE],
        capture_output=True,
        text=True,
        check=False,
    )
    if inspect.returncode == 0:
        return ENV_IMAGE
    build = subprocess.run(
        [
            "docker",
            "build",
            "-f",
            str(ENV_DIR / "Dockerfile.hud"),
            "-t",
            ENV_IMAGE,
            str(ENV_DIR),
        ],
        check=False,
    )
    if build.returncode != 0:
        raise RuntimeError("failed to build HUD environment image")
    return ENV_IMAGE


def _docker_runtime(solution: Path) -> DockerRuntime:
    ensure_env_image()
    return DockerRuntime(
        image=ENV_IMAGE,
        run_args=["-v", f"{solution.resolve()}:/app/query.py:ro"],
    )


def _extract_trace_ref(job: Any) -> str:
    runs = getattr(job, "runs", None) or []
    if runs:
        trace_id = getattr(runs[0], "trace_id", None)
        if trace_id:
            return str(trace_id)
    for attr in ("id", "trace_id"):
        value = getattr(job, attr, None)
        if value:
            return str(value)
    raise ValueError("Could not read trace reference from HUD job")


async def _run_single_baseline(path_label: str, run_index: int) -> BaselineResult:
    env_module = _load_hud_env_module()
    solution = solution_path(path_label)
    task = env_module.implement_sales_analyzer()
    job = await task.run(GradeOnlyAgent(), runtime=_docker_runtime(solution))
    reward = getattr(job, "reward", None)
    if reward is None:
        raise ValueError(
            f"{path_label} baseline run {run_index} did not return a reward"
        )
    reward = float(reward)
    if reward != 1.0:
        raise RuntimeError(
            f"{path_label} baseline run {run_index} reward={reward}, expected 1.0"
        )
    return BaselineResult(
        run_id=str(getattr(job, "id", uuid.uuid4())),
        reward=reward,
        trace_ref=_extract_trace_ref(job),
        environment_version=_environment_version(),
        task_checksum=_task_checksum(),
    )


async def run_control_baselines(
    runs_per_control: int = 3,
) -> dict[str, list[BaselineRun]]:
    baseline_by_control: dict[str, list[BaselineRun]] = {}
    controls = load_controls()
    for control in controls:
        label = control.solution_path_label
        if label not in PATH_LABELS:
            raise ValueError(f"unknown control path label: {label}")
        runs: list[BaselineRun] = []
        for index in range(runs_per_control):
            result = await _run_single_baseline(label, index)
            runs.append(
                BaselineRun(
                    run_id=result.run_id,
                    reward=result.reward,
                    trace_ref=result.trace_ref,
                    environment_version=result.environment_version,
                    task_checksum=result.task_checksum,
                )
            )
        baseline_by_control[control.control_id] = runs
    return baseline_by_control


async def run_corrupt_negative(path_label: str = "path-a") -> float:
    env_module = _load_hud_env_module()
    corrupt = (
        "class SalesAnalyzer:\n"
        "    def __init__(self, db_url: str, db_name: str):\n"
        "        pass\n"
        "    def get_top_performing_products(self, start_date, end_date, limit=3):\n"
        "        return {}\n"
    )
    corrupt_path = (
        repo_root() / "artifacts" / "chronos" / "controls" / "corrupt_query.py"
    )
    corrupt_path.parent.mkdir(parents=True, exist_ok=True)
    corrupt_path.write_text(corrupt, encoding="utf-8")
    task = env_module.implement_sales_analyzer()
    job = await task.run(GradeOnlyAgent(), runtime=_docker_runtime(corrupt_path))
    reward = getattr(job, "reward", None)
    if reward is None:
        raise ValueError("corrupt-control run did not return a reward")
    return float(reward)


def write_baseline_artifact(payload: dict[str, Any], path: Path | None = None) -> Path:
    target = path or (
        repo_root() / "artifacts" / "chronos" / "controls" / "baseline_runs.json"
    )
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return target


def run_baselines_sync(runs_per_control: int = 3) -> dict[str, list[BaselineRun]]:
    return asyncio.run(run_control_baselines(runs_per_control=runs_per_control))


def run_corrupt_negative_sync(path_label: str = "path-a") -> float:
    return asyncio.run(run_corrupt_negative(path_label=path_label))
