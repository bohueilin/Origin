"""Canonical hud-trace-explorer Reward Hacking QA binding."""

from __future__ import annotations

import asyncio
import importlib
import inspect
import json
import subprocess
import sys
from pathlib import Path
from typing import Any

SOURCE_ADAPTER = "hud-trace-explorer.qa_reward_hacking"

_PROMPT_SCRIPT = r"""
import asyncio
import json
import os
import sys
from pathlib import Path

import httpx

root = Path(sys.argv[1])
trace_id = sys.argv[2]
hud_api_key = sys.argv[3]
sys.path.insert(0, str(root))

async def fetch_trace_v2(trace_id, api_key, data_sources):
    base = os.environ.get("HUD_API_URL", "https://api.beta.hud.ai").rstrip("/")
    headers = {"Authorization": f"Bearer {api_key}"}
    async with httpx.AsyncClient(timeout=180.0) as client:
        context_response = await client.get(f"{base}/v2/trace/{trace_id}/analysis-context", headers=headers)
        context_response.raise_for_status()
        context = context_response.json()
        events_response = await client.get(f"{base}/v2/trace/{trace_id}/events", headers=headers)
        events_response.raise_for_status()
        events = (events_response.json() or {}).get("events") or []

    def trim(value, limit=4000):
        text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)
        return text if len(text) <= limit else text[:limit] + f"\n... ({len(text)} total chars)"

    trajectory = []
    for event in events:
        kind = event.get("kind")
        if kind == "scenario_setup":
            trajectory.append({
                "name": "prompts/get.mcp",
                "attributes": {"request": {"params": {"arguments": {"prompt": event.get("result", {}).get("prompt", "")}}}},
            })
        elif kind == "agent_message":
            trajectory.append({
                "name": "inference.agent",
                "attributes": {
                    "result": {
                        "content": trim(event.get("text", ""), 2000),
                        "tool_calls": event.get("tool_calls") or [],
                    }
                },
            })
        elif kind == "tool_call":
            trajectory.append({
                "name": "tools/call.mcp",
                "attributes": {
                    "request": {
                        "params": {
                            "name": event.get("tool_name") or event.get("name") or "tool",
                            "arguments": event.get("arguments") or {},
                        }
                    },
                    "result": {"content": [{"type": "text", "text": trim(event.get("result_text", ""), 4000)}]},
                },
                "status_code": "ERROR" if event.get("error") else "OK",
            })
        elif kind == "scenario_evaluate":
            trajectory.append({
                "name": "resources/read.mcp",
                "attributes": {"result": {"contents": [{"text": json.dumps(event.get("result") or {})}]}},
            })

    return {
        "trace_id": context.get("trace_id") or trace_id,
        "job_id": context.get("job_id"),
        "task_id": context.get("task_id"),
        "task_version_id": context.get("task_version_id"),
        "status": context.get("status"),
        "reward": context.get("reward"),
        "error": context.get("error"),
        "scenario": context.get("scenario_name"),
        "scenario_args": context.get("scenario_args") or [],
        "scenario_code": context.get("scenario_code"),
        "registry_id": context.get("registry_id"),
        "prompt": context.get("prompt"),
        "metadata": {
            **(context.get("metadata") or {}),
            "evaluation_result": context.get("evaluation_result"),
        },
        "trajectory": trajectory,
        "trajectory_length": len(trajectory),
        "logs": context.get("env_logs") or [],
        "rollout_logs": context.get("worker_logs") or "",
        "trace_provider": "hud-v2-analysis-context",
    }

async def main():
    try:
        import qa_reward_hacking
        import qa_common
        qa_common.fetch_trace = fetch_trace_v2
        generator = qa_reward_hacking.reward_hacking_analysis(trace_id=trace_id, hud_api_key=hud_api_key)
        if not hasattr(generator, "__anext__"):
            print(json.dumps({
                "status": "blocked",
                "source_adapter": "hud-trace-explorer.qa_reward_hacking",
                "observed_behavior": "canonical reward_hacking_analysis did not return an async generator",
            }))
            return
        prompt = await generator.__anext__()
        print(json.dumps({
            "status": "pass",
            "source_adapter": "hud-trace-explorer.qa_reward_hacking",
            "module_file": str(getattr(qa_reward_hacking, "__file__", "")),
            "prompt": str(prompt),
            "execution_mode": "uv-project-subprocess-v2-trace-provider",
            "trace_provider": "hud-v2-analysis-context",
        }))
    except Exception as exc:
        print(json.dumps({
            "status": "blocked",
            "source_adapter": "hud-trace-explorer.qa_reward_hacking",
            "blocker": "canonical reward_hacking_analysis failed before prompt yield",
            "error_class": type(exc).__name__,
            "observed_behavior": str(exc),
        }))

asyncio.run(main())
"""


def load_canonical_reward_hacking_module(
    root: Path,
) -> tuple[Any | None, dict[str, Any]]:
    configured_root = __import__("os").environ.get("HUD_TRACE_EXPLORER_ROOT")
    candidate_roots: list[tuple[str, Path]] = []
    if configured_root:
        candidate_roots.append(("HUD_TRACE_EXPLORER_ROOT", Path(configured_root)))
    candidate_roots.append(("repo_external", root / ".external" / "hud-trace-explorer"))

    selected_root: Path | None = None
    searched_roots: list[str] = []
    for source, root_path in candidate_roots:
        searched_roots.append(f"{source}={root_path}")
        if (root_path / "qa_reward_hacking.py").exists():
            selected_root = root_path
            if str(root_path) not in sys.path:
                sys.path.insert(0, str(root_path))
            break
        if source == "HUD_TRACE_EXPLORER_ROOT":
            return None, {
                "status": "blocked",
                "source_adapter": SOURCE_ADAPTER,
                "blocker": f"HUD_TRACE_EXPLORER_ROOT does not exist: {configured_root}",
                "searched_roots": searched_roots,
            }
    if selected_root is None:
        return None, {
            "status": "blocked",
            "source_adapter": SOURCE_ADAPTER,
            "blocker": "canonical hud-evals/hud-trace-explorer checkout is missing qa_reward_hacking.py",
            "searched_roots": searched_roots,
        }
    try:
        module = importlib.import_module("qa_reward_hacking")
    except Exception as exc:  # noqa: BLE001 - import failures are binding evidence.
        return None, {
            "status": "blocked",
            "source_adapter": SOURCE_ADAPTER,
            "blocker": "canonical hud-evals/hud-trace-explorer qa_reward_hacking.py is not importable",
            "error_class": type(exc).__name__,
            "observed_behavior": str(exc),
            "canonical_root": str(selected_root) if selected_root else None,
            "searched_roots": searched_roots,
        }
    missing = [
        name
        for name in ("reward_hacking_analysis", "RewardHackingResult")
        if not hasattr(module, name)
    ]
    if missing:
        return None, {
            "status": "blocked",
            "source_adapter": SOURCE_ADAPTER,
            "blocker": f"canonical qa_reward_hacking module missing {missing}",
            "canonical_root": str(selected_root) if selected_root else None,
            "searched_roots": searched_roots,
        }
    return module, {
        "status": "pass",
        "source_adapter": SOURCE_ADAPTER,
        "module_file": str(getattr(module, "__file__", "")),
        "canonical_root": str(selected_root) if selected_root else None,
        "searched_roots": searched_roots,
    }


async def fetch_prompt_from_module(
    module: Any, *, trace_id: str, hud_api_key: str
) -> dict[str, Any]:
    generator = module.reward_hacking_analysis(
        trace_id=trace_id, hud_api_key=hud_api_key
    )
    if not inspect.isasyncgen(generator):
        return {
            "status": "blocked",
            "source_adapter": SOURCE_ADAPTER,
            "observed_behavior": "canonical reward_hacking_analysis did not return an async generator",
        }
    try:
        prompt = await generator.__anext__()
    except Exception as exc:  # noqa: BLE001 - canonical scenario failures are binding evidence.
        return {
            "status": "blocked",
            "source_adapter": SOURCE_ADAPTER,
            "error_class": type(exc).__name__,
            "observed_behavior": f"canonical reward_hacking_analysis failed before prompt yield: {exc}",
        }
    return {
        "status": "pass",
        "source_adapter": SOURCE_ADAPTER,
        "module_file": str(getattr(module, "__file__", "")),
        "prompt": str(prompt),
        "execution_mode": "in-process",
    }


def fetch_prompt_with_uv_project(
    root: Path, *, trace_id: str, hud_api_key: str
) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "uv",
            "run",
            "--project",
            str(root),
            "python",
            "-c",
            _PROMPT_SCRIPT,
            str(root),
            trace_id,
            hud_api_key,
        ],
        check=False,
        capture_output=True,
        text=True,
        timeout=180,
    )
    stdout = completed.stdout.strip()
    try:
        payload = json.loads(stdout.splitlines()[-1]) if stdout else {}
    except json.JSONDecodeError:
        payload = {}
    if completed.returncode != 0:
        return {
            "status": "blocked",
            "source_adapter": SOURCE_ADAPTER,
            "blocker": "canonical reward_hacking_analysis process failed",
            "error_class": "CanonicalQAProcessError",
            "observed_behavior": completed.stderr.strip() or stdout,
            "exit_code": completed.returncode,
        }
    if payload.get("status") != "pass":
        return {
            "status": "blocked",
            "source_adapter": SOURCE_ADAPTER,
            **payload,
        }
    return payload


def fetch_canonical_prompt(
    module: Any | None,
    binding: dict[str, Any],
    *,
    trace_id: str,
    hud_api_key: str,
) -> dict[str, Any]:
    canonical_root = binding.get("canonical_root")
    if canonical_root and (Path(canonical_root) / "pyproject.toml").exists():
        return fetch_prompt_with_uv_project(
            Path(canonical_root), trace_id=trace_id, hud_api_key=hud_api_key
        )
    if module is not None:
        return asyncio.run(
            fetch_prompt_from_module(module, trace_id=trace_id, hud_api_key=hud_api_key)
        )
    return binding
