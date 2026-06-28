"""FactoryCEO-TRM as a real HUD v6 environment (hud-python 0.6.x).

Loaded by HUD's LocalRuntime via `python -m hud.environment.server <this file>
--env factoryceo-trm`. Defines an Environment + a task template: the agent gets
the messy plant context and returns a JSON ActionPlan, graded by our verifier
reward (normalized to [0,1]). This is what `rollout(task, agent, runtime=...)`
drives — a genuine HUD task whose reward is our verifier.

Run a rollout with: python distill/hud_run.py   (needs HUD_API_KEY, .venv-hud).
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# pylint: disable=import-error,no-name-in-module,wrong-import-position
import hud
from src.generator import generate_state
from src.floor_prompt import floor_prompt_and_state
from src.hud_env import reward_for_mode, scenario_prompt, score_answer
from src.generator import generate_state

env = hud.Environment("factoryceo-trm")


@env.template(id="operate")
async def operate(seed: int = 0, horizon_days: int = 30, n_jobs: int = 14,
                  reward_mode: str = "strict"):
    state = generate_state(seed=seed, horizon_days=horizon_days, n_jobs=n_jobs)
    answer = yield scenario_prompt(state)            # prompt -> agent
    yield reward_for_mode(state, str(answer), reward_mode)  # format/shaped/strict in [0,1]


@env.template(id="operate_floor")
async def operate_floor(floor_id: str = "staer_crossdock", seed: int = 0,
                        reward_mode: str = "strict", teacher_answer: str = ""):
    """Staer/RAFS/SOAR-backed ShiftBench task for HUD training.

    The symbolic verifier still grades an ActionPlan, but the prompt includes the
    floor fixture, job-source mapping, route constraints, and long-horizon rollout
    summary so a trainable gateway model learns on the same context the UI shows.
    """
    prompt, state = floor_prompt_and_state(floor_id, seed)
    if teacher_answer:
        prompt += (
            "\n\nJSON format hint from Claude teacher for this task:\n"
            "The snippet below is only an output-format example. Do not explain it, "
            "do not derive a schedule in prose, and do not include any text before "
            "or after JSON. Your first response character must be {.\n"
            f"{teacher_answer}\n\n"
            "Now return one complete ActionPlan JSON object only."
        )
    answer = yield prompt
    yield reward_for_mode(state, str(answer), reward_mode)
