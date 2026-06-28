"""Run real HUD rollouts against the FactoryCEO-TRM environment.

Needs HUD_API_KEY and the Python 3.12 HUD venv:
    export HUD_API_KEY=$(grep '^HUD_API_KEY=' .env | cut -d= -f2-)
    HUD_BASELINE_MODEL=gemma ./.venv-hud/bin/python distill/hud_run.py
    ./.venv-hud/bin/python distill/hud_run.py --agent llm:qwen

Each produces a graded HUD `Run` (leaderboard-comparable). This is a HUD grading
smoke, not HUD GRPO weight updates. Use an open-model gateway baseline (Gemma/Qwen)
when the HUD registry exposes one; Claude is only a fallback sanity check.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import hud
from hud import LocalRuntime
from hud.agents import create_agent

from distill.hud_app import operate
from distill.hud_trm_agent import make_trm_agent

APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hud_app.py")
DEFAULT_BASELINES = ("gemma", "qwen", "claude")


async def rollout(agent, seed: int = 0):
    return await hud.eval.rollout(
        operate(seed=seed), agent,
        runtime=LocalRuntime(path=APP, env="factoryceo-trm"))


async def main(agent_spec: str | None, seed: int = 0):
    if agent_spec and agent_spec.startswith("llm:"):
        run = await rollout(create_agent(agent_spec[4:]), seed)
        print(f"HUD Run | agent={agent_spec} | reward={run.reward}")
    else:
        trm = await rollout(make_trm_agent(), seed)
        baseline_model = None
        baseline_err = None
        llm = None
        requested = os.environ.get("HUD_BASELINE_MODEL", "")
        candidates = [m.strip() for m in requested.split(",") if m.strip()] or list(DEFAULT_BASELINES)
        for model in candidates:
            try:
                llm = await rollout(create_agent(model), seed)
                baseline_model = model
                break
            except Exception as e:
                baseline_err = e
                continue
        print(f"\nHUD leaderboard (same env, same task, graded by the verifier):")
        print(f"  TRM/JSON repair policy  reward = {trm.reward:.3f}")
        if llm is None:
            print(f"  open gateway baseline   skipped ({type(baseline_err).__name__}: {str(baseline_err)[:120]})")
        else:
            kind = "open-model gateway" if baseline_model in {"gemma", "qwen", "qwen3", "gemma-3", "gemma-2"} else "fallback gateway"
            print(f"  {baseline_model} ({kind})  reward = {llm.reward:.3f}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--agent", default=None, help="llm:<model> for one gateway run; default = TRM vs HUD_BASELINE_MODEL/open fallback")
    ap.add_argument("--seed", type=int, default=0)
    asyncio.run(main(ap.parse_args().agent, ap.parse_args().seed))
