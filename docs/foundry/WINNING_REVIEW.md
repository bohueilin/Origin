# Winning review — what to build to make Cerebras's inference edge decisive

*4-agent review (winning criteria + inference-advantage demo ranking + why-Cerebras case), adversarially
vetted. 2026-06-28.*

## Verdict
Origin already proves **raw speed three ways** — the tok/s **leaderboard** (gemma-4-31b 1096 vs 58–164 for the
GPU field), the **loop-race** throughput, and the live **injection-veto** triage. That's table-stakes; judges
have seen "we're faster" a hundred times. **The unwon ground — and the thing Cerebras itself sells — is that
speed buys CORRECTNESS and SAFETY a GPU can't afford in the same wall-clock.** Reframe the whole demo from
*"faster"* to *"the GPU is forced to choose between fast and safe; on Cerebras verification is free, so it
refuses the tradeoff."* Every build below reuses primitives that already exist and are verified live
(`triage()`, `guard()`, the deterministic `scoreIncident` floor, the `INCIDENTS` injection fixtures, real
`time_info` tok/s + totalMs, the `Promise.all` fan-out in `leaderboardHandler.ts`).

## The 12 inference-advantage demos, ranked
`Wow / Honesty / Rubric-fit` each /5, `Hrs` = build time.

| # | Build | Wow | Honesty | Rubric | Hrs | Status |
|---|---|---|---|---|---|---|
| 1 | **Safety-tax head-to-head** (GPU one-shot breaches; Cerebras verify+retry safe under one clock) | 5 | 5 | 5 | 3–5 | ✅ **BUILT** (`/api/foundry/soc-shootout`, `/soc`) |
| 2 | **Accuracy-at-fixed-budget dial** (slider = ms; Cerebras accuracy curve dominates) | 5 | 5 | 5 | 3–4 | proposed |
| 3 | **Ensemble-of-N Guardians** (N votes in 1 GPU-Guardian's time; missed-injection rate → 0) | 5 | 4 | 5 | 2–4 | proposed |
| 4 | **$ Economics panel** (incidents/min → cost/incident → analyst-shifts → $ saved) | 4 | 4 | 5 | 2–3 | proposed |
| 5 | **Reacts-before-I-finish** (veto fires mid-typing; real TTFT 3–8ms vs GPU spinner) | 5 | 4 | 4 | 2–3 | proposed |
| 6 | Self-consistency on injections (vote over K perceptions; catch-rate vs K) | 4 | 5 | 5 | 2–3 | proposed |
| 7 | Speculative/concurrent verification (Planner+Guardian parallel; ~0 added wall-time) | 4 | 4 | 4 | 2–3 | proposed |
| 8 | Curriculum/self-improvement-at-speed (reflect+retry N× vs 1×; pass-rate climbs) | 4 | 3 | 4 | 4–6 | skip under deadline |
| 9 | Latency-tax meter ("safety budget left in 500ms") | 4 | 4 | 4 | 2–3 | proposed |
| 10 | Depth-at-fixed-latency (Cerebras 'high' beats GPU 'none' on accuracy AND wall-time) | 3 | 5 | 4 | 2–3 | proposed |
| 11 | Fan-out red-team (M attacks + M defenses in one GPU-call window) | 4 | 3 | 4 | 3–5 | skip (correlated-sample risk) |
| 12 | Incident-storm / surge (burst 50; Cerebras drains, GPU backlog grows) | 4 | 4 | 3 | 3–4 | skip (load-test theater) |

## The "why Cerebras beats others" one-liners (for the deck + on screen)
- On a GPU, **safety is a latency tax you can't afford in production**; on Cerebras the tax is ~zero — so the safe agent is **also** the fast agent.
- Same time budget: the GPU had to **ship unsafe to be fast**. Cerebras was **safe AND done early**.
- A GPU gives you **one nervous reviewer**; for the same latency Cerebras gives you a **committee — and the committee doesn't miss**.
- The defense **reacts before the attack finishes typing** — only possible at Cerebras TTFT (~3–8ms, measured live).
- Speed isn't vanity — at ~1,100 tok/s the same SOC budget clears **~7× the queue**: incidents-per-dollar, not bragging rights.

## Do NOT build (traps / overclaims / time-sinks)
- **No video, no training ON Cerebras** — gemma-4-31b is image+text in / text out only. Any real weight-training stays on Fireworks/Modal and is labeled off-Cerebras.
- **Never let an LLM be the judge** — the deterministic `scoreIncident` floor is the only verdict.
- **Don't claim cross-family races measure silicon in isolation** — they measure the *platform*; caption as such. Reserve "apples-to-apples" for **Cerebras-vs-Cerebras at different budgets**.
- **Don't claim ensemble "eliminates" / "guarantees"** catching injections — samples are correlated; claim "reduces misses."
- **Don't hardcode any headline metric** (TTFT, tok/s, accuracy, $/incident) — every number must be live-measurable or a "show me that's real" question sinks it.
- **Don't build #8/#11/#12 under deadline** — ship the top 5 first.

## Track scorecard (where we stand)
- **Track 1 (Multiverse Agents):** strong — real multi-agent verifier loop + multimodal (vision on `/foundry`) + physical-AI proof. The safety-tax shootout sharpens the "verifier loop" rubric line.
- **Track 2 (People's Choice):** the **reacts-before-I-finish** clip (#5) is the missing viral 60s asset.
- **Track 3 (Enterprise Impact):** the **$ economics panel** (#4) is the number that lands the buyer.
