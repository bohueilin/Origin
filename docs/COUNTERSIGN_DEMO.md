# Countersign — 3-minute demo runbook

> **Signed computations, not signed claims.**
>
> Offline-first: every beat runs with **zero external services**. No network, no 1Password, no
> backend — the enforcement path uses the deterministic `MockSecretBroker`, and every verification
> re-derives from the bundle itself. Real 1Password is the optional durable path (`isAvailable()`
> is false without a service-account token; Janus falls back to the mock).

Full architecture: [`docs/architecture/COUNTERSIGN.md`](./architecture/COUNTERSIGN.md).
Real code cited below: `packages/verifier-core/{countersign-identity,license-policy,warrant}.mjs`,
`apps/janus/src/janus/engine/cordon.ts`, `apps/janus/{server/onePasswordBroker.ts,src/janus/secrets/mockSecretBroker.ts}`.

---

## Setup (before the clock starts)

- Terminal at repo root, one panel. Node ≥ 18.
- A `valid-bundle.json` (an agent's real gym history + minted Warrant) and a `cherry-picked-bundle.json`
  (the same bundle with the catastrophic verdict row deleted) staged in the scratchpad.
- Say the frame once, up front: **"Every project here grants authority at mint time. We're the only
  one where the credential is a computation a stranger can re-run — and voids if you lie."**

---

## The 3 minutes (timed beats — each shows a VERIFIABLE property)

### Beat 1 — an agent earns L3 in the gym  ·  0:00–0:35

**Say:** "The agent is an Ed25519 key. Its id is the key's thumbprint — not a name it picked. It has
no authority until it earns one from the deterministic oracle."

**Show:** run the agent through the gym; the oracle (`license-policy.mjs`) turns verdicts into a
level. Point at the derivation: `passRate`, `avgReward`, `distinctScenarios`, `hasHeldout`, `caps`.

**Verifiable property:** the level is a **pure function** of the verdicts — same evidence, same
level, on any machine. The **diversity gate** is visible: L3+ requires ≥5 distinct scenarios and a
held-out row, so you can't farm one easy scenario to L4.

> `agentThumbprint(publicJwk)` → the 64-hex id · `deriveWarrantLevel(backing)` → `{ level: 'L3', … }`

---

### Beat 2 — present Warrant + proof-of-possession; the gate resolves a scoped secret JIT  ·  0:35–1:20

**Say:** "To act, it presents its Warrant and proves it holds the key. The gate re-derives the
level, checks scope, and only then does the broker resolve a secret — just-in-time, at the action
boundary. The secret never enters the agent's context."

**Show:** the ordered gate — `verifyPop()` (PASS) → `verifyWarrant()` (PASS, level re-derives) →
scope ⊆ warrant (PASS) → broker `lease` returns an **opaque handle** `jns_…` + redacted metadata
(field **labels** only). Then `use` resolves the value inside the closure and returns a **redacted
result**.

**Verifiable property:** what crosses back to the agent is a handle and field *labels* — never a
value. `assertNoSecret` guards the boundary. **Deny-before-resolve:** the resolve step is ordered
strictly after every check.

> Watch the returned object: `{ handle: 'jns_…', metadata: { field_labels: ['password','otp'] } }` —
> no secret. TTL default 5 min.

---

### Beat 3 — a STOLEN Warrant from a different keypair → `WRONG_HOLDER` before any scope check  ·  1:20–2:00

**Say:** "Now steal it. Copy the whole Warrant, present it from a different keypair."

**Show:** attacker presents the victim's Warrant but signs the PoP challenge with the attacker's own
key. `verifyPop()` returns **code 1 — the key does not own the claimed agent id (thumbprint
mismatch)**. The gate stops **here**, before it ever looks at scope or touches the broker.

**Verifiable property:** authority is **bound to a key, not a name**. A thief or name-squatter gets
**zero** — the Warrant is inert without the private key that owns the thumbprint. (Matches the
tested case in `countersign-identity.test.ts`: "a key that does NOT own the claimed id is
rejected.")

> `verifyPop({ challenge, signatureB64Url, publicJwk: attacker.publicJwk })` → `{ ok: false, code: 1 }`

---

### Beat 4 — the lease granted seconds ago is refused after TTL / revoke  ·  2:00–2:30

**Say:** "Authority expires and revokes. The lease we just used — expire it, or hit the kill
switch."

**Show:** advance the injected clock past `expires_at` (or call `revokeLease(handle)`), then re-`use`
the same handle. Result: **`expired`** / **`revoked`** — no resolution. Bounded delegation is the
same rule: a child lease's scope ⊆ parent and TTL ≤ the parent's remaining.

**Verifiable property:** authority is **time-bounded and revocable at the boundary**; a stale or
killed lease resolves **nothing**. The clock is injected, so this is deterministic, not a race.

> `useLease(handle, ref, …)` after expiry → `{ ok: false, code: 'expired' }` · `revokeLease(handle)` → `{ status: 'revoked' }`

---

### Beat 5 — the offline verifier: valid → exit 0; cherry-picked → nonzero `INCOMPLETE_CHAIN`  ·  2:30–3:00

**Say:** "Last one — the part no competitor can answer. A stranger re-runs the whole thing offline."

**Show:**

```bash
node scripts/countersign-verify-cli.mjs valid-bundle.json        # → exit 0  ✓ valid
node scripts/countersign-verify-cli.mjs cherry-picked-bundle.json # → nonzero  ✗ INCOMPLETE_CHAIN
```

The cherry-picked bundle is identical **except** the one catastrophic verdict row was dropped to
fake a clean L4. The re-folded `chain_head` no longer matches the signed head → **code 4,
INCOMPLETE_CHAIN — before the level is even re-derived.** You cannot export your way to a cleaner
record than you earned.

**Verifiable property:** **complete-or-void.** Integrity, authenticity, completeness, and level are
all re-derived from the bundle with only a pinned issuer thumbprint — no server, no trust in our
word.

> The CLI is a thin wrapper over the present, tested `verifyWarrant()` / `verifyPop()`. Runnable
> today with the real exports:
> ```bash
> node --input-type=module -e '
>   import { verifyWarrant } from "@origin/verifier-core/warrant";
>   import { readFileSync } from "node:fs";
>   const b = JSON.parse(readFileSync(process.argv[1], "utf8"));
>   const r = verifyWarrant(b.warrant, { issuerPublicJwk: b.issuerPublicJwk, expectedIssuerThumbprint: b.issuerThumbprint });
>   console.log(r.code === 0 ? "✓ " + r.reason : "✗ code " + r.code + " — " + r.reason);
>   process.exit(r.code === 0 ? 0 : 1);
> ' valid-bundle.json
> ```
> Inflate the level instead of dropping a row and you get **code 3, level inflation** the same way.

**Close on the line:**

> **"Signed computations, not signed claims."**

---

## 30-second depth answer — "draw the trust boundary and defend it"

For a probing judge. Draw one horizontal line and put the six ordered checks above it, the secret
below it:

```
   PoP ─▶ identity/quarantine ─▶ warrant re-derive ─▶ delegation ─▶ scope ⊆ warrant
  ───────────────────────────── THE LINE (deny-before-resolve) ─────────────────────────────
                                        secret resolved JIT, inside the closure, gone on return
```

**Defend it in four sentences:**

1. **Nothing below the line is touched until everything above it passes** — the broker is never even
   called for a failed gate or a tainted agent (`cordon.guardSecretRequest` throws `CordonRefusal`
   *before* resolution). Deny-before-resolve, so a bug in a check still never leaks a secret.
2. **The identity check is first and cheapest** — `verifyPop` binds the request to a key that must
   own the claimed thumbprint, so a stolen Warrant dies at check 1 (`WRONG_HOLDER`), before scope is
   ever considered.
3. **The authority check is a re-derivation, not a lookup** — `verifyWarrant` re-runs the pinned
   license policy on the *complete* cited evidence; inflate the level (code 3) or drop a row (code 4)
   and it voids. The judge is the deterministic oracle, never an LLM.
4. **The secret's lifetime is one closure** — resolved just-in-time at the action boundary, redacted
   on the way out, expiring on a TTL and killable by revoke; delegation can only narrow.

The honest edge, unprompted: **this proves possession of a key and reproducibility under this
verifier — not that the key belongs to a specific human (that's PKI/WebAuthn, future work), and not
"safe."** Every claim is scoped, and every authority decision is offline-verifiable.
