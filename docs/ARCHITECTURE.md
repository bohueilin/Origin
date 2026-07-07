# Origin Physical AI — Architecture

One system, three planes, one invariant: **a deterministic, auditable control plane decides what an
agent or robot may do — capability is never permission.** The same trust spine runs from the physical
(robot readiness) to the digital (agent autonomy) to the research loop that hardens the reward signals.

## Layered view

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  ① INTENT — humans + agents express what they want (voice / text / a robot site)│
│     apps/origin-web (readiness)   ·   apps/passport (agent tasks)              │
└───────────────┬──────────────────────────────────────────────────────────────┘
                │   intent (no authority yet)
┌───────────────▼──────────────────────────────────────────────────────────────┐
│  ② CONTROL PLANE — the moat. proposes a plan, then GATES it.                    │
│     • planner (LLM proposes)        • capability engine: read ≠ commit          │
│     • deterministic verifier/oracle (the ONLY judge — never an LLM)             │
│     • approval gate (one-shot human OK)   • tamper-evident audit + license      │
│     packages/verifier-core · packages/evidence  (extracted over time)          │
└───────────────┬───────────────────────────────────┬──────────────────────────┘
                │ scoped, revocable grant            │ readiness license (RSL + FAR/FRR)
┌───────────────▼─────────────────────────┐ ┌───────▼──────────────────────────┐
│  ③ AUTHORITY / BROKER (server-side only) │ │  ③ PROVING GROUND (deterministic) │
│     mint ephemeral lease → opaque handle │ │     multi-robot collision-free sim │
│     resolve secret JIT at tool boundary  │ │     finish / escalate / refuse     │
│     apps/passport/server · 1Password     │ │     apps/origin-web (warehouse)    │
└───────────────┬─────────────────────────┘ └────────────────────────────────────┘
                │ brokered call (secret never in model)
┌───────────────▼──────────────────────────────────────────────────────────────┐
│  ④ WORLD — payments, messaging, calendars, robots                               │
│     Snaplii · Discord · ntfy · InsForge · (future) robot fleets                 │
└────────────────────────────────────────────────────────────────────────────────┘

   RESEARCH LOOP that protects the control plane's judgments (so the graders can't be gamed):
   services/cobra  (red-team → patch verifiers)  ⇄  services/chronos (find reward hacks → freeze
   as regression tests → harden grader)  →  hardened verifiers feed back into ②.
```

## Trust boundaries (the lines that must never be crossed)
- **Secret never enters the model/agent context** — resolved in ③ (broker) at the call boundary, gone when the call returns.
- **The client never holds a credential** — only opaque handles + redacted results.
- **Capability ≠ permission** — a read/plan grant can never escalate to a side-effect (spend, message, deploy) without a one-shot human approval in ②.
- **The judge is deterministic** — readiness/eval verdicts come from a pure oracle, never an LLM, so they're reproducible and can't be talked into a pass.

## Request lifecycle (one real action, end to end)
intent → plan → capability check → scoped grant → (side-effect?) human approval → brokered call (secret JIT) → redacted result → audit/license.

## Why the research loop matters
The control plane is only safe if the **reward/verifier signal can't be gamed.** Cobra and
Chronos continuously stress-test and patch the very graders the control plane relies
on — turning "the agent learned to cheat the metric" into a caught, frozen, regression-tested failure.
