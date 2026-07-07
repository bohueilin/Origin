# Prior art & credits

Some Origin capabilities were **inspired by** ideas that surfaced in the public AGI-House agent-identity/security/trust cohort. Everything here is a **clean-room reimplementation** in Origin's own stack and design — **no third-party code was copied**. Ideas, architectures, and methods are not copyrightable; we reimplement them, credit the source, and keep our own deterministic-oracle discipline. Where we ever *vendor* a permissively-licensed library, it is listed in `THIRD_PARTY_NOTICES.md` with its license retained.

| Origin capability | Idea we absorbed | Inspired by (link) | How ours differs |
|---|---|---|---|
| **Cordon** (`apps/passport/.../engine/cordon.ts`) | Taint-track agents exposed to untrusted content; the broker refuses to resolve a secret for a tainted agent (secret never fetched); on compromise, freeze only the poisoned sub-tree and measure blast radius. | CORDON — `github.com/ShreeBohara/cordon-agi-house` (no license) · QuarantineAI — `github.com/tmoula/QuarantineAI` (telemetry-only observer) | Clean-room; wired to Origin's `SecretBroker` chokepoint + the tamper-evident `AuditLogger` hash chain; taint is a property of the agent tracked outside its context. |
| **Tell** (`apps/passport/.../engine/tell.ts`) | Three-way gate: declared vs. **measured** vs. action. Predicted-plan → observed-action conformance; a white-box activation probe for the open-weight tier. | Agent Polygraph — `github.com/yavol/code-onion` (MIT) · SecureDelegate — `github.com/rajeev595/AGIHouse_hackathon_2026` (no license) · **TaskTracker** (Microsoft Research, activation-delta method — reimplemented from the paper) | Black-box-first (predicted-plan conformance) on our stack; the true white-box probe is a `ProbeSignal` drop-in for the open-weight tier, never claimed without model activations. |
| **Crucible** (`apps/origin-web/rlkit/crucible.mjs`) | A verifiable, config-bound agent credential ("reference check") that voids if model/tools/harness change; before/after lift; expert-authored rubrics. | Diploma.ai — `diploma.ai` (no public repo) · Bad-agents (IAM gym) — `github.com/Dariushuangg/bad-agents` | Issued by Origin's **deterministic oracle** (`env:verify` + RSL) — our moat vs. self-authored rubrics; emits a **Sigil** signed receipt into Chronos. |

## Naming
Origin's forge/pantheon system: **Origin** (the gym/creation) · **Chronos** (the record) · **Cobra** (red-team) · **Janus** (the gate/identity — formerly "Passport") · **Tell** (measured intent) · **Cordon** (containment) · **Crucible** (certification) · **Sigil** (the signed receipt).

## Licenses observed (2026-07)
`code-onion` = MIT, `aboard` (`@aboard/macaroon`) = MIT (usable with attribution); `cordon-agi-house`, `TrustReceipt`, `agent-control-room`, `aps-1password-demo` = **no license = all rights reserved** (studied for ideas only; **not** reused as code). We do not copy all-rights-reserved code, do not strip attribution, and avoid GPL/AGPL.
