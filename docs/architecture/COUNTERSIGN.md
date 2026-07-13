# Countersign — earned, key-bound, re-derivable agent authority

> **Signed computations, not signed claims.**

## The wedge

Every project in the agent-identity cohort grants an agent's authority **statically, at mint
time** — by a config manifest, by human fiat, by a parent's decree, or (worst) by an LLM's
opinion. The credential then *asserts* that authority, and a verifier can only confirm the
assertion was not edited. Origin already has the one thing none of them has: a **deterministic
eval gym** whose oracle turns tamper-evident evidence into a graduated, catastrophe-capped
autonomy license (`apps/janus/src/license.ts`). **Countersign** closes the loop. An agent *is*
an Ed25519 key; its id is the key's thumbprint; its authority is a **Warrant** whose scope is a
pure function of the license it **earned** from the deterministic oracle. The Warrant does not
*state* the level — it carries the pinned policy version and the exact evidence, so a third party
**re-runs** the policy on that evidence and asserts the recorded level is the *only* level it
could produce. Inflate it and verification VOIDs. The Warrant is bound to the key, so a
thief or name-squatter gets zero; and one catastrophic episode caps the **key** across all runs,
not just the run it happened in. **Every authority decision is offline-verifiable.**

This document matches the layered / trust-boundary style of [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md)
and [`docs/architecture/ORIGIN_TRUST_ARCHITECTURE.md`](./ORIGIN_TRUST_ARCHITECTURE.md). Countersign
is the identity ring around that spine: **who** is allowed, computed the same deterministic way as
**what** is allowed.

---

## Layered view

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  ① IDENTITY — a key IS the agent                        packages/verifier-core/         │
│     Ed25519 keypair (node:crypto, deterministic sigs)   countersign-identity.mjs        │
│     agent_id = thumbprint = sha256(canonical{crv,kty,x})  (RFC 7638 / 8037)             │
│     proof-of-possession: sign {agent, route, body_digest, nonce, iat}                   │
│     → no name-squatting (thumbprint must match the key) · no theft (needs the sig)      │
└───────────────┬────────────────────────────────────────────────────────────────────────┘
                │ a key with no authority yet
┌───────────────▼────────────────────────────────────────────────────────────────────────┐
│  ② EARNED LICENSE — the deterministic gym is the only judge   license-policy.mjs         │
│     verdicts (passed/reward/catastrophic/scenario/split) → L0..L4                        │
│       L0 Observe · L1 Ask · L2 Recommend · L3 Guarded Act · L4 Limited Autonomy          │
│     catastrophe cap: ANY catastrophic episode → capped at L1 (can't be averaged back)    │
│     diversity gate: hold L3+ only with ≥5 distinct scenarios AND ≥1 held-out (anti-Sybil)│
│     pure function · no wall-clock · no RNG · policy_version pinned                        │
└───────────────┬────────────────────────────────────────────────────────────────────────┘
                │ an earned level, plus the evidence it came from
┌───────────────▼────────────────────────────────────────────────────────────────────────┐
│  ③ WARRANT — a signed COMPUTATION, not a signed claim          warrant.mjs                │
│     binds: agent_thumbprint · license_level · derivation (the shown work) ·              │
│            license_policy_version · verifier_version · capability_manifest_digest ·      │
│            backing[] (complete ordered verdicts) · chain_head · epoch                    │
│     per-agent hash chain (cs-agent-chain:v1) folds the COMPLETE verdict set →            │
│       drop the catastrophic row and the head no longer matches → INCOMPLETE_CHAIN        │
│     issuer = the gym's key; issuer_signature over warrant_digest                         │
└───────────────┬────────────────────────────────────────────────────────────────────────┘
                │ authority a holder can present — and attenuate
┌───────────────▼────────────────────────────────────────────────────────────────────────┐
│  ④ DELEGATION — offline attenuation, monotonic narrowing                                 │
│     a child grant's scope ⊆ parent, TTL ≤ parent's remaining (bounded, never widening)   │
│     enforced today at the lease layer (onePasswordBroker.ts child-lease checks);         │
│     the Ed25519 offline chain-of-custody certificate is the reserved durable form        │
│     (see "What is real vs planned")                                                      │
└───────────────┬────────────────────────────────────────────────────────────────────────┘
                │ a request arrives: Warrant + PoP + a scope ask
┌───────────────▼────────────────────────────────────────────────────────────────────────┐
│  ⑤ THE GATE — ordered checks, fail-closed, deny-BEFORE-resolve                           │
│     1 proof-of-possession   verifyPop()          — key owns the claimed id?              │
│     2 identity / quarantine cordon.guardSecretRequest() — tainted/frozen? deny           │
│     3 warrant re-derive     verifyWarrant()      — level re-computes? chain complete?     │
│     4 delegation chain      scope ⊆ every ancestor                                        │
│     5 scope subset          requested capability ⊆ warranted scope                        │
│     ─────────────────────── only if 1–5 all PASS ───────────────────────                 │
│     6 resolve the secret    (never reached on a failed gate or a tainted agent)          │
└───────────────┬────────────────────────────────────────────────────────────────────────┘
                │ an authorized, scoped action
┌───────────────▼────────────────────────────────────────────────────────────────────────┐
│  ⑥ BROKER — JIT secret, never in the agent's context   onePasswordBroker.ts / mock       │
│     lease → opaque handle 'jns_…' + redacted metadata (field LABELS only, never a value) │
│     use  → resolve op://… at the action boundary, inside the closure; gone on return     │
│     revoke → in-flight kill switch;  TTL default 5m / max 15m                             │
└───────────────┬────────────────────────────────────────────────────────────────────────┘
                │ redacted result + a signed receipt
┌───────────────▼────────────────────────────────────────────────────────────────────────┐
│  ⑦ OFFLINE VERIFIER — one command re-derives the whole bundle                            │
│     verifyWarrant(warrant, {issuerPublicJwk, expectedIssuerThumbprint}) + verifyPop()    │
│     pin the issuer thumbprint; everything else travels inside the bundle → exit 0/nonzero│
│     no server, no network, no trust in the issuer's word                                 │
└──────────────────────────────────────────────────────────────────────────────────────────┘

  Reuses the SAME content-address primitives the rest of Origin already trusts:
  canonical() + sha256() + GENESIS from packages/evidence/env-evidence.mjs.
  Sibling receipt/credential primitives: sigil.mjs (ES256 receipt) · merkleBatch.mjs
  (O(log N) inclusion proofs) · crucible.mjs (config-bound credential).
```

### Why Ed25519 here (and ES256 for Sigil)

`countersign-identity.mjs` uses **Ed25519** via `node:crypto` one-shot sync `sign`/`verify`:
deterministic signatures (no per-sign RNG to get wrong), small keys, and a **synchronous,
deterministic** code path so the whole gate stays deterministic like the rest of the Origin
engine. Sigil stays on **ECDSA P-256 / ES256** because it targets Web Crypto in a browser. Both
sign over the payload's content-address (`sha256(canonical(payload))`), so a signature is bound to
exact content — flip one byte and verification fails.

---

## Trust boundaries (the lines that must never be crossed)

Each line names **what breaks without this layer**.

| # | Boundary | Mechanism (real code) | What breaks without it |
|---|----------|-----------------------|------------------------|
| a | **The secret is never fetched for a failed gate or a tainted agent** — *deny-before-resolve*. | `cordon.guardSecretRequest()` denies tainted/frozen agents and `guardBrokerWithCordon` throws `CordonRefusal` **before** the broker is called; resolution (step ⑥) is ordered strictly after checks 1–5. | A prompt-injected/quarantined agent could pull a live credential just by asking. Resolution *after* the check means a bug in the check still touches the secret. |
| b | **Authority is bound to a key, not a name** — *thumbprint*. | `agentThumbprint()` derives `agent_id` from the public key; `verifyPop()` returns code 1 if the key does not own the claimed id. | Any agent could impersonate another by claiming its string id; a stolen credential could be replayed by anyone. |
| c | **The level is re-derived, never asserted** — *oracle binding*. | `verifyWarrant()` re-runs `deriveWarrantLevel()` on the cited backing under the pinned `license_policy_version`; code 3 (`level inflation`) if the recomputed level ≠ the claimed one. | The Warrant becomes a mere claim ("trust me, I'm L4"); the whole "signed computation" advantage collapses to "signed assertion," which every competitor already has. |
| d | **The backing is complete-or-void** — *chain head*. | `foldAgentChain()` folds the **complete, contiguous** verdict set into `chain_head`; verify re-folds and demands a match — code 4 (`INCOMPLETE_CHAIN`) on any dropped/reordered/mutated row. | Evidence cherry-picking: export the record minus the one catastrophic episode and claim a clean L4. You cannot export your way to a cleaner record than you earned. |
| e | **Delegation only narrows** — *attenuation*. | Child lease scope ⊆ parent and TTL ≤ parent's remaining (`onePasswordBroker.ts` `leaseScopedSecret` parent checks; codes `scope_escalation` / `ttl_escalation`). | A delegated sub-agent could widen its own authority beyond the parent's — privilege escalation by delegation. |
| f | **The judge is the deterministic oracle, never an LLM.** | Levels come from `license-policy.mjs` / `apps/janus/src/license.ts` — a pure function of verdicts; no model in the reward path. Mirrors the spine's "no LLM grades an LLM." | A model can be *talked into* a pass; the license stops being reproducible and starts being negotiable. |

Confident framing, scoped claims: **tamper-evident** means alteration is *detectable*, not
impossible; **certified** means *reproducible under this verifier*, never "safe." Countersign
**contains**; it does not claim to *prevent*.

---

## Request lifecycle (one real action, end to end)

```
enroll key ─▶ earn license in the gym ─▶ mint Warrant ─▶ present Warrant + PoP at the gate
   │              │                          │                        │
generateAgentKey  deterministic oracle    mintWarrant (issuer=gym)   verifyPop → verifyWarrant
(thumbprint=id)   → L0..L4 verdicts        signs chain_head over      → scope ⊆ warrant
                  (catastrophe cap,         the COMPLETE verdict set   │
                   diversity gate)                                     ▼
                                                       broker resolves the secret JIT
                                                       (op://… inside the action closure)
                                                                       │
                                                        redacted result ─▶ receipt (Sigil)
```

One line: **enroll → earn → mint → present (PoP) → re-derive + scope-check → resolve JIT →
redacted result → signed receipt.** Steps 1–3 happen once per key/epoch; steps 4–8 happen per
action. The only step that ever touches a secret value is the last broker call, and only after
every check above it has passed.

---

## How Countersign absorbs and beats the cohort

Fair reading of each project, then the one reason Countersign's version is strictly stronger —
always the same three levers: **earned** (from a deterministic oracle) + **re-derivable** (a
computation, not a claim) + **key-bound** (thumbprint + proof-of-possession).

| Cohort project | What it does (fairly) | Why Countersign is strictly stronger |
|---|---|---|
| **Agent Passport** (kushDCFS) | An offline, attenuable agent credential with proof-of-possession — a real, good idea we build on. | Same PoP shape, but the authority inside is the **earned, re-derivable** license — not a config-time grant a verifier can only rubber-stamp. |
| **Macaroons / aboard** (`@aboard/macaroon`, MIT) | Bearer tokens with offline caveat attenuation via chained HMAC. | Caveats only *narrow a static grant*; our scope is a **function of earned evidence**, delegation rides an **Ed25519** chain (not a shared HMAC secret whose leak mints anything), and PoP makes a leaked token inert. |
| **SecureDelegate** | Delegates against a parent's *predicted plan*. | We keep predicted-plan conformance (**Tell**, `tell.ts`) **and** bind the delegated authority to the child's **earned level** with monotonic narrowing. |
| **Agent Polygraph / Code Onion** (MIT) | Declared-vs-measured intent; a white-box activation probe. | **Tell** already runs the three-way (declared vs measured vs action) with a probe that *abstains at confidence 0* without activations; on top, the actor's authority is earned, not declared. |
| **CORDON / QuarantineAI** | Taint-track agents exposed to untrusted content; contain the blast radius. | **Cordon** (`cordon.ts`) is wired to the broker chokepoint as **deny-before-resolve**: a tainted agent's secret is *never fetched*, and the refusal is audited. |
| **TrustReceipt** | A signed receipt a third party can check offline. | **Sigil** does this (ES256), and the Warrant goes further: it signs a **re-derivable computation**, so verification re-runs the policy — not just "the log wasn't edited." |
| **APS × 1Password** | Beneficiary-by-signature + Merkle-batched audit + JIT secret resolution. | **merkleBatch.mjs** (domain-separated, count-bound) + a JIT broker that only resolves **after** an earned, re-derived Warrant clears the gate; the secret never enters the agent's context. |
| **ScopeMemory** | Versioned, proof-carrying policy. | **proofCarryingPolicy.mjs** hash-chains policy versions; the Warrant additionally pins `capability_manifest_digest`, so a later manifest amendment can't retroactively re-scope a past authority. |

The pattern: each cohort project solves one honest slice. Countersign is the only design where the
**authority itself** is earned from a deterministic oracle and re-derivable by a stranger.

---

## Threats we DON'T claim to solve

Honest by design. Three open edges, named plainly.

1. **Sybil / operator binding.** A fresh keypair has *no track record*, and the **diversity gate**
   (≥5 distinct scenarios + a held-out for L3+) closes the "grind one easy scenario, re-enroll a
   fresh key, re-farm" hole — you cannot fake a real record by repeating a single win. But binding a
   key to a **real human/operator** is a separate PKI / WebAuthn / hardware-attestation concern that
   Countersign does **not** solve. Possession proves possession of a key, not the identity of who
   holds it. **Future work**, called out in `countersign-identity.mjs`.

2. **Self-referential authority.** The same team authors the scenarios, the verifier, and the gate.
   A credential is only as trustworthy as the gym that issued it. Mitigations: the diversity /
   held-out gate resists overfitting one scenario, and the Cobra/Chronos loop stress-tests the
   grader itself. Framing stays honest: **certified means reproducible under this verifier, never
   safe.** We prove reproducibility, not real-world safety, and make no production-autonomy or
   robot-certification claim.

3. **The enforcement path is demonstrated offline on the deterministic mock broker.** The
   identity + Warrant crypto is real and offline-verifiable; the *enforcement* (gate → resolve) is
   demonstrated against `MockSecretBroker` with zero external services. Real **1Password**
   (`onePasswordBroker.ts`, `@1password/sdk` `secrets.resolve`) is the **optional durable path** —
   `isAvailable()` is false without a service-account token, and Janus fails safe to the mock.

---

## What is real vs planned (see also `apps/janus/JANUS_ASSUMPTIONS.md`)

**Real, present, deterministic** — in `packages/verifier-core/`:
`countersign-identity.mjs` (Ed25519 identity, thumbprint, PoP — unit-tested in
`countersign-identity.test.ts`), `license-policy.mjs` (the earned-level policy + catastrophe cap +
diversity gate), `warrant.mjs` (mint/verify, chain completeness, offline re-derivation). The gate
composes these with `cordon.ts` (deny-before-resolve, tested) and enforces against the broker
(`mockSecretBroker.ts` offline; `onePasswordBroker.ts` durable, tested).

**Reserved / planned** — export names claimed in `packages/verifier-core/package.json` whose
modules are not yet present: `delegation.mjs` (the cryptographic Ed25519 offline attenuation
certificate — monotonic narrowing is real *today* at the lease layer) and `countersign-verify.mjs`
(the aggregate one-command bundle verifier / CLI wrapper — the underlying `verifyWarrant` /
`verifyPop` it wraps are present and callable now). Keeping these lanes separate is the point:
we do not describe a reserved export as shipped code.
