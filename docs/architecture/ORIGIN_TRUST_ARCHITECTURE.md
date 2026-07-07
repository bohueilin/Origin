# Origin — Trust Architecture

**Model proposes. Environment verifies. Gate decides. Trace proves.** One loop, applied to both a robot on a floor and a software agent with credentials.

## The loop
```
        ┌─────────────┐   proposes    ┌──────────────────┐   ratifies    ┌──────────────┐
 world →│  Proposer    │──────────────▶│ Deterministic     │──────────────▶│  Fail-closed  │
 (text/ │ (gemma-4 on  │   action      │ Oracle / Verifier │  allow/deny   │  Gate         │
 image) │  Cerebras)   │               │ (geometry/BFS,    │  (default-    │ finish/       │
        └─────────────┘               │  NEVER an LLM)    │   deny)       │ escalate/     │
              ▲                        └──────────────────┘               │ REFUSE        │
              │ next obs                        │ reward∈[0,1]             └──────┬───────┘
              │                                 ▼                                 │ executes only if allowed
              │                        ┌──────────────────┐   seals               ▼
              └────────────────────────│  Trace (hash-     │◀──────────  side effect (tool-call / actuator)
                        replay          │  chained) +       │
                                        │  ScoreReceipt     │──▶ env:verify → re-derive the score (can't fake)
                                        └──────────────────┘
```

## The four guarantees
1. **Environment is a versioned artifact.** A gym / EnvironmentBundle pins runtime, seed/task set, tool schemas, policies, and verifier version into one content-addressed digest. Change anything → the digest changes.
2. **The verifier is deterministic + human-owned.** Geometry/set-algebra + BFS oracle decide finish/escalate/refuse; the reward is that oracle. **No LLM grades an LLM.** An optional judge may only shape reward *post-gate* and can never lift a hard-gated 0.
3. **The gate is fail-closed.** Default-deny: a hazard/human-only entry or a fake-finish hard-zeros reward; training is blocked without authorization; readiness is blocked without approved evidence. A bad action is made *impossible to score well*, not merely *unlikely*.
4. **The trace proves it.** Every step is hash-chained and tamper-evident; a **ScoreReceipt** re-derives the number (`env:verify` — flip one byte, it fails). Tamper-evident = alteration is *detectable*, not *impossible*.

## Why speed is the architecture
Per-step verification = two model calls per action. On GPU latency a verify-on-every-step loop leaves real time, so teams sample verification — exactly where reward-hacking and prompt-injection slip in. Cerebras (~1,300–1,500 tok/s) makes per-step verification ~free, so it rides on every step. **Safety is loop-bound; cheap loops are safe loops.**

## Identity is the outer ring (Passport)
Before *what* is allowed, **who** is allowed: `apps/passport` issues delegated agent identity + scoped, revocable authority (identity → authority → verified action → trace). A spatial example: a human-only zone is passable **only** with a live, scoped grant — so REFUSE can fire on *policy*, not just hazard.

## Two instantiations, one spine
- **Physical:** `apps/origin-web` (floor → readiness evidence under a deterministic oracle verdict).
- **Digital:** `apps/origin-web/rlkit` (EnvironmentBundle → trace → ScoreReceipt). Nine pillars.

## Boundaries
Bounded gym evidence, not certification · oracle-only authority · lanes separated (synthetic/counterfactual/fixture/real) · readiness + training fail-closed · no production-autonomy claim.
