# FactoryCEO HUD environment (worldsim-template-style)

A HUD environment for the factory-ops brain, structured after hud-evals/
worldsim-template: a registered **Taskset** with **partial-credit scoring from
the (verifier) sim state**, reference agents, and an eval runner.

```
tasks.py    long-horizon Taskset (14-60 day scenarios) + partial_credit() breakdown
agents.py   reference agents: naive (no repair) / greedy / trm (verifier-gated)
eval.py     offline runner: reset -> drive -> grade, per-task breakdown + leaderboard
```

## Run it

**Offline (no HUD key, no credits)** — grading is our deterministic verifier:

```bash
python distill/hud/eval.py            # all agents x all tasks
python distill/hud/eval.py --agent trm
```

Example leaderboard (mean partial credit): `trm 1.000 · greedy 0.798 · naive 0.302`
(naive leaves 16-28 hard violations on the long-horizon tasks; the verifier-gated
TRM is feasible everywhere).

**Real HUD cloud rollout** (graded HUD Runs, open/fallback gateway LLM vs the TRM agent) — needs
`HUD_API_KEY` and the 3.12 venv, and spends HUD credits:

```bash
HUD_BASELINE_MODEL=gemma ./.venv-hud/bin/python distill/hud_run.py
```

**Real HUD TrainingClient RL** (preferred — [HUD rl-training cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/rl-training)) —
roll out golden floor tasks and promote weights on the trainable model string:

```bash
HUD_TRAIN_MODEL=shiftbench-qwen36-27b \
  ./.venv-hud/bin/python distill/hud_train_open_student.py \
  --golden-tasks results/golden_hard_tasks.json --golden-sample 6 \
  --reward-mode format --steps 4 --group 6 --max-concurrent 2 \
  --out results/hud_floor_grpo.json
```

Measured rollouts only (no training):

```bash
HUD_EVAL_MODEL=claude-opus-4-8 \
./.venv-hud/bin/python distill/hud_floor_eval.py \
  --max-floors 12 --group 6 --max-tokens 12000
```

Use `HUD_EVAL_MODEL=claude-opus-4-8` (or another stronger HUD gateway model)
for the measured report when the trainable Qwen head violates JSON-only output
or runs out of completion tokens. Keep `HUD_TRAIN_MODEL` separate for GRPO
weight updates, because TrainingClient requires a trainable gateway model.

Fireworks managed RL (`distill/hud_train_fireworks.py`) provisions B200 and is slow;
use only if HUD TrainingClient is unavailable.

## Is HUD in the prod request path?
No. The live brain (`api.py`) calls only the pure reward funcs
(`hud_env.hybrid_reward`/`normalized_reward`). The HUD **environment + rollouts**
are this offline eval/training layer — `build_environment` (`distill/hud_app.py`)
+ the cloud runner — not invoked per request. The same Taskset + verifier reward
back both, so the offline leaderboard and a HUD cloud Run measure the same thing.
