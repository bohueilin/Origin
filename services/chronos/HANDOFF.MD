# HUD v6 + Fireworks Training Handoff

**Purpose:** practical, platform-agnostic handoff for calibrating HUD tasks and launching a first supervised or reinforcement fine-tuning run on HUD or Fireworks.

**Research date:** 2026-06-20 (America/Los_Angeles)  
**Hackathon deadline translated to an absolute date:** start the first real training run no later than **8:00 AM PDT on Sunday, June 21, 2026**. The hackathon page lists submissions at **1:00 PM on Sunday, June 21, 2026**.

Primary sources: [HUD hackathon page](https://www.hud.ai/hackathon), [HUD v6 documentation](https://docs.hud.ai/v6/start/quickstart), [HUD SDK repository](https://github.com/hud-evals/hud-python), [Fireworks training overview](https://docs.fireworks.ai/fine-tuning/finetuning-intro), and the [Fireworks cookbook repository](https://github.com/fw-ai/cookbook).

---

## Table of contents

1. [Executive decision guide](#1-executive-decision-guide)
2. [Non-negotiable launch gate](#2-non-negotiable-launch-gate)
3. [The platform-neutral training contract](#3-the-platform-neutral-training-contract)
4. [Calibrate every task with approximately ten runs](#4-calibrate-every-task-with-approximately-ten-runs)
5. [Reward and grader engineering](#5-reward-and-grader-engineering)
6. [HUD v6 SDK mental model](#6-hud-v6-sdk-mental-model)
7. [HUD v6 build, evaluate, deploy, and sync runbook](#7-hud-v6-build-evaluate-deploy-and-sync-runbook)
8. [Train with the HUD TrainingClient](#8-train-with-the-hud-trainingclient)
9. [What SFT means on HUD](#9-what-sft-means-on-hud)
10. [Fireworks training pathsâ€”do not mix them](#10-fireworks-training-pathsdo-not-mix-them)
11. [Fireworks managed SFT runbook](#11-fireworks-managed-sft-runbook)
12. [Fireworks managed RFT runbook](#12-fireworks-managed-rft-runbook)
13. [Fireworks low-level Training API: SFT](#13-fireworks-low-level-training-api-sft)
14. [Fireworks low-level Training API: RL](#14-fireworks-low-level-training-api-rl)
15. [HUDâ€™s direct Fireworks RL cookbook](#15-huds-direct-fireworks-rl-cookbook)
16. [SFT â†’ RFT hybrid strategy](#16-sft--rft-hybrid-strategy)
17. [Monitoring, checkpointing, and rollback](#17-monitoring-checkpointing-and-rollback)
18. [Failure-mode playbook](#18-failure-mode-playbook)
19. [Sunday launch checklist](#19-sunday-launch-checklist)
20. [Credits and access request template](#20-credits-and-access-request-template)
21. [Reproducibility manifest](#21-reproducibility-manifest)
22. [Verified documentation map](#22-verified-documentation-map)

---

## 1. Executive decision guide

The cleanest choice depends on what data and control surface already exist.

| Situation | Recommended route | Why |
|---|---|---|
| HUD environment and taskset are already working; fastest route to on-policy RL | **HUD `TrainingClient`** | Roll out, train, checkpoint, promote, and serve behind one HUD model string. Minimal lifecycle plumbing. |
| You have prompt/response demonstrations and want conventional supervised tuning | **Fireworks managed SFT** | Documented dataset upload, managed job, validation, warm-start, and deployment workflow. |
| You have prompts plus an evaluator and want a managed RL job | **Fireworks managed RFT** | `eval-protocol` packages evaluator + dataset + job launch; GRPO/DAPO/GSPO-token are supported job-level choices. |
| You require a custom loss, custom rollout scheduler, very high rollout parallelism, or explicit sampler/trainer control | **Fireworks Training API** | Low-level trainer, deployment sampler, token-level data, custom forward/backward, explicit checkpoint/hotload lifecycle. |
| You want HUD-style local task grading but Fireworks-managed trainer and sampler resources | **HUD Fireworks RL cookbook** | A bridge path: HUD-style task generation and local grading, Fireworks Training API for sampling and updates. |
| Base policy cannot produce any valid behavior and all rewards are zero | **Small SFT warm start, then RFT** | Demonstrations can teach protocol/tool syntax before reward-driven optimization. |

### The most important distinction

Fireworks exposes **two different RL products**:

1. **Managed RFT jobs** use datasets, evaluators, and `eval-protocol create rft` or `firectl rftj create`.
2. The **Training API** gives you a trainer client and deployment sampler, and your code owns the loop.

HUDâ€™s [direct Fireworks RL cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/fireworks-rl-training) explicitly uses the **Training API**, not Fireworks native RFT jobs or managed datasets. Commands and resource IDs from these two paths are not interchangeable.

### Recommended hackathon default

For a team already building in HUD:

1. Freeze a HUD taskset and evaluator.
2. Run every task about ten times against the **exact trainable model/checkpoint and sampling configuration**.
3. Keep or tune tasks so their per-task/group reward means are approximately 0.20â€“0.50 and their repeated outcomes differ.
4. Launch a small HUD `TrainingClient` run first.
5. Use Fireworks managed RFT only when its job abstraction is preferable, or use the Training API when custom parallelism/loss/lifecycle control is genuinely needed.

---

## 2. Non-negotiable launch gate

The [HUD hackathon instructions](https://www.hud.ai/hackathon) require the following before the first training run:

- **Approximately 10 evaluations per task** against the model that will be trained.
- Tune tasks to an **average reward around 20%â€“50%**.
- Require **real variance**â€”not all-zero and not all-one outcomes.
- Start the first real training run by **8:00 AM PDT Sunday, June 21, 2026**.
- Ask HUD or Fireworks for training credits/access once the task distribution is ready.

Treat these as a launch gate, not suggestions.

### Why the target is per task or rollout groupâ€”not merely global

A dataset can have a global mean of 0.30 while still providing no useful within-group learning signal. Example:

- 30 tasks always score 1.0.
- 70 tasks always score 0.0.
- Global mean = 0.30.
- Every repeated task has zero variance.

For group-relative policy optimization, that distribution is unusable because each promptâ€™s sibling rollouts are identical in reward. HUDâ€™s training guidance explains that the group advantage is reward relative to the group mean; no within-group spread means no policy-gradient signal. Fireworks managed RFT likewise monitors and may filter zero-variance groups.

**The real gate is therefore:** for a meaningful fraction of task prompts, sibling rollouts from the same policy and prompt must receive different rewards.

---

## 3. The platform-neutral training contract

Keep the following logical objects independent of HUD or Fireworks. This makes it possible to move from one training backend to another without rewriting the environment or losing reproducibility.

### 3.1 Task specification

Each task should have:

```json
{
  "task_id": "stable-family-and-parameter-id",
  "split": "calibration|train|heldout",
  "prompt": "the user-visible instruction",
  "task_parameters": {},
  "environment_version": "git-sha-or-image-digest",
  "grader_version": "git-sha-or-semver",
  "metadata": {
    "difficulty": "medium",
    "family": "browser-form-fill"
  }
}
```

Properties:

- `task_id` must be stable across reruns.
- Stochastic seeds belong in task parameters or run metadata.
- The prompt must describe the same success criteria that the grader measures.
- Calibration, training, and held-out tasks must be separable.

### 3.2 Environment contract

The environment must provide:

1. **Reset** to a known initial state.
2. **Capabilities/tools** available to the agent.
3. **Observation and action semantics**.
4. **Termination conditions**.
5. **Cleanup** even after errors or timeouts.
6. A deterministic or logged source of randomness.

For agentic tasks, record external dependencies, secrets, service URLs, simulator versions, and any network permissions.

### 3.3 Agent and sampling configuration

Record at minimum:

```json
{
  "provider": "hud|fireworks|other",
  "model_id": "exact-resource-or-model-string",
  "checkpoint_id": "exact-head-or-checkpoint",
  "harness": "agent-name-and-version",
  "temperature": 0.8,
  "top_p": 0.95,
  "top_k": 40,
  "max_tokens": 4096,
  "tool_schema_hash": "sha256:...",
  "system_prompt_hash": "sha256:..."
}
```

Calibration on one model and training another invalidates the difficulty estimate. Calibrating at temperature 0 and training at temperature 1 also invalidates the variance estimate.

### 3.4 Trajectory contract

A trainable RL trajectory normally needs:

- Prompt/input token IDs.
- Generated/output token IDs.
- Rollout-policy log probabilities when the algorithm needs importance ratios.
- A mask identifying trainable action tokens.
- Scalar reward, usually normalized to 0â€“1.
- Group ID tying sibling rollouts to the same prompt.
- Policy/checkpoint version used to generate it.
- Optional tool calls, observations, segment IDs, and per-segment rewards.

HUD can resolve remote trajectories from trace IDs or carry local token-level samples in the run trace. Fireworksâ€™ low-level sampler exposes tokens/log probabilities and its cookbook wraps them in rollout samples.

### 3.5 Evaluation record

Use one JSON object per rollout:

```json
{
  "task_id": "browser-form-fill/0042",
  "group_id": "browser-form-fill/0042::checkpoint-0003",
  "run_id": "uuid",
  "model_id": "exact-model-resource",
  "checkpoint_id": "checkpoint-0003",
  "seed": 17,
  "reward": 1.0,
  "valid": true,
  "timeout": false,
  "grader_error": false,
  "latency_seconds": 18.2,
  "output_tokens": 544,
  "trajectory_ref": "trace-or-artifact-reference",
  "grader_details": {
    "format_ok": true,
    "semantic_ok": true
  }
}
```

Keep system failures separate from legitimate zero reward. A rollout that could not start is not the same phenomenon as a valid but incorrect attempt.

---

## 4. Calibrate every task with approximately ten runs

### 4.1 Calibration procedure

For every candidate task:

1. Reset the environment.
2. Run the exact model/checkpoint intended for the initial training run.
3. Use the same harness, tool definitions, system prompt, temperature, top-p/top-k, and maximum tokens planned for training.
4. Repeat about **10 times per task**.
5. Save every trajectory and rewardâ€”not only aggregates.
6. Compute per-task and per-family statistics.
7. Inspect at least one success and one failure manually for every task family.
8. Remove or retune tasks with all-zero or all-one rewards.
9. Repeat calibration after any material prompt, grader, environment, or sampling change.

Ten runs is a screening gate, not a precise statistical estimate. For a binary reward, two to five successes out of ten lands in the 20%â€“50% target range, but confidence intervals remain wide. Increase repetitions for final task selection or when outcomes are expensive/high variance.

### 4.2 HUD CLI baseline

The [HUD CLI reference](https://docs.hud.ai/v6/core/cli) documents grouped repeats. A representative full-taskset calibration command is:

```bash
hud eval tasks.py <agent> \
  --model <EXACT_TRAINABLE_MODEL_OR_BASELINE> \
  --full \
  --group 10 \
  --gateway \
  --max-concurrent 32
```

Interpretation:

- `--group 10`: repeat each task ten times.
- `--full`: evaluate the full taskset rather than a sample.
- `--gateway`: route model calls through HUD so trace/token collection matches the later HUD training path.
- `--model`: pin the exact model string.

Run `hud eval --help` in the installed SDK version before launch because CLI flags can evolve.

### 4.3 Fireworks direct-cookbook calibration

The [HUD Fireworks cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/fireworks-rl-training) provides a calibration-only mode that avoids creating a trainer or taking optimizer steps:

```bash
uv run train.py --calibrate-only \
  --groups-per-step 8 \
  --rollouts-per-prompt 10 \
  --parallelism 32
```

The cookbookâ€™s published example uses eight rollouts; use ten for the hackathonâ€™s final screening pass when resources permit. Ensure the calibration model is actually the same trainable base/deployment. The cookbook notes that its preview account sometimes used a separate serverless model for cheap calibration; that is useful for early task shaping but is not a substitute for final calibration on the training policy.

### 4.4 Reward-analysis script

Save rollout records as JSONL with at least `task_id` and `reward`, then run this standard-library-only script:

```python
#!/usr/bin/env python3
"""Summarize per-task reward calibration from JSONL."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any


def load_records(path: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                task_id = str(record["task_id"])
                reward = float(record["reward"])
            except (json.JSONDecodeError, KeyError, TypeError, ValueError) as exc:
                raise ValueError(f"Invalid record on line {line_number}: {exc}") from exc
            if not math.isfinite(reward):
                raise ValueError(f"Non-finite reward on line {line_number}")
            record["task_id"] = task_id
            record["reward"] = reward
            records.append(record)
    if not records:
        raise ValueError("No records found")
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("jsonl", type=Path)
    parser.add_argument("--target-min", type=float, default=0.20)
    parser.add_argument("--target-max", type=float, default=0.50)
    parser.add_argument("--minimum-runs", type=int, default=10)
    args = parser.parse_args()

    grouped: dict[str, list[float]] = defaultdict(list)
    for record in load_records(args.jsonl):
        grouped[record["task_id"]].append(record["reward"])

    header = [
        "task_id", "n", "mean", "std", "min", "max",
        "unique", "all_zero", "all_one", "target", "variance", "ready"
    ]
    print("\t".join(header))

    ready_count = 0
    for task_id in sorted(grouped):
        values = grouped[task_id]
        mean = statistics.fmean(values)
        std = statistics.stdev(values) if len(values) > 1 else 0.0
        unique = len(set(values))
        all_zero = all(v == 0.0 for v in values)
        all_one = all(v == 1.0 for v in values)
        target = args.target_min <= mean <= args.target_max
        variance = unique > 1 and std > 0.0
        ready = len(values) >= args.minimum_runs and target and variance
        ready_count += int(ready)
        row = [
            task_id,
            str(len(values)),
            f"{mean:.4f}",
            f"{std:.4f}",
            f"{min(values):.4f}",
            f"{max(values):.4f}",
            str(unique),
            str(all_zero),
            str(all_one),
            str(target),
            str(variance),
            str(ready),
        ]
        print("\t".join(row))

    print(
        f"\nReady tasks: {ready_count}/{len(grouped)} "
        f"({ready_count / len(grouped):.1%})"
    )


if __name__ == "__main__":
    main()
```

Usage:

```bash
python analyze_rewards.py calibration.jsonl > calibration.tsv
```

### 4.5 What to tune

When reward is **all zero**:

- Reduce task horizon or number of independent constraints.
- Provide missing tool/protocol instructions.
- Make environment feedback more informative without leaking the answer.
- Harden parsing so semantically correct outputs are not rejected for irrelevant formatting.
- Increase allowed steps/tokens when truncation is the cause.
- Use a stronger initial model or a small SFT warm start if the base model cannot enter the valid behavior manifold.

When reward is **all one**:

- Increase compositional depth or distractors.
- Remove answer leakage and grader shortcuts.
- Add adversarial or boundary cases.
- Require correctness of the final state, not merely a syntactic action.
- Reduce unnecessary hints.

When the mean is in range but there is **no within-task variance**:

- You probably mixed easy and impossible task IDs.
- Reparameterize tasks so each repeated prompt has stochastic policy outcomes.
- Do not manufacture variance by injecting random reward noise. That creates gradient noise rather than learnable signal.

---

## 5. Reward and grader engineering

Primary references: [HUD graders](https://docs.hud.ai/v6/core/graders), [HUD task-design advice](https://docs.hud.ai/v6/core/advice), and [Fireworks evaluator guidance](https://docs.fireworks.ai/fine-tuning/evaluators).

### 5.1 Start with the simplest trustworthy reward

Prefer, in order:

1. Deterministic exact/state checks.
2. Execution-based checks or unit tests.
3. Deterministic decomposed partial credit.
4. LLM judges only for criteria that cannot be made objective.

Fireworks evaluators conventionally return a score from 0.0 to 1.0. Binary scoring is often excellent when success is objectively verifiable; graded reward is helpful only when partial states correspond to genuine progress.

### 5.2 Grader invariants

A production grader should be:

- **Aligned:** measures exactly what the prompt requests.
- **Robust:** accepts harmless formatting variation and rejects semantic errors.
- **Fast:** seconds, not minutes, where possible.
- **Total:** returns a defined result for malformed output, timeouts, and tool errors.
- **Secure:** sandbox untrusted code and constrain network/filesystem access.
- **Non-gameable:** checks content and final state, not proxies such as output length or valid JSON alone.
- **Versioned:** grader changes create a new version and usually a new training fork/run.

### 5.3 Known-good and known-bad fixtures

Before calibration, create a test suite containing:

- Canonical correct answer.
- Correct answer with formatting variation.
- Near miss.
- Empty answer.
- Malformed structured output.
- Timeout/infinite loop.
- Tool exception.
- Reward-hacking attempt.
- Answer copied from irrelevant prompt text.
- Correct intermediate work but wrong final state.

The grader should score each fixture intentionally. Fireworksâ€™ evaluator docs explicitly recommend testing manually created good and bad examples before training.

### 5.4 Composite reward example

Use partial credit only when every term represents real task value:

```python
def reward(result: dict) -> float:
    if result.get("grader_error"):
        return 0.0

    state_ok = bool(result.get("final_state_correct"))
    format_ok = bool(result.get("format_valid"))
    safety_ok = bool(result.get("safety_constraints_met"))

    if not safety_ok:
        return 0.0
    if state_ok and format_ok:
        return 1.0
    if state_ok:
        return 0.8
    return 0.0
```

Avoid a reward such as `0.5 * valid_json + 0.5 * correct`, because the policy can earn substantial reward by returning semantically wrong but valid JSON. Gate proxy criteria behind semantic correctness.

### 5.5 Grader errors versus task failures

Log separate fields:

- `reward`: task outcome.
- `valid_rollout`: whether the environment and agent actually ran.
- `grader_error`: grader infrastructure failed.
- `timeout`: rollout exceeded limit.
- `environment_error`: reset/tool/backend failed.

Do not silently turn infrastructure failures into zeros and then train on them. That teaches the policy against random operational faults.

---

## 6. HUD v6 SDK mental model

Read in this order: [quickstart](https://docs.hud.ai/v6/start/quickstart), [build overview](https://docs.hud.ai/v6/build/overview), [protocol](https://docs.hud.ai/v6/core/protocol), [environments](https://docs.hud.ai/v6/core/environment), [tasks](https://docs.hud.ai/v6/core/tasks), [capabilities](https://docs.hud.ai/v6/core/capabilities), [agents](https://docs.hud.ai/v6/core/agents), [runtime](https://docs.hud.ai/v6/core/runtime), [graders](https://docs.hud.ai/v6/core/graders), and [training](https://docs.hud.ai/v6/core/training).

### 6.1 What changed in v6

The [v6 migration guide](https://docs.hud.ai/v6/more/migrate-v6) frames the core architectural change:

- Earlier HUD environments behaved more like MCP servers that owned tool exposure.
- In v6, the environment is a small control plane exposing **capabilities and tasks**.
- The agent/harness owns how model calls and tools are wired.
- A task is naturally represented as an async generator: yield a prompt, receive an answer/trajectory, then yield a reward.

This separation is useful for RL because environment logic, agent harness, runtime placement, and training backend can evolve independently.

### 6.2 Core objects

#### Environment

An `Environment` declares task templates, capabilities, setup/teardown behavior, and metadata.

#### Task template

A decorated async generator that defines how a parameterized task is instantiated and graded.

#### Task

A concrete, serializable instance of a template and its parameters.

#### Taskset

An ordered collection of tasks that can run against an agent/runtime and can be deployed/synced.

#### Agent

Model plus harness behavior. The recommended construction is `create_agent(model)`, which lets HUD wire the gateway and capabilities.

#### Runtime

Where environment code executes. HUD documents local, Docker, Modal, Daytona, TCP, and managed HUD runtimes.

#### Job and Run

A job groups evaluations; runs contain result/reward/trace references. For RL, the jobâ€™s runs become the training batch.

### 6.3 Minimal HUD v6 environment

Adapted from the [HUD quickstart](https://docs.hud.ai/v6/start/quickstart):

```python
from hud import Environment


env = Environment(name="letter-count")


@env.template()
async def count_letter(word: str = "strawberry", letter: str = "r"):
    answer = yield (
        f"How many '{letter}' characters are in '{word}'? "
        "Reply with only the number."
    )
    expected = word.count(letter)
    parsed = (answer or "").strip()
    yield 1.0 if parsed == str(expected) else 0.0


tasks = [
    count_letter(word="strawberry", letter="r"),
    count_letter(word="raspberry", letter="r"),
    count_letter(word="blueberry", letter="b"),
]
```

The two-yield structure is the key protocol:

1. Yield the prompt.
2. Receive the agent result.
3. Yield the reward.

For tool-using tasks, the result can reflect the final environment state or a structured agent output; use HUD capabilities and graders rather than overloading prompt text.

### 6.4 Runtime choices

The [runtime guide](https://docs.hud.ai/v6/core/runtime) documents:

- `LocalRuntime`: fastest development loop.
- `DockerRuntime`: reproducible local container.
- `ModalRuntime` and `DaytonaRuntime`: remote execution integrations.
- `Runtime("tcp://...")`: explicit remote endpoint.
- `HUDRuntime`: deployed HUD-managed task execution.

Training code can remain unchanged while switching from local tasks to a deployed taskset, because a `Run` or trace ID carries enough trajectory reference for HUDâ€™s training service.

### 6.5 Graders

HUD provides comparison helpers such as exact/contains/numeric/F1-style checks, execution-based graders such as `BashGrader`, LLM judges, and composition utilities. Use deterministic graders whenever the environment state permits them. See [HUD graders](https://docs.hud.ai/v6/core/graders).

---

## 7. HUD v6 build, evaluate, deploy, and sync runbook

### 7.1 Install and authenticate

The [HUD quickstart](https://docs.hud.ai/v6/start/quickstart) recommends:

```bash
uv tool install hud-python --python 3.12
hud set HUD_API_KEY=<YOUR_KEY>
```

The hackathon page also shows `pip install hud-python`; prefer the current quickstartâ€™s `uv tool install` for an isolated CLI unless the project already manages HUD as a Python dependency.

### 7.2 Initialize

```bash
hud init my-env
cd my-env
```

### 7.3 Local evaluation

```bash
hud eval tasks.py claude
```

Replace the agent/model with the exact harness used by the project. For a calibration gate, use grouped full evaluation as described earlier.

### 7.4 Verify the task contract

Before deployment:

- Every task resets independently.
- The task generator yields prompt then reward exactly as intended.
- Every grader path returns a finite reward.
- Known-good and known-bad fixtures pass.
- Timeouts and exceptions clean up resources.
- Task IDs and parameters serialize.
- No secret is embedded in task metadata or prompts.

### 7.5 Deploy and sync

The [runtime/deployment guide](https://docs.hud.ai/v6/core/runtime) documents:

```bash
hud deploy
hud sync tasks my-taskset
```

Pin the resulting environment/taskset identifier in the training manifest. Do not silently update a deployed environment during a run.

### 7.6 Final 10Ã— calibration

```bash
hud eval tasks.py <agent> \
  --model <EXACT_MODEL_STRING> \
  --full \
  --group 10 \
  --gateway \
  --max-concurrent 32
```

Export or transform the run records into the platform-neutral JSONL schema, compute per-task statistics, and archive the raw traces.

---

## 8. Train with the HUD TrainingClient

Primary references: [HUD training documentation](https://docs.hud.ai/v6/core/training) and [HUD RL training cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/rl-training).

### 8.1 Model lifecycle

List available gateway models and identify a trainable one:

```bash
hud models list
```

Fork a trainable model when supported:

```bash
hud models fork Qwen/Qwen3.5-4B --name arith-rl
```

Use the resulting HUD model string consistently for rollout and training. HUDâ€™s managed loop advances, checkpoints, and promotes weights behind that same string.

### 8.2 Minimal on-policy loop

```python
from __future__ import annotations

import asyncio

from hud import TrainingClient
from hud.agents import create_agent
from hud.eval import Job

# Project-specific import. It must return a Taskset and a compatible Runtime.
from common import load_taskset_and_runtime


MODEL = "arith-rl"
GROUP_SIZE = 8
LEARNING_RATE = 1e-5
STEPS = 10


async def main() -> None:
    agent = create_agent(
        MODEL,
        completion_kwargs={
            "extra_body": {"return_token_ids": True},
        },
    )
    trainer = TrainingClient(MODEL)
    taskset, runtime = load_taskset_and_runtime()
    session = await Job.start("arith-rl-session", group=GROUP_SIZE)

    for step_index in range(STEPS):
        start = len(session.runs)

        # Samples from the current promoted weights.
        await taskset.run(agent, runtime=runtime, job=session)
        batch = session.runs[start:]

        if not batch:
            raise RuntimeError(f"No runs produced at step {step_index}")
        if len(batch) % GROUP_SIZE != 0:
            raise RuntimeError(
                f"Batch size {len(batch)} must divide evenly by "
                f"group size {GROUP_SIZE}"
            )

        # Built-in server-side objective, followed by optimizer step and promotion.
        forward_backward = await trainer.forward_backward(
            batch,
            loss_fn="importance_sampling",
            group_size=GROUP_SIZE,
        )
        result = await trainer.optim_step(learning_rate=LEARNING_RATE)
        print(
            f"step={step_index} datums={forward_backward.num_datums} "
            f"checkpoint={result.checkpoint_id}"
        )


if __name__ == "__main__":
    asyncio.run(main())
```

The [official HUD cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/rl-training) contains runnable variants:

```bash
uv run simple_train.py --steps 10
uv run ppo_custom_loss.py --steps 10
```

The simple example uses a built-in server-side objective. The custom example demonstrates client-side token-level loss math.

### 8.3 HUDâ€™s grouped update semantics

HUD documents built-in objectives including:

- `cross_entropy`
- `importance_sampling`
- `ppo`
- `cispo`
- `dro`

For group-relative policy-gradient methods, samples are grouped in contiguous chunks of `group_size`. The batch length must divide evenly by that group size. The reward baseline is computed within the group; identical sibling rewards yield zero advantage.

### 8.4 Lower-level methods

`TrainingClient` exposes lower-level operations for teams that need explicit control:

- `forward_backward(...)`
- `optim_step(...)`
- `step(...)`
- `forward_backward_custom(...)`
- `forward(...)`
- `backward(...)`
- loss discovery and checkpoint/head methods

Use `step(...)` for the simplest correct loop. Split forward/backward and optimizer operations only when implementing custom accumulation, scheduling, or token-level loss.

For custom loss code, install the training extra documented by HUD:

```bash
pip install 'hud-python[train]'
```

### 8.5 Remote versus local trajectory handling

The HUD cookbook explains:

- `HUDRuntime` runs may return reward plus a trace ID; the platform resolves the full token-level trajectory server-side.
- `LocalRuntime` runs can carry token-level samples in their trace and send them inline.
- Training can accept run objects or trace references, so the optimizer loop does not need to care where the rollout executed.

### 8.6 Checkpoints and rollback

```bash
hud models checkpoints arith-rl
hud models head arith-rl --set <CHECKPOINT_ID>
```

Use rollback when:

- A checkpoint collapses reward or diversity.
- The objective or learning rate is wrong.
- The grader/environment changed accidentally.
- The next rollout is sampling stale or undesirable weights.

Prefer a new model fork when changing the reward definition or environment semantics; rollback is appropriate for weight regressions under the same task contract.

### 8.7 Validation after the first step

A training command existing is not enough. Confirm:

1. A rollout batch completed.
2. Rewards have within-group variance.
3. A forward/backward operation completed.
4. The optimizer step completed.
5. A checkpoint/head changed.
6. The next rollout sampled the new promoted weights.
7. A frozen held-out evaluation still runs.

---

## 9. What SFT means on HUD

HUD is documented primarily as an environment/evaluation/RL SDK. Its `TrainingClient` exposes `cross_entropy` as a supervised loss primitive, so supervised token training is possible at the low level when a tokenized trajectory and action mask are available.

What HUDâ€™s current v6 docs do **not** present is a conventional, managed, dataset-first SFT job workflow comparable to Fireworksâ€™ â€œupload OpenAI chat JSONL â†’ create SFT job â†’ deploy modelâ€ path.

Practical guidance:

- Use HUD for task/environment execution, trajectory collection, evaluation, and on-policy RL.
- Use HUD `cross_entropy` only when the team already understands how to construct supervised trajectory payloads and masks.
- Use [Fireworks managed SFT](https://docs.fireworks.ai/fine-tuning/fine-tuning-models) or its [Training API SFT recipe](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/sft) for a standard demonstration-dataset workflow.
- After SFT, re-run the exact 10Ã— task calibration. SFT can move tasks from all-zero to learnable, but it can also make them all-one.

Do not assume that an SFT output model can be plugged into every HUD trainable model path without checking model import/fork/serving support with HUD.

---

## 10. Fireworks training pathsâ€”do not mix them

Start with the [Fireworks training overview](https://docs.fireworks.ai/fine-tuning/finetuning-intro) and [managed fine-tuning overview](https://docs.fireworks.ai/fine-tuning/managed-finetuning-intro).

### 10.1 Managed SFT

You provide demonstrations in chat JSONL. Fireworks owns the training job and outputs a fine-tuned model resource.

### 10.2 Managed RFT

You provide prompts/tasks, an evaluator, and job parameters. Fireworks owns rollout orchestration, evaluation integration, optimization, and managed monitoring.

### 10.3 Training API

Your code creates or attaches to a managed trainer and optionally a deployment sampler. You own the data/rollout loop, loss calls, optimizer steps, checkpoint synchronization, and resource lifecycle. The [Training API introduction](https://docs.fireworks.ai/fine-tuning/training-api/introduction) currently describes this surface as **private preview**, so request enablement and verify account quota before depending on it.

### 10.4 HUD direct Fireworks bridge

This is an application of the Training API, not a managed RFT job. It locally grades HUD-style tasks and sends token-level samples/rewards to the Fireworks trainer.

---

## 11. Fireworks managed SFT runbook

Primary references: [text SFT](https://docs.fireworks.ai/fine-tuning/fine-tuning-models), [SFT tokenization debugging](https://docs.fireworks.ai/fine-tuning/debug-sft-tokenization), [weighted training](https://docs.fireworks.ai/fine-tuning/weighted-training), [vision SFT](https://docs.fireworks.ai/fine-tuning/fine-tuning-vlm), and [deploying fine-tuned models](https://docs.fireworks.ai/fine-tuning/deploying-loras).

### 11.1 When to use SFT

Use SFT when there is a dataset of desired responses or trajectories and the goal is to teach:

- Output schema.
- Tool-call syntax.
- Domain style or terminology.
- A behavior not reliably discovered by the base policy.
- A warm-start policy before RFT.

SFT imitates demonstrations; it does not optimize a task evaluator directly.

### 11.2 Dataset format

Fireworks uses OpenAI-compatible chat JSONL, one example per line:

```jsonl
{"messages":[{"role":"system","content":"Return only valid JSON."},{"role":"user","content":"Extract the order ID: Order A-104."},{"role":"assistant","content":"{\"order_id\":\"A-104\"}"}]}
{"messages":[{"role":"user","content":"What is 2 + 2?"},{"role":"assistant","content":"4"}]}
```

Current documented constraints include:

- Minimum 3 examples.
- Maximum 3 million examples per dataset.
- `.jsonl` file.
- `messages` array with `system`, `user`, and `assistant` roles.
- Optional assistant-message `weight` of 0 or 1 to skip specific assistant turns.
- Optional root sample `weight` used as a loss multiplier; when used, include it consistently.

Review the current [SFT data documentation](https://docs.fireworks.ai/fine-tuning/fine-tuning-models) before launch because supported fields and base models can change.

### 11.3 Data hygiene

- Split by task/entity/template family, not random near-duplicates.
- Remove hidden test answers from training.
- Deduplicate repeated prompts and responses.
- Keep the inference system prompt and tool schemas consistent with training.
- Validate the tokenizer/chat template.
- Mask prompt/context turns from loss unless intentionally training them.
- Avoid training on low-quality model-generated traces without filtering.

Use the [SFT tokenization debugger](https://docs.fireworks.ai/fine-tuning/debug-sft-tokenization) before spending credits.

### 11.4 Upload dataset

```bash
firectl dataset create <DATASET_ID> /path/to/training.jsonl
```

### 11.5 Launch managed SFT

```bash
firectl sftj create \
  --base-model <BASE_MODEL_ID> \
  --dataset <DATASET_ID> \
  --output-model <OUTPUT_MODEL_ID>
```

For continued training from an existing fine-tuned model, the docs show `--warm-start-from` rather than `--base-model`:

```bash
firectl sftj create \
  --warm-start-from <EXISTING_FINE_TUNED_MODEL_ID> \
  --dataset <DATASET_ID> \
  --output-model <NEW_OUTPUT_MODEL_ID>
```

For an evaluation dataset, include the current supported evaluation-dataset option documented in the SFT guide or use the UI. Store the returned **job ID** and use that ID for job-status commands; do not confuse it with the dataset ID.

### 11.6 Deploy

Fireworksâ€™ SFT guide states that fine-tuned models are served through an on-demand/dedicated deployment:

```bash
firectl deployment create <FINE_TUNED_MODEL_ID>
```

Verify deployment shape, scale-to-zero behavior, context length, and cost before using the model for high-volume RL calibration.

### 11.7 SFT acceptance gate

Before using the SFT model as an RL base:

- Evaluate frozen held-out demonstrations.
- Run the HUD taskset 10Ã— per task.
- Verify reward is not all-one.
- Verify format/tool compliance improved.
- Inspect regressions in general capability.
- Record the exact output model and deployment IDs.

---

## 12. Fireworks managed RFT runbook

Primary references: [RFT overview](https://docs.fireworks.ai/fine-tuning/reinforcement-fine-tuning-models), [how RFT works](https://docs.fireworks.ai/fine-tuning/how-rft-works), [evaluators](https://docs.fireworks.ai/fine-tuning/evaluators), [CLI reference](https://docs.fireworks.ai/fine-tuning/cli-reference), [prerequisites](https://docs.fireworks.ai/fine-tuning/training-prerequisites), [parameter tuning](https://docs.fireworks.ai/fine-tuning/parameter-tuning), and [monitoring](https://docs.fireworks.ai/fine-tuning/monitor-training).

### 12.1 When to use managed RFT

Use managed RFT when:

- Tasks can be represented as a Fireworks dataset.
- An evaluator can score outputs from 0â€“1.
- Standard GRPO/DAPO/GSPO-token is sufficient.
- You prefer a managed job over writing the rollout/update lifecycle.
- Remote agent environments can be exposed through Fireworksâ€™ supported environment integration.

### 12.2 Evaluator design

Fireworks documents rule-based, execution-based, and LLM-judge evaluators. Start with deterministic logic.

Conceptual evaluator:

```python
def evaluate(model_output: str, ground_truth: str) -> float:
    try:
        predicted = parse_answer(model_output)
    except ValueError:
        return 0.0
    return 1.0 if predicted == ground_truth else 0.0
```

A real Eval Protocol project must follow its current decorators and file layout; use the current quickstart rather than copying a stale decorator signature. The stable operational sequence is:

```bash
pip install eval-protocol
export FIREWORKS_API_KEY="fw_..."
cd evaluator_directory
ep local-test
```

The local test should include known-good and known-bad outputs.

### 12.3 Launch

From the evaluator/dataset directory:

```bash
eval-protocol create rft \
  --base-model accounts/fireworks/models/llama-v3p1-8b-instruct \
  --output-model my-model-name
```

The CLI uploads changed evaluator code and dataset, creates the job, and prints dashboard links.

### 12.4 Recommended calibration-aligned launch parameters

```bash
eval-protocol create rft \
  --base-model <BASE_MODEL_RESOURCE> \
  --output-model <OUTPUT_MODEL_ID> \
  --n 10 \
  --temperature <CALIBRATED_TEMPERATURE> \
  --max-tokens <CALIBRATED_MAX_TOKENS> \
  --max-concurrent-rollouts 64 \
  --rl-loss-method grpo
```

`--n 10` aligns the first grouped sampling configuration with the hackathonâ€™s ten-runs-per-task screening target. It is not automatically optimal for every later training step; after the first launch, tune group size/rollout count based on reward variance, throughput, and cost.

Current CLI documentation lists notable options:

- `--learning-rate`, documented default 1e-4.
- `--rl-loss-method grpo|dapo|gspo-token`.
- `--n` rollouts per prompt.
- `--temperature`, `--max-tokens`, `--top-p`, `--top-k`.
- `--max-concurrent-rollouts` for throughput.
- `--chunk-size` for prompts per training step.
- W&B options.
- Some checkpoint-frequency and timeout controls through `firectl`.

Always run:

```bash
eval-protocol create rft --help
```

before launch, because CLI defaults can change.

### 12.5 GRPO, DAPO, and GSPO-token

- **GRPO** is the general default. It uses relative rewards within rollout groups and commonly includes clipping/KL controls.
- **DAPO** changes the policy objective and is useful when its token-level normalization/clipping behavior is desired.
- **GSPO-token** is another token-level group policy objective.

Do not select an algorithm by name alone. Start with GRPO, inspect reward/ratio/KL/length behavior, and change only when a diagnosed failure mode justifies it.

### 12.6 Chunk size and on-policy freshness

Fireworksâ€™ parameter-tuning guide explains that chunk size controls how many prompts are rolled out before a training step. Smaller chunks generally improve on-policy freshness but can reduce throughput. Larger chunks improve batching but increase the chance that later samples were produced by older weights.

For a first hackathon run:

- Prefer a small enough chunk that at least one update completes quickly.
- Do not provision a huge run before proving the first update and checkpoint.
- Match rollout concurrency to evaluator and environment capacity.

### 12.7 Zero-variance behavior

Managed RFT monitors or filters zero-variance groups, and training can stop early when all rollouts receive the same score. Treat that as a task/evaluator/model-diversity problem, not merely a request to increase epochs.

### 12.8 Remote agent environments

For multi-turn or tool-using agents, read:

- [Agent tracing](https://docs.fireworks.ai/fine-tuning/environments)
- [Connect remote environments](https://docs.fireworks.ai/fine-tuning/connect-environments)
- [Use secrets in evaluators](https://docs.fireworks.ai/fine-tuning/using-secret-in-evaluator)
- [Remote-agent quickstart](https://docs.fireworks.ai/fine-tuning/quickstart-svg-agent)

Representative launch option:

```bash
eval-protocol create rft \
  --base-model <BASE_MODEL_RESOURCE> \
  --remote-server-url https://your-agent-environment.example.com \
  --output-model <OUTPUT_MODEL_ID>
```

Secure the remote environment, authenticate requests, isolate tasks, and make reset idempotent.

### 12.9 Pricing note

As of the research date, Fireworksâ€™ current CLI/RFT pages state that RFT is free for eligible models under 16B parameters, while SFT and DPO are billed per training token. This is volatile commercial information: verify [current pricing](https://fireworks.ai/pricing) and account eligibility before launch.

---

## 13. Fireworks low-level Training API: SFT

Primary references: [Training API introduction](https://docs.fireworks.ai/fine-tuning/training-api/introduction), [quickstart](https://docs.fireworks.ai/fine-tuning/training-api/quickstart), [SFT cookbook](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/sft), [training shapes](https://docs.fireworks.ai/fine-tuning/training-api/training-shapes), and [saving/loading](https://docs.fireworks.ai/fine-tuning/training-api/saving-and-loading).

### 13.1 Access and install

The Training API is documented as private preview. Confirm access first.

```bash
pip install --pre "fireworks-ai[training]"
export FIREWORKS_API_KEY="..."
```

Pin package and cookbook commits for reproducibility; the RL cookbook is explicitly described as experimental and evolving.

### 13.2 Service and trainer creation

The quickstart uses `FiretitanServiceClient`:

```python
import os
from fireworks.training.sdk import FiretitanServiceClient

api_key = os.environ["FIREWORKS_API_KEY"]
base_url = os.environ.get("FIREWORKS_BASE_URL", "https://api.fireworks.ai")
base_model = "accounts/fireworks/models/qwen3-8b"
shape_id = "accounts/fireworks/trainingShapes/qwen3-8b-128k-h200"

service = FiretitanServiceClient.from_firetitan_config(
    api_key=api_key,
    base_url=base_url,
    base_model=base_model,
    tokenizer_model="Qwen/Qwen3-8B",
    lora_rank=0,
    training_shape_id=shape_id,
    learning_rate=1e-5,
    create_deployment=False,
    cleanup_trainer_on_close=True,
)

training_client = service.create_training_client(
    base_model=base_model,
    lora_rank=0,
)
print(service.trainer_job_id)
```

Training shapes bind model/context/hardware configuration. Do not substitute a model or shape without verifying compatibility.

### 13.3 Token-weight contract

Low-level SFT operates on tokenized data with per-token weights:

- Prompt/system/user context tokens: usually weight `0.0`.
- Target assistant tokens: usually weight `1.0`.

The Training API quickstart constructs `Datum` objects and calls custom forward/backward plus optimizer steps. Use the documented helper functions rather than hand-rolling chat-template boundaries unless token masks are explicitly tested.

### 13.4 Config-driven SFT recipe

The [SFT cookbook](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/sft) provides a higher-level recipe:

```python
from training.recipes.sft_loop import Config, main
from training.utils import TrainerConfig

cfg = Config(
    log_path="./sft_logs",
    base_model="accounts/fireworks/models/qwen3-8b",
    dataset="/path/to/training_data.jsonl",
    tokenizer_model="Qwen/Qwen3-8B",
    max_seq_len=4096,
    epochs=1,
    batch_size=4,
    learning_rate=1e-5,
    trainer=TrainerConfig(
        training_shape_id=(
            "accounts/fireworks/trainingShapes/qwen3-8b-128k-h200"
        ),
    ),
)

main(cfg)
```

The docs warn that `batch_size_samples` is not supported by the V2 SFT configuration and may be silently ignored. Use the documented `batch_size`/epochs behavior and inspect actual step counts.

### 13.5 Save, promote, serve

The low-level lifecycle is explicit:

1. Forward/backward.
2. Optimizer step.
3. Save checkpoint/weights.
4. Promote or select a checkpoint.
5. Load/hotload into a sampler deployment when needed.
6. Clean up trainer/deployment resources.

Store every trainer job ID, checkpoint ID, deployment ID, and sampler version.

---

## 14. Fireworks low-level Training API: RL

Primary references: [RL cookbook](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/rl), [training and sampling](https://docs.fireworks.ai/fine-tuning/training-api/training-and-sampling), [loss functions](https://docs.fireworks.ai/fine-tuning/training-api/loss-functions), [weight sync](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/weight-sync), [checkpoints](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/checkpoints), [service client](https://docs.fireworks.ai/fine-tuning/training-api/reference/service-client), [deployment sampler](https://docs.fireworks.ai/fine-tuning/training-api/reference/deployment-sampler), and [cleanup](https://docs.fireworks.ai/fine-tuning/training-api/reference/cleanup).

### 14.1 What the RL cookbook owns

Fireworksâ€™ primary recipe is `async_rl_loop`. The recipe can own:

- Concurrent rollout sampling and training.
- Off-policy gating.
- Advantage calculation.
- Reference-model forwards.
- Weight synchronization.
- KL and token-importance-sampling metrics.
- PPO-style inner loops.
- Checkpointing and promotion.

The user supplies a rollout function and configuration.

The docs label this recipe experimental. Pin a Git commit from the [Fireworks cookbook repository](https://github.com/fw-ai/cookbook/tree/main/training/recipes) and avoid coding against an unpinned `main` branch for a deadline run.

### 14.2 Rollout function contract

A rollout function samples one trajectory, scores it, and returns a rollout sample containing concepts such as:

- Full token sequence.
- Rollout log probabilities.
- Loss/action mask.
- Scalar reward.
- Prompt/task metadata.

Conceptual structure, based on the current cookbook:

```python
from training.examples.rl.vanilla_sampler import build_deployment_sampler
from training.utils.rl.rollout import RolloutSample


def make_rollout_fn(setup):
    sampler = build_deployment_sampler(setup)
    sample_kwargs = dict(setup.sample_kwargs)

    async def rollout_fn(sample_prompt: dict) -> RolloutSample | None:
        completions = await sampler.sample_with_prompt_tokens(
            sample_prompt["prompt_token_ids"],
            n=1,
            **sample_kwargs,
        )
        if not completions:
            return None

        completion = completions[0]
        output_tokens = list(completion.full_tokens)[completion.prompt_len:]
        reward = score_output(sample_prompt, output_tokens)

        return RolloutSample(
            tokens=list(completion.full_tokens),
            # Populate rollout logprobs and mask exactly as required by
            # the pinned cookbook version.
            reward=reward,
        )

    return rollout_fn
```

This is deliberately conceptual: copy the exact constructor fields from the pinned cookbook commit because the docs warn that its protocol may change.

### 14.3 Synchronous versus asynchronous

For strict on-policy behavior, use the cookbookâ€™s synchronous mode and zero tolerated head-version lag, according to the pinned versionâ€™s configuration. In asynchronous mode, permit only a bounded number of stale policy versions and monitor off-policy rejection.

Start synchronously for correctness. Move to asynchronous only after proving:

- Weight sync works.
- Version metadata is correct.
- Off-policy gating is observable.
- Throughput is actually the bottleneck.

### 14.4 Policy objectives

The current cookbook documents options such as GRPO, importance sampling, REINFORCE, DAPO, DRO, GSPO, and CISPO. The Training API also permits a custom token-level objective.

For the first run:

- Use a documented recipe default.
- Keep learning rate conservative.
- Use enough sibling rollouts for reward spread.
- Log clipping, importance ratios, KL, sequence lengths, and gradient norms when exposed.
- Avoid changing objective and task distribution simultaneously.

### 14.5 Weight synchronization

A correct on-policy loop is:

```text
sample with checkpoint k
â†’ grade trajectories
â†’ update trainer from checkpoint k data
â†’ optimizer step creates checkpoint k+1
â†’ save checkpoint for sampler
â†’ hotload/refresh sampler to k+1
â†’ sample next trajectories with checkpoint k+1
```

A stale sampler silently breaks the intended loop. Every rollout record should include the sampler/checkpoint version, and the run should assert that the next batch sees the newly promoted version.

### 14.6 Resource lifecycle

Training API code must explicitly handle:

- Trainer creation/attachment.
- Deployment creation/attachment.
- Scale-up readiness.
- Checkpoint save and hotload.
- Exceptions and retries.
- Cleanup or scale-to-zero.

Keep resources alive during debugging only when intentional; otherwise cleanup avoids surprise cost.

---

## 15. HUDâ€™s direct Fireworks RL cookbook

Source: [HUD Fireworks RL training cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/fireworks-rl-training).

### 15.1 Architecture

The cookbook follows this sequence:

1. Create a `FiretitanServiceClient` from Fireworks configuration.
2. Create a deployment sampler for high-parallel rollout generation.
3. Generate and locally grade HUD-style tasks.
4. Call `forward_backward_custom(...)` and `optim_step(...)`.
5. Save weights for the sampler and refresh it.

It **does not** use Fireworks managed datasets or RFT jobs.

### 15.2 Setup

```env
FIREWORKS_API_KEY=...
FIREWORKS_ACCOUNT_ID=...
```

```bash
uv sync --pre
```

### 15.3 Calibration

```bash
uv run train.py --calibrate-only \
  --groups-per-step 8 \
  --rollouts-per-prompt 10 \
  --parallelism 32
```

The published cookbook example shows a nontrivial arithmetic calibration around mean 0.22 and standard deviation 0.42 after reducing task difficulty. That number is illustrative, not transferable to another model/task.

### 15.4 First real run

```bash
uv run train.py --steps 5 \
  --groups-per-step 8 \
  --rollouts-per-prompt 8 \
  --parallelism 32
```

For the first deadline run, a few steps are preferable to an ambitious job that never reaches step one. The acceptance criterion is a completed update plus a verified sampler refresh.

### 15.5 Published defaults and caveats

The cookbook currently shows Qwen3 8B full-parameter examples with resources resembling:

- `accounts/fireworks/models/qwen3-8b`
- `Qwen/Qwen3-8B`
- `accounts/fireworks/trainingShapes/qwen3-8b-128k`

Treat these as examples; select only model/shape resources enabled for the account.

The README also records an account-specific preview error involving a missing Unkey inference configuration. That is a historical/control-plane blocker on the named preview account, not a universal Fireworks limitation. When a trainer fails before any rollout or loss code executes, send the exact account, trainer ID, timestamp, and error to Fireworks support rather than rewriting the training algorithm.

### 15.6 When this bridge is the best route

Use it when:

- The HUD task/grader logic is already valuable.
- High-parallel Fireworks sampling is needed.
- A custom GRPO/loss implementation is required.
- The team is comfortable owning checkpoint/sampler lifecycle.
- Training API preview access is confirmed.

Use HUD-native training instead when minimizing operational surface is more important than custom Fireworks control.

---

## 16. SFT â†’ RFT hybrid strategy

### 16.1 When to warm-start

Use a small SFT warm start when the base model:

- Never emits valid tool calls.
- Cannot follow the output protocol.
- Cannot complete even the easiest task variant.
- Produces all-zero rewards because it never reaches a gradable state.

Do not use SFT merely to force a desired percentage if task calibration can solve the problem without demonstrations.

### 16.2 Suggested sequence

```text
Base model
â†’ 10Ã— task calibration
â†’ if all-zero due to protocol failure: small curated SFT
â†’ deploy/fork SFT checkpoint
â†’ repeat 10Ã— calibration on the SFT model
â†’ tune tasks back to 20â€“50% with within-task variance
â†’ launch RFT
â†’ evaluate frozen held-out set after every checkpoint interval
```

### 16.3 Demonstration selection

SFT data should show:

- Correct tool syntax and sequencing.
- Representative task families.
- Recovery from common environment errors.
- Concise reasoning/output consistent with token budgets.
- No hidden evaluator exploit.

Avoid filling the dataset with only easy canonical examples; that can produce brittle imitation and erase exploration diversity.

### 16.4 Preserve a clean baseline

Keep separate resources for:

- Untuned base.
- SFT checkpoint.
- RFT fork from SFT.
- RFT fork directly from base, when budget allows.

This supports ablation: did improvement come from demonstrations, reward optimization, or merely task drift?

---

## 17. Monitoring, checkpointing, and rollback

### 17.1 Minimum metrics

Log at both per-rollout and per-update granularity.

#### Rollout/task metrics

- Task ID/family/split.
- Reward, component rewards, success.
- Group mean/std/min/max.
- Zero-variance group indicator.
- Valid/error/timeout rates.
- Prompt/output token count.
- Tool steps and environment latency.
- Model/checkpoint/sampler version.

#### Optimization metrics

- Policy loss.
- Learning rate.
- KL to reference when used.
- Clip fraction.
- Importance-ratio summaries.
- Gradient norm.
- Effective tokens/samples.
- Dropped/off-policy/zero-variance sample counts.
- Checkpoint ID and promotion time.

#### Product metrics

- Frozen held-out reward.
- Per-family held-out reward.
- Format/tool validity.
- Cost and wall-clock throughput.

### 17.2 Fireworks managed monitoring caveat

The [Fireworks monitoring guide](https://docs.fireworks.ai/fine-tuning/monitor-training) provides reward/loss/job status and rollout inspection. Its documented managed dashboard does not necessarily expose every low-level diagnosticâ€”such as full advantage distributions, every importance ratio, or all zero-variance filtering internals. Use W&B or the low-level Training API when those diagnostics are required.

### 17.3 Checkpoint policy

Checkpoint often enough to:

- Recover before collapse.
- Compare held-out performance over time.
- Detect reward hacking early.
- Stop once marginal gains disappear.

Every checkpoint evaluation must use a frozen environment/grader and fixed sampling configuration.

### 17.4 Rollback triggers

Rollback or stop when:

- Held-out reward falls materially.
- Reward increases only on training tasks.
- Output length explodes without semantic gain.
- Tool/error rates increase.
- KL/importance ratios spike.
- Reward variance collapses.
- Manual trajectory review finds evaluator exploitation.

---

## 18. Failure-mode playbook

| Symptom | Likely cause | Action |
|---|---|---|
| All rewards 0 | Task too hard, format mismatch, grader bug, truncation, tool failure | Validate known-good fixture; inspect raw trajectories; simplify task; increase budget; fix parser; use small SFT only if protocol behavior is absent. |
| All rewards 1 | Task too easy, leakage, weak grader | Add harder parameters and adversarial cases; remove hints; verify semantic final state. |
| Global mean 20â€“50%, but each task constant | Easy/impossible mixture | Compute per-task/group stats; redesign task parameters; discard zero-variance groups. |
| Managed RFT stops early | Uniform rollout scores or invalid evaluator | Confirm evaluator range and model diversity; inspect Fireworks job status/rollouts. |
| Reward rises, held-out does not | Overfitting, leakage, reward hacking | Freeze task contract; inspect successes; harden grader; restore checkpoint. |
| Next rollout behaves like old model | Stale head/sampler/deployment | Log checkpoint version; explicitly promote/hotload; assert next batch version. |
| HUD update rejects batch | Batch length/group-size mismatch or missing trajectory data | Ensure batch divides evenly; use gateway/token IDs; inspect run traces/trace IDs. |
| Fireworks trainer fails before step 0 | Access, quota, training-shape, secret, or control-plane issue | Confirm private-preview enablement; send account/resource/error details to Fireworks. |
| Custom loss has no gradient | Detached/re-wrapped tensors or wrong mask | Build loss from returned differentiable tensors; unit-test nonzero gradients. |
| High timeout rate | Slow evaluator/environment, too much concurrency | Profile, cache, add timeouts, reduce concurrency, separate infra errors. |
| Async RL rejects many samples | Excessive policy staleness | Reduce allowed lag, improve sync frequency, lower rollout queue depth, start synchronous. |
| SFT step count unexpected | Wrong batch field/config | Follow V2 recipeâ€™s documented `batch_size`; do not rely on ignored `batch_size_samples`. |

---

## 19. Sunday launch checklist

### Before midnight Saturday

- [ ] Freeze repository Git SHA.
- [ ] Freeze environment image digest or deployment version.
- [ ] Freeze grader version and test fixtures.
- [ ] Freeze model ID/checkpoint and sampling configuration.
- [ ] Confirm HUD/Fireworks credentials are stored as secrets.
- [ ] Confirm account quota and Training API preview access where needed.
- [ ] Run every candidate task approximately ten times.
- [ ] Produce per-task mean/std/unique-reward table.
- [ ] Remove or retune all-zero/all-one tasks.
- [ ] Manually inspect successes and failures for each task family.
- [ ] Freeze calibration/train/held-out splits.
- [ ] Redeem available hacker credits and send support request for additional quota/access.

### Before 8:00 AM PDT Sunday, June 21, 2026

- [ ] Launch the smallest real training job that can complete at least one update.
- [ ] Record job/model/trainer/deployment/taskset IDs.
- [ ] Confirm first rollout batch completed.
- [ ] Confirm within-group reward variance.
- [ ] Confirm forward/backward and optimizer step completed.
- [ ] Confirm checkpoint/head changed.
- [ ] Confirm the next rollout uses new weights.
- [ ] Run at least one frozen held-out evaluation.
- [ ] Preserve raw logs and a one-command reproduction path.

### Before the 1:00 PM submission deadline

- [ ] Compare base versus latest checkpoint on frozen held-out tasks.
- [ ] Report mean plus distributionâ€”not only best examples.
- [ ] Include failed/error/timeout rates.
- [ ] Include at least one manual trajectory review.
- [ ] Document model, checkpoint, environment, grader, and code versions.
- [ ] Stop/scale down unused resources.

---

## 20. Credits and access request template

The [hackathon page](https://www.hud.ai/hackathon) currently lists hacker-credit codes:

- HUD: `YC-RL-HACKATHON` for the pageâ€™s stated HUD credit offer.
- Fireworks: `HUD-HACK-2026` for the pageâ€™s stated Fireworks credit offer.

Commercial offers and eligibility can change; verify redemption in the applicable dashboard/team channel.

Use this message when requesting credits or enablement:

```text
Subject: Hackathon training credits/access â€” <team/project>

Platform path:
- HUD TrainingClient / Fireworks managed RFT / Fireworks Training API / other

Account/project:
- <account ID, workspace, or HUD project>

Base model and intended output model:
- <exact resource IDs>

Task readiness:
- <N> tasks
- ~10 calibration runs per task on <exact checkpoint>
- Overall reward mean/std: <...>
- Median per-task mean/std: <...>
- Zero-variance group rate: <...>
- Valid/error/timeout rate: <...>

Expected first run:
- Steps/prompts/groups/rollouts: <...>
- Max tokens and concurrency: <...>
- Training/deployment shape if applicable: <...>

Access or credit requested:
- <credit amount, GPU quota, Training API private-preview enablement,
  trainable model fork, model/shape compatibility confirmation>

Current blocker/error:
- <exact error, timestamp, job/trainer/deployment ID>

Deadline:
- First real run must start by 8:00 AM PDT Sunday, June 21, 2026.
```

For Fireworks Training API, explicitly ask for:

- Training API/private-preview enablement.
- Compatible training shape and deployment shape.
- Full-parameter versus LoRA support for the chosen model.
- Trainer/deployment quota.
- Expected checkpoint/hotload path.
- Credit allocation.

For HUD, explicitly ask for:

- Trainable model availability/fork permission.
- Credit allocation.
- Correct model slug.
- Taskset/runtime readiness.
- Any account-specific trainer restrictions.

---

## 21. Reproducibility manifest

Create `run_manifest.json` before launch:

```json
{
  "created_at": "2026-06-21T07:30:00-07:00",
  "project": "example",
  "code": {
    "git_sha": "...",
    "dirty": false,
    "hud_python_version": "...",
    "fireworks_ai_version": "...",
    "eval_protocol_version": "...",
    "fireworks_cookbook_sha": "..."
  },
  "taskset": {
    "id": "...",
    "split_hashes": {
      "calibration": "sha256:...",
      "train": "sha256:...",
      "heldout": "sha256:..."
    },
    "environment_image_digest": "sha256:...",
    "grader_version": "..."
  },
  "policy": {
    "provider": "hud|fireworks",
    "model_id": "...",
    "checkpoint_id": "...",
    "temperature": 0.8,
    "top_p": 0.95,
    "top_k": 40,
    "max_tokens": 4096
  },
  "calibration": {
    "runs_per_task": 10,
    "records_path": "artifacts/calibration.jsonl",
    "summary_path": "artifacts/calibration.tsv"
  },
  "training": {
    "path": "hud-training-client|fireworks-managed-rft|fireworks-training-api",
    "group_size": 8,
    "groups_per_step": 8,
    "learning_rate": 0.00001,
    "loss": "grpo-or-exact-objective",
    "steps": 5
  },
  "resources": {
    "job_id": "...",
    "trainer_id": "...",
    "deployment_id": "...",
    "output_model_id": "..."
  }
}
```

Also archive:

- Raw trajectories or trace references.
- Calibration summary.
- Exact launch command.
- Environment variables with secret values redacted.
- Evaluator fixtures and results.
- Checkpoint evaluation table.
- Cost/usage export.

---

## 22. Verified documentation map

The URLs below were browser-opened during research on **2026-06-20**. Product interfaces and documentation can still change after that date.

### HUD hackathon and repository

- [HUD hackathon page](https://www.hud.ai/hackathon)
- [HUD Python repository](https://github.com/hud-evals/hud-python)
- [HUD-native RL training cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/rl-training)
- [HUD direct Fireworks RL training cookbook](https://github.com/hud-evals/hud-python/tree/main/cookbooks/fireworks-rl-training)

### HUD v6 documentation

- [HUD v6 quickstart](https://docs.hud.ai/v6/start/quickstart)
- [Build overview](https://docs.hud.ai/v6/build/overview)
- [Protocol](https://docs.hud.ai/v6/core/protocol)
- [Environments](https://docs.hud.ai/v6/core/environment)
- [Tasks and tasksets](https://docs.hud.ai/v6/core/tasks)
- [Capabilities](https://docs.hud.ai/v6/core/capabilities)
- [Agents](https://docs.hud.ai/v6/core/agents)
- [Runtime and deployment](https://docs.hud.ai/v6/core/runtime)
- [Graders](https://docs.hud.ai/v6/core/graders)
- [Task-design advice](https://docs.hud.ai/v6/core/advice)
- [Training](https://docs.hud.ai/v6/core/training)
- [Types](https://docs.hud.ai/v6/core/types)
- [CLI](https://docs.hud.ai/v6/core/cli)
- [Extending HUD](https://docs.hud.ai/v6/advanced/extending)
- [Migrate to v6](https://docs.hud.ai/v6/more/migrate-v6)
- [HUD complete documentation index](https://docs.hud.ai/llms.txt)

### Fireworks training overview

- [Training overview](https://docs.fireworks.ai/fine-tuning/finetuning-intro)
- [Managed fine-tuning overview](https://docs.fireworks.ai/fine-tuning/managed-finetuning-intro)
- [Fireworks complete documentation index](https://docs.fireworks.ai/llms.txt)
- [Fireworks cookbook repository](https://github.com/fw-ai/cookbook)
- [Fireworks training recipes](https://github.com/fw-ai/cookbook/tree/main/training/recipes)

### Fireworks managed SFT

- [Supervised fine-tuningâ€”text](https://docs.fireworks.ai/fine-tuning/fine-tuning-models)
- [Debug SFT tokenization](https://docs.fireworks.ai/fine-tuning/debug-sft-tokenization)
- [Supervised fine-tuningâ€”vision](https://docs.fireworks.ai/fine-tuning/fine-tuning-vlm)
- [Weighted training](https://docs.fireworks.ai/fine-tuning/weighted-training)
- [Deploy fine-tuned models](https://docs.fireworks.ai/fine-tuning/deploying-loras)
- [Create SFT job API](https://docs.fireworks.ai/api-reference/create-supervised-fine-tuning-job)
- [Get SFT job API](https://docs.fireworks.ai/api-reference/get-supervised-fine-tuning-job)

### Fireworks managed RFT

- [RFT overview](https://docs.fireworks.ai/fine-tuning/reinforcement-fine-tuning-models)
- [How RFT works](https://docs.fireworks.ai/fine-tuning/how-rft-works)
- [Evaluators](https://docs.fireworks.ai/fine-tuning/evaluators)
- [Math-solver RFT quickstart](https://docs.fireworks.ai/fine-tuning/quickstart-math)
- [Remote-agent/SVG quickstart](https://docs.fireworks.ai/fine-tuning/quickstart-svg-agent)
- [Agent tracing](https://docs.fireworks.ai/fine-tuning/environments)
- [Connect remote environments](https://docs.fireworks.ai/fine-tuning/connect-environments)
- [Use secrets in evaluators](https://docs.fireworks.ai/fine-tuning/using-secret-in-evaluator)
- [RFT CLI reference](https://docs.fireworks.ai/fine-tuning/cli-reference)
- [Training prerequisites and validation](https://docs.fireworks.ai/fine-tuning/training-prerequisites)
- [RFT parameter tuning](https://docs.fireworks.ai/fine-tuning/parameter-tuning)
- [Monitor training](https://docs.fireworks.ai/fine-tuning/monitor-training)
- [RFT cost estimator](https://docs.fireworks.ai/fine-tuning/rft-cost-estimator)
- [RFT parameter reference](https://docs.fireworks.ai/fine-tuning/rft-parameters-reference)
- [Secure fine-tuning/BYOB](https://docs.fireworks.ai/fine-tuning/secure-fine-tuning)
- [Create RFT job API](https://docs.fireworks.ai/api-reference/create-reinforcement-fine-tuning-job)
- [Get RFT job API](https://docs.fireworks.ai/api-reference/get-reinforcement-fine-tuning-job)

### Fireworks low-level Training API

- [Training API introduction](https://docs.fireworks.ai/fine-tuning/training-api/introduction)
- [Training API quickstart](https://docs.fireworks.ai/fine-tuning/training-api/quickstart)
- [Training and sampling lifecycle](https://docs.fireworks.ai/fine-tuning/training-api/training-and-sampling)
- [Loss functions](https://docs.fireworks.ai/fine-tuning/training-api/loss-functions)
- [Saving and loading](https://docs.fireworks.ai/fine-tuning/training-api/saving-and-loading)
- [Training shapes](https://docs.fireworks.ai/fine-tuning/training-api/training-shapes)
- [Vision inputs](https://docs.fireworks.ai/fine-tuning/training-api/vision-inputs)
- [Cookbook overview](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/overview)
- [SFT cookbook](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/sft)
- [RL cookbook](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/rl)
- [Cookbook reference](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/reference)
- [Weight synchronization](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/weight-sync)
- [Checkpoint handling](https://docs.fireworks.ai/fine-tuning/training-api/cookbook/checkpoints)
- [Service client reference](https://docs.fireworks.ai/fine-tuning/training-api/reference/service-client)
- [Deployment sampler reference](https://docs.fireworks.ai/fine-tuning/training-api/reference/deployment-sampler)
- [Cleanup reference](https://docs.fireworks.ai/fine-tuning/training-api/reference/cleanup)

---

## Final recommendation

For the deadline, prefer the shortest path that proves a **real on-policy update**:

1. Finish and freeze HUD tasks/graders.
2. Run each task about ten times on the exact policy.
3. Select tasks with per-task/group mean reward near 0.20â€“0.50 and genuine sibling variance.
4. Launch a small HUD-native run if the HUD model is trainable.
5. Use Fireworks managed SFT for demonstrations, managed RFT for a standard evaluator-driven job, or the Training API only when its extra control is required and preview access is confirmed.
6. Verify checkpoint promotion and that the next rollout samples the updated weights.
7. Protect a held-out split and inspect trajectories for reward hacking before scaling.
