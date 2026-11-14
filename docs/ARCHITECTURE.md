# Origin Physical AI — Architecture

One system, three planes, one invariant: **capability is never permission.** In this design a deterministic
control plane decides what an agent or robot may do. On the public site that runtime gate is proposed
architecture; what runs today is the synthetic reference check. The same trust spine runs from the physical
(robot readiness) to the digital (agent autonomy) to the research loop that hardens the reward signals.

## Layered view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ① INTENT — humans + agents express what they want (voice / text / a robot site)│
│     apps/origin-web (reference check)   ·   apps/janus (agent tasks)        │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │   intent (no authority yet)
┌───────────────▼──────────────────────────────────────────────────────────────┐
│  ② CONTROL PLANE — the moat. proposes a plan, then GATES it.                    │
│     • planner (LLM proposes)        • capability engine: read ≠ commit          │
│     • deterministic verifier/oracle (the ONLY judge — never an LLM)             │
│     • approval gate (one-shot human OK)                                         │
│     • tamper-evident audit + evidence record                                    │
│     packages/verifier-core · packages/evidence  (extracted over time)          │
└───────────────┬───────────────────────────────────┬──────────────────────────┘
                │ scoped, revocable grant            │ synthetic floor evaluation (no tier)
┌───────────────▼─────────────────────────┐ ┌───────▼──────────────────────────┐
│  ③ AUTHORITY / BROKER (server-side only) │ │  ③ PROVING GROUND (deterministic) │
│     mint ephemeral lease → opaque handle │ │     fleet sim, counts collisions   │
│     resolve secret JIT at tool boundary  │ │     finish / escalate / refuse     │
│     apps/janus/server                    │ │     apps/origin-web (warehouse)    │
└───────────────┬─────────────────────────┘ └────────────────────────────────────┘
                │ brokered call (secret never in model)
┌───────────────▼──────────────────────────────────────────────────────────────┐
│  ④ WORLD — payments, messaging, calendars, robots                               │
│     payment, chat and notification APIs · app backend · (future) robot fleets   │
└────────────────────────────────────────────────────────────────────────────────┘

   RESEARCH LOOP that protects the control plane's judgments (it hunts for ways to game the graders):
   services/cobra  (red-team → patch verifiers)  ⇄  services/chronos (find reward hacks → freeze
   as regression tests → harden grader)  →  hardened verifiers feed back into ②.
```

## Trust boundaries (the lines that must never be crossed)
- **Secret never enters the model/agent context** — resolved in ③ (broker) at the call boundary, gone when the call returns.
- **The client never holds a credential** — only opaque handles + redacted results.
- **Capability ≠ permission** — a read/plan grant can never escalate to a side-effect (spend, message, deploy) without a one-shot human approval in ②.
- **The judge is deterministic** — evaluation verdicts come from a pure oracle, never an LLM, so they're reproducible; the deterministic oracle decides the pass, not a model.

## Request lifecycle (one real action, end to end)
intent → plan → capability check → scoped grant → (side-effect?) human approval → brokered call (secret JIT) → redacted result → audit/evidence record.

## Why the research loop matters
The control plane's judgments are only as good as its **reward/verifier signal.** Cobra and
Chronos continuously stress-test and patch the very graders the control plane relies
on — turning "the agent learned to cheat the metric" into a caught, frozen, regression-tested failure.
