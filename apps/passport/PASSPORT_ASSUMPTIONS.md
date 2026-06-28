# Passport — Build Assumptions & Decisions

> Local-first agentic **identity + intent-authorization** layer for personal agents and
> multi-agent workflows. "1Password for agentic intent, credentials, and delegated action."
> Built for an AGI House / agent-identity demo. **Local only. No push. No deploy. No real
> side effects. No secret exposure.**

## North star
**Capability is not permission.** The user declares *intent*. The agent proposes a *plan*.
Passport authorizes *scoped capabilities*. Tools execute *only within granted bounds*. Every
action leaves a *trace*. Risky actions require *explicit approval*. Authority is *revocable* and
*expires*.

## Where this is built (decision)
- Built in **`0619/autonomy-trace-console`** (this repo / this session's root) as a **second Vite
  entry**: `passport.html` → `src/passport/main.tsx`, with all code under `src/passport/`.
  The existing "Autonomy Trace Console" app (`index.html` → `src/App.tsx`) is left untouched.
- **Why here:** this session is rooted here; it is already React + TypeScript + Vite + vitest +
  ESLint with strict TS — the ideal substrate for the spec's TS interfaces and a polished React
  UI. Keeps Passport cleanly separate from both the gym app (here) and the Origin Physical AI robot site
  (the sibling `0620-test/physical-ai-demo-test` repo).
- **Relationship to prior work:** the Origin Physical AI repo already has a production-grade *credential
  broker* (`src/credentials/` — fail-closed authz pipeline, `SecretBroker` mock + 1Password
  scaffold, Rule-of-Two, append-only audit). Passport is the **broader consumer-agent product**
  that broker enables. I re-implement the proven patterns (fail-closed gating, redaction,
  mock-only secrets, append-only audit) against *this* spec's interfaces, in this repo, so the
  demo is self-contained.

## Runtime model (decision)
- **100% client-side and deterministic.** All connectors are pure TypeScript mock adapters that
  read in-repo fixtures and return summaries. **No network, no backend, no real credentials.**
  This is what makes every safety constraint trivially true: nothing can register, book, order,
  message, or spend because no connector has any real-world egress at all.
- **Injected clock.** The engine takes a `now()` clock (defaults to `Date.now`) so TTL/expiry is
  testable and deterministic.
- **Real digest.** The audit trace digest uses a compact, correct, synchronous **SHA-256**
  implementation (unit-tested against the `"abc"` NIST vector) so tamper-evidence is genuine, not
  hand-waved.

## The core authorization idea (how "capability is not permission" is enforced)
Connectors come in two kinds:
1. **read / prepare** adapters (e.g. `calendar.read`, `events.search`, `messages.draft`,
   `*.prepare`, `*.write.proposed`). Gated by the **grant**: the required capability must be in
   `allowed_capabilities` and the grant must be live (active, not expired, not revoked). Otherwise
   **fail closed**.
2. **commit** adapters — the *simulated* side effects (`messages.send`, `*.registration.submit`,
   `ride.booking.submit`, `delivery.order.submit`, `reservation.submit`, `payment.spend`). These
   capabilities are placed in the grant's **`denied_capabilities`** — the agent can *never* invoke
   them on its own. They are unlocked **only** by an **approved `ApprovalPacket`**, and even then
   the connector runs in **simulation mode** and performs **no real action** (returns
   `{ simulated: true }`). Each approval is one-shot and audited.

So: discovery/preparation is bounded by the grant; execution of anything external is bounded by an
explicit, per-action human approval — and is *simulated regardless*. A judge sees exactly what
*would* happen before anything happens.

## Scope of the build
- **Three first-class scenarios:** Fill My Night, Enrich My Life, Airport Pickup — each runs end to
  end (intent → risk → grant → plan → tool activity → approval gates → final itinerary → audit →
  revoke).
- **Lightweight flows / cards** for use cases 4–7 (Recover My Evening, Trusted Hackmate
  Coordination, Credentialed Task Without Exposure, Revoke Agent Access). #6 exercises the
  `SecretBroker` (scoped handle, never the secret). #7 is wired as the global revoke path on every
  scenario.
- **Tests** for all 11 listed behaviors (fail-closed deny, allowed-with-grant, expired/revoked
  deny, approval-required, no-secret-logging, audit-per-call, each scenario completes).
- **Docs:** this file, `DEMO_SCRIPT.md`, `README_LOCAL_DEMO.md`, plus an implementation summary.

## Assumptions made (documented, not blocking)
1. **No live 1Password locally.** `OnePasswordSecretBroker.isAvailable()` returns `false` (no
   `OP_CONNECT_*` env), so Passport uses `MockSecretBroker`. The mock holds a fake secret in
   memory and returns only an opaque handle + redacted metadata (field *labels*, never values).
2. **Intent parsing is deterministic, not LLM-backed.** The demo is scenario-driven; the
   `IntentParser` maps a request to a normalized intent via the scenario spec (and keyword
   matching for free text). No model spend, fully reproducible. (An LLM parser could slot behind
   the same interface later.)
3. **Fixtures are fictional but believable** (events, hackmates, flights, rides, restaurants,
   sports). Names of prior events match the user's history (AGI House Agent Identity Build Day,
   Nebius/Vapi/InsForge Build Day, HUD × YC RL Environments Hackathon). No real PII.
4. **"Cost" and "ETA" values are mock estimates** shown only inside approval packets; no payment
   rail exists.
5. **Dark, premium theme** consistent with the repo's existing dark color-scheme; Passport gets its
   own identity-card visual language (capability chips, risk badges, lock/grant/revoke states).

## How the multi-agent harness is used (and why, given the mandate)
The codebase is one tightly-coupled TypeScript app; having independent agents codegen interdependent
files in parallel would create integration churn that costs more than it saves. So the highest-value
use of orchestration here is **verification, not generation**: after building the coherent app, run a
**Workflow** that fans out (a) an **adversarial security review** across distinct lenses
(fail-closed authz, secret-leakage, approval-gating, revocation/expiry, audit completeness) and
(b) a **completeness/test-coverage critic** against this spec's Definition of Done. Findings are
fixed and re-verified. This matches the "adversarially verify your findings" guidance while keeping
the app coherent and compiling.

## Post-review hardening (from the adversarial security workflow)

A multi-lens adversarial review (6 lenses → per-finding verification, 29 agents) returned **0
critical / 0 high**, with 16 confirmed medium/low control-gaps. All were fixed; the verifiers also
dismissed 7 false positives (e.g. confirming the 1Password broker is genuinely fail-closed). Changes:

- **Real secret boundary, not a tracer:** `ToolRouter` now `redact()`s the *entire* tool result
  (summary + data) before it can enter the results map / snapshot / UI, and `assertNoSecret` was
  broadened to fire on any credential-shaped value, not just the mock tracer. Input summaries are
  redacted by value-pattern too, not only by key name.
- **Spend ceiling is enforced**, not cosmetic: an approved commit whose cost would breach
  `budget_limit` is refused at the gate and audited (`GrantManager.withinBudget`, currency-mismatch
  fails closed).
- **One-shot approvals:** an approved packet is marked `consumed` after its commit; it cannot be
  replayed. The commit path also re-checks the grant's own policy (`requires_approval_for` /
  `denied_capabilities`) — a packet alone can't unlock a capability the grant never scoped.
- **Revocation is terminal:** `revoked` is never overwritten back to `running`; in-flight read and
  commit steps re-check liveness after their await and discard results if authority was revoked mid-step.
- **Audit is immutable + verifiable at read time:** `trace()` returns a frozen deep copy, and
  `AuditLogger.verify(trace)` recomputes the hash chain so edits/reorders/deletes are detectable.
  Missing-connector paths now emit an audited denial (no untraced action).
- **Broker fallback is real:** `pickBroker()` calls `OnePasswordSecretBroker.isAvailable()` and falls
  back to the mock — the documented path is exercised, not dead code.
- **Honest risk:** a critical commit (e.g. authorizing ride payment) now surfaces as **Critical**,
  not a softened "high".

### Documented limitations (acknowledged, appropriate for a local demo)
- **Tamper-evident, not tamper-proof.** The audit digest is a SHA-256 hash chain with deterministic
  IDs + an injected clock and no signing key, so it *detects* edits to a given trace but a fully
  re-forged history could be recomputed. A production version would sign each event server-side.
- **Approval TTL (15 min) is independent of the grant TTL.** This is safe because every commit also
  re-checks grant liveness, so an approval can never outlive its grant in practice.

## Hard constraints honored
Local only · no push · no deploy · no real registration/booking/ordering/messaging/spending ·
secrets never in code/logs/traces/storage/screenshots/fixtures · every side-effecting action
produces a reviewable approval card first · fail-closed authorization · TTL + revocation paths ·
audit event for every tool call.
