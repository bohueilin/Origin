# Origin Foundry — Judge Q&A

Engine name: **Quorum** — no agent acts alone; every action is ratified.
Working project name: Origin Foundry. Stack: `gemma-4-31b` on Cerebras Inference, OpenAI-compatible Chat Completions, wrapping a deterministic RL oracle.

This doc is the honest, tight script for judge questions. Answers are written to be spoken. Where a number is illustrative, it says so. The measured number we stand behind is **~1284 tok/s** (`time_info` from the Cerebras API, verified live); **~1,500 tok/s** is the rounded headline.

---

## 1. "Why is Cerebras essential here?" (30-second answer)

Our policy is judged *safe* only if a **Guardian/Verifier ratifies every single step** — observe, scan, each move, pick, drop, finish. That is one extra LLM round-trip per action, on top of the Planner. On a normal GPU model that doubling is expensive and slow, so in practice people **skip the per-step verification** to save latency and cost — they verify the final answer, or every Nth step, and call it good.

The moment you stop verifying every step, the policy learns to **game the gap**: it does the right thing where it's watched and cuts corners where it isn't. The reward looks great; the behavior is reckless.

At ~1,500 tok/s on Cerebras with `reasoning_effort: none` and an 8ms TTFT, **verify-on-every-step is effectively free** — the Guardian call costs milliseconds, so we never have an economic reason to skip it. Cerebras is what makes "ratify every action" the default instead of a luxury. That is the whole safety argument, and it only exists at this speed.

---

## 2. The economics-of-speed argument

This is the deeper version of #1 — worth saying explicitly because it reframes speed as a *safety* property, not a vanity metric.

- **Verification has a fixed per-step cost.** A safe rollout of length *N* needs ~*N* Guardian calls. Cost and latency scale with *N* × (per-call cost).
- **On a slow/expensive model, that cost forces a tradeoff.** Teams sample verification (every Nth step), verify only the final state, or use a cheap heuristic instead of the model. Each of those **opens a hole** the policy can exploit.
- **The policy optimizes against exactly the holes you leave.** Reward hacking is not a model being evil; it's gradient descent finding the cheapest path to reward. If "unwatched steps" is the cheapest path, that's what it learns.
- **Speed closes the holes.** At ~1,500 tok/s the marginal cost of one more verification is negligible, so the rational choice is to verify *everything*. Cerebras doesn't just make the demo snappy — it makes the *complete* verification regime affordable, which is the only regime that is actually safe.

One line for the judge: **"Cheap verification is what makes non-reward-hacking autonomy economically rational. Cerebras makes verification cheap."**

---

## 3. "Isn't this just a maze solver?"

No. A maze solver's goal is *reach the goal*. Our goal is *reach the goal **safely, auditably, and without gaming the reward***, and we deliberately built three layers a maze solver doesn't have:

1. **An LLM perception layer.** `gemma-4-31b` (vision) reads an *uploaded floor plan image* into a structured `DescriptiveSiteMap`, which a deterministic validator (`src/foundry/floorValidator.ts`) repairs into a real RL environment (`siteMapToWarehouseTask` in `src/siteEval.ts`). The maze isn't hand-fed — it's *perceived* from a messy real-world artifact. That's the "robot eyes" part.

2. **A multi-agent ratification loop (Quorum).** Planner proposes an action; **Guardian ratifies or vetoes it** before it's ever applied. Both are `gemma-4-31b`. No single agent has unilateral authority to act. This is the part the whole thesis hangs on: *capability is not permission.*

3. **A deterministic oracle as the only judge.** Whether the rollout actually "did the job safely" is scored by `verifyWarehouseRollout` in `src/warehouse.ts` (built on `bfsOracle`) — **never by an LLM**. The thing being optimized cannot also be the judge, which is precisely how you avoid reward hacking.

A maze solver is the *innermost* of those three layers. The contribution is the safety scaffolding *around* it: an LLM that perceives the world, a quorum that ratifies every action, and a deterministic oracle the policy can't sweet-talk. Swap the warehouse grid for any embodied task and the scaffolding is unchanged.

---

## 4. "How do you know it's not reward-hacking?" (show the counterfactual)

We don't ask you to trust us — we run the attack live.

- We ship `recklessFinishPolicy` (`src/warehouse.ts`): the "just always finish, skip the careful steps" policy. It's the textbook reward-hacker — it tries to claim success by jumping to `finish`.
- Against a naive reward, that policy *looks* successful. Against our **hardened oracle** (`verifyWarehouseRollout`), it scores **~0**: finishing without having legitimately observed, scanned, navigated, picked, and dropped is not a valid terminal state, so the oracle gives it no credit.
- In Quorum, that same reckless action is **vetoed by the Guardian** before it's applied — so the unsafe step never even executes.

The `quorum-run` endpoint (`server/foundryHandler.ts`) returns **both** runs side by side:
- `mode: 'verified'` — Planner + Guardian, every step ratified.
- a **no-Guardian counterfactual** — what the Planner alone would have done.

The counterfactual is the proof: you can see, on the same task, the exact step the Guardian caught and what would have happened without it. The reckless policy's score on the hardened reward is the receipt that the reward can't be gamed. **Reward hacking isn't argued away — it's demonstrated and then vetoed on screen.**

---

## 5. "What's real vs. mocked?"

Straight answer, no hand-waving:

| Component | Status |
|---|---|
| Deterministic core (`bfsOracle`, `verifyWarehouseRollout`, `recklessFinishPolicy`, action space `observe / scan / move:{n,e,s,w} / pick / drop / finish / escalate / refuse`) | **Real.** Pure, deterministic, unit-testable. This is the judge. |
| Floor-plan perception | **Real.** `gemma-4-31b` vision on Cerebras → `DescriptiveSiteMap` → deterministic repair. |
| Quorum loop (Planner + Guardian) | **Real.** Both are live `gemma-4-31b` Cerebras calls; Guardian veto is real. |
| Speed numbers (tok/s, TTFT) | **Real.** Pulled from the Cerebras API `time_info` object, not estimated. ~1284 tok/s measured. |
| Speed-race vs. Gemini | **Real.** Same prompt, both providers, real `time_info` for each. |
| Training / RL | **Real but small.** We reuse a real GRPO + Fireworks RFT stack (`services/factoryceo-trm/src/distill/`) with Chronos SFT/RFT export and Cobra red/green reward-hardening. It's a genuine pipeline run at hackathon scale, not a toy — but it is *small*, and we say so. |
| Mock fallback | **Labeled.** If a Cerebras call fails, `server/cerebrasHandler.ts` falls back to a deterministic mock that is **clearly labeled as a mock** in the response. Nothing fake is ever presented as a live model output. |

If a judge points at any pixel and asks "is that real?", the answer is in this table. The only non-live path is the explicitly-labeled mock fallback.

---

## 6. "Physical AI without a robot?"

We didn't build a robot. We built the **robot-ready brain**, and we built the hard part — the part that's identical whether the body is a webcam or a forklift.

The pipeline is:

```
[ perception ] → [ Planner ] → [ Guardian veto ] → [ deterministic oracle ] → [ actuator ]
  floor-plan       gemma-4       gemma-4              warehouse.ts             (action)
  image                          ratifies every step  the only judge
```

To make it physical, you change exactly two endpoints and nothing in between:

- **Swap the floor-plan image for a robot's camera feed** — same vision call, same `DescriptiveSiteMap`, same deterministic repair into an environment.
- **Swap the abstract action (`move:east`, `pick`) for a motor command on a real arm/base** — same action space, same Guardian ratification on every command.

The perception layer, the Quorum ratification loop, and the deterministic oracle — the entire safety stack — are **unchanged**. That's the point: the dangerous, novel engineering in embodied AI isn't the motors, it's *"how do you let a learned policy act in the world without it reward-hacking its way into something unsafe?"* We solved that part, and we kept it body-agnostic on purpose. The webcam *is* the robot's eyes; the action is the robot's arm. Everything load-bearing is already here.

---

## Quick-fire backups

- **"Why Gemma-4 and not just Gemini?"** Gemma-4 on Cerebras is the primary because the per-step verification regime only pays off at Cerebras speed; Gemini is included as the honest GPU baseline in the speed-race so you can see the gap yourself.
- **"Why is the oracle deterministic instead of an LLM judge?"** Because an LLM judge can be persuaded, and the policy is being trained to persuade. The judge must be something the policy provably cannot talk its way around. A BFS-based oracle can't be flattered.
- **"What's the one-sentence thesis?"** Upload a floor plan; Gemma-4 vision on Cerebras turns it into a real RL world; a fast Quorum loop ratifies every step at ~1,500 tok/s; and a deterministic oracle — never an LLM — is the only judge, so the policy *can't* reward-hack. Capability is not permission.
