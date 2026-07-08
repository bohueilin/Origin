# Origin — Project Overview

> **Origin is a trust layer for Physical AI.** It turns site evidence into bounded Robot-Readiness Gyms, oracle-labeled hard cases, readiness metrics, and replayable evidence bundles — so teams can know whether an agent should **finish, escalate, or refuse** *before* a robot acts in the real world.
>
> **Model proposes. Environment verifies. Gate decides. Trace proves.**

## What Origin is
A control plane for autonomy with one non-negotiable rule: **capability is not permission.** A fast model may *propose* any action; a **deterministic oracle — never an LLM — ratifies it** before it can execute. Fast inference (gemma-4-31b on Cerebras) makes that per-step verification affordable, so the safety check rides on *every* step instead of being sampled around.

The same spine governs a **robot on a floor** (physical) and a **software agent with credentials** (digital): **identity → authority → verified action → trace**.

## Who it's for
- **Physical-AI / robotics teams** deciding if an agent is ready for a real site.
- **Agent / RL post-training teams** who need scores that *reproduce* and rewards that can't be hacked (Training Evidence).
- **Safety / governance owners** who must answer "why was this allowed / promoted?" with a re-derivable receipt.

## Startup thesis
Every autonomy demo shows a model that *can* act; none show what stops it from acting *wrong*. Origin makes the "what stops it" a **product**: a bounded gym + a deterministic verifier + a tamper-evident trace + a fail-closed gate. Safety is loop-bound — the cheaper per-step verification gets, the more unsafe completions you catch — which is exactly why fast inference turns verification from a cost you ration into a guarantee you can always afford.

## Current capabilities (all in this repo)
1. **Training Evidence** (`apps/origin-web/rlkit`) — reproducible **ScoreReceipts**: an EnvironmentBundle + a recorded action trace + a pinned verifier → a re-derivable, tamper-evident receipt (`env:verify`). Nine pillars (env-as-artifact, verified reward, executor/Daytona, MCP tool registry, cost+dispute, checkpoint, curriculum, promotion), 360 tests.
2. **The live site + consoles** (`apps/origin-web`) — `/foundry` (floor → gym → license), `/soc` (AI-SOC loop-race), `/rsi` (Gemma-proposes / Origin-verifies), deployed at `origin-physical-ai.pages.dev`.
3. **Janus** (formerly Passport) (`apps/passport`) — agentic credential broker + Autonomy Trace Console: delegated authority you can trust (identity → authority → veto).
4. **Verifier hardening** (`services/{chronos,cobra}`) — auto-harden RL verifiers against reward hacking (red-team → patch → measure).

## Evidence layers
- **Training evidence:** reproducible ScoreReceipts (`env:verify`), digest-valid examples in `apps/origin-web/docs/examples/`.

## How to run
```bash
make install && make gates          # install + build/test the TS surface
make dev-web                        # the live site locally (Vite :5275 + Hono :8787)
cd apps/origin-web && npm run env:verify     # a reproducible ScoreReceipt
```

## Claim boundaries (always preserved)
Bounded Robot-Readiness **Gym evidence**, not robot certification · deterministic oracle is the only label/reward authority · synthetic demo ≠ real customer proof · generated counterfactual ≠ customer-owned evidence · authorized fixture ≠ real customer data · **real customer readiness stays blocked** until approved real evidence passes gates · **training fail-closed** · external APIs blocked · learned-policy = route-summary/map-derived features, not raw perception · no production-autonomy claim · no deploy/push/stage without authorization.

## Consolidated from
`0619`/`0620`/`0620-test`/`Cerebras-0628`/`Chronos`/`Cobra` (already represented in `apps/`+`services/`) and `Cerebras-enterprise-0628` LoopForge + `agent-passport` (→ `legacy-imports/`). Future sessions start **only** from this repo.
