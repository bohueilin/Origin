"""Task-profile loading for live BranchRuns."""

from __future__ import annotations

import base64
import importlib.util
from pathlib import Path
from typing import Any

from .hacker_prompt import build_hacker_branch_instruction

REQUIRED_HUD_TASK_PROFILE_FIELDS = {
    "env_module_path",
    "task_factory",
    "prompt_factory",
    "runtime_workdir",
    "instruction_path",
    "trusted_entrypoint_ref",
    "pre_grader_command_argv",
    "grader_command_argv",
}


def hud_task_profile(forkpoint: dict[str, Any] | None = None) -> dict[str, Any]:
    raw = (forkpoint or {}).get("hud_task_profile")
    if not isinstance(raw, dict):
        raise ValueError(
            "forkpoint must include hud_task_profile for BranchRun execution"
        )
    missing = sorted(REQUIRED_HUD_TASK_PROFILE_FIELDS - set(raw))
    if missing:
        raise ValueError(f"hud_task_profile missing required fields: {missing}")
    profile = dict(raw)
    for key in ("pre_grader_command_argv", "grader_command_argv"):
        value = profile[key]
        if (
            not isinstance(value, list)
            or not value
            or not all(isinstance(item, str) for item in value)
        ):
            raise ValueError(f"hud_task_profile {key} must be a non-empty argv list")
    return profile


def load_hud_task(
    root: Path,
    forkpoint: dict[str, Any],
    *,
    feedback_attempts: list[dict[str, Any]] | None = None,
) -> tuple[Any, dict[str, Any]]:
    profile = hud_task_profile(forkpoint)
    env_path = root / str(profile["env_module_path"])
    spec = importlib.util.spec_from_file_location("chronos_hud_env", env_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load HUD env from {env_path}")
    env_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(env_module)
    prompt_factory = getattr(env_module, str(profile["prompt_factory"]))
    task_factory = getattr(env_module, str(profile["task_factory"]))
    prompt_packet = build_hacker_branch_instruction(
        prompt_factory(),
        feedback_attempts=feedback_attempts,
    )
    return task_factory(), prompt_packet


def runtime_command(
    prompt_packet: dict[str, Any], profile: dict[str, Any]
) -> tuple[str, str, str]:
    encoded = base64.b64encode(prompt_packet["instruction"].encode()).decode()
    instruction_path = str(profile["instruction_path"])
    entrypoint = str(profile["trusted_entrypoint_ref"])
    script = "\n".join(
        [
            "python3 - <<'PY'",
            "import base64",
            "from pathlib import Path",
            f"Path({instruction_path!r}).write_bytes(base64.b64decode('{encoded}'))",
            "PY",
            f"exec uv run hud serve {entrypoint} --host 0.0.0.0 --port 8765",
        ]
    )
    return ("bash", "-lc", script)
