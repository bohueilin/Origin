# Countersign — the offline bundle verifier (depth proof)

> **One command. An exported bundle. Every earned authority claim re-derived from its own
> evidence — nonzero exit if anything was tampered or inflated.** No network, no database,
> no trust in whoever produced the bundle.

A **Warrant** is not a signed *claim* ("the gym said L3") — it is a signed *computation*. It
carries the pinned license policy and the exact evidence it was computed from, so a third
party re-runs the policy on that evidence and asserts the recorded level is the **only** level
the policy could have produced. This directory is the artifact a skeptic runs to check that.

## Run it

```bash
# from apps/janus
node scripts/countersign-verify-cli.mjs docs/examples/countersign-bundle/valid-bundle.json
echo "exit=$?"        # 0

node scripts/countersign-verify-cli.mjs docs/examples/countersign-bundle/tampered-bundle.json     # exit 2
node scripts/countersign-verify-cli.mjs docs/examples/countersign-bundle/inflated-bundle.json     # exit 3
node scripts/countersign-verify-cli.mjs docs/examples/countersign-bundle/cherry-picked-bundle.json # exit 2

# machine-readable
node scripts/countersign-verify-cli.mjs docs/examples/countersign-bundle/valid-bundle.json --json
```

The verifier lives in `packages/verifier-core/countersign-verify.mjs` (`verifyBundle`); the CLI
is a thin wrapper. A missing file or unparseable JSON is itself an integrity failure → exit 2.

## Bundle shape

```jsonc
{
  "bundle_schema_version": "1.0.0",
  "issuer":   { "public_jwk": { "kty": "OKP", "crv": "Ed25519", "x": "…" },
                "thumbprint": "…" },          // MUST equal thumbprint(public_jwk)
  "warrants": [ /* one or more Warrants (see packages/verifier-core/warrant.mjs) */ ],
  "delegations": [ /* optional; verified only if a delegation module is available */ ],
  "pinned":   { "capability_manifest_digest": "…", "min_epoch": 0 }
}
```

The verifier first **pins the issuer**: it recomputes `thumbprint(public_jwk)` and refuses any
bundle whose declared `issuer.thumbprint` does not match — a bundle cannot lie about who signed
it. Then every Warrant is verified against that pinned key.

## The exit-code contract

Each Warrant produces a verdict code (`0..7`, from `verifyWarrant`); the CLI collapses it to a
**process class**, and the bundle takes the **worst (lowest-trust)** class of all its parts:

| verdict code (per warrant)                 | meaning                              | process exit |
|--------------------------------------------|--------------------------------------|:------------:|
| `0`                                        | valid                                | **0** OK       |
| `1` tampered · `4` incomplete chain · `7` malformed / issuer lie | *can I trust the bytes?* | **2** INTEGRITY |
| `2` bad sig · `3` inflation · `5` wrong issuer · `6` stale       | *is this authority real?* | **3** AUTHORITY |

**Precedence when a bundle mixes failures:** `OK (0) < AUTHORITY (3) < INTEGRITY (2)` — most
severe wins. An integrity failure **dominates** an authority failure: if you cannot trust the
bytes of even one credential, the whole bundle is rejected as tampered (exit 2). So the bundle
exits `0` only if **every** part verifies; else `2` if any part failed integrity; else `3`.

## The four bundles — what each one proves

All four share one honest gym issuer + one agent (except the inflated bundle, which is signed by
a separate **rogue** key). Keys are Ed25519; each bundle carries its issuer's public JWK.

### 1. `valid-bundle.json` → exit **0** (verdict code 0)
The honest bundle. The agent earned **L3** from 6 episodes (5/6 pass, avg reward ≈ 0.66, six
distinct scenarios including one held-out, no catastrophe). Integrity ✓, issuer signature ✓,
the 6-row backing folds to the signed `chain_head` ✓, and **L3 re-derives** from that backing
under the pinned policy ✓.

### 2. `tampered-bundle.json` → exit **2** (verdict code 1)
The naive forgery. A digest-covered shown-work statistic (`derivation.avgReward`) was doctored
upward **without re-signing**. The Warrant's self-digest no longer recomputes → `warrant_digest
mismatch — a field was tampered`. Caught by integrity before anything else is even checked.

### 3. `inflated-bundle.json` → exit **3** (verdict code 3) — *the flagship for re-derivation*
The sophisticated forgery. A **rogue signer** minted a Warrant over evidence that only supports
**L2**, then edited `license_level` **and** the shown-work `derivation.level` to **L4**, recomputed
the digest, and re-signed with its own key. This bundle honestly names the rogue as its issuer,
so *every self-referential check passes*: the self-digest recomputes ✓, the signature is valid ✓,
the issuer thumbprint matches ✓, the backing folds ✓. It is caught **only** because the verifier
**re-runs the license policy on the raw backing and gets L2**, not L4 →
`level inflation — Warrant claims L4 but the policy re-derives L2`.

> **Why the rogue cannot win either way.** If instead the bundle had pinned the *real* gym as
> issuer (the trust anchor a relying party actually uses), the rogue's signature fails the gym's
> key → **code 2 (bad issuer sig), exit 3** (asserted in the test suite). A signature buys you a
> signer, never a level. An attacker without the gym key cannot produce a bundle that *both*
> re-derives *and* verifies.

### 4. `cherry-picked-bundle.json` → exit **2** (verdict code 4) — *"you cannot export a cleaner record than you earned"*
The most faithful exporter attack, and it needs **no key at all**. The lowest-reward evidence row
(a failed episode) was simply **dropped** from the Warrant's `backing`. The warrant digest commits
the backing's `chain_head` *root* (not the inlined leaves), so integrity ✓ and the issuer signature
✓ **still pass unchanged** — yet the five remaining rows no longer fold to the signed head and leave
an `agent_seq` gap → `incomplete agent chain — agent_seq gap: expected 3, got 4 (evidence row
omitted or reordered)`. The issuer signed your *complete* verdict set; a subset is detectable.

## What this does and does not prove

Re-deriving green means the recorded level is exactly what the pinned policy computes from the
committed evidence, and that the evidence set is complete and un-tampered — offline, by anyone.
It does **not** assert the policy is the *right* policy, or that the underlying episodes reflect
real-world competence. It closes forgery and cherry-picking, not the question of what to reward.

---

*The example bundles are generated from real mints; regenerate by minting fresh Warrants and
re-running the verifier — the exit codes above are invariant. See
`packages/verifier-core/countersign-verify.test.ts` for the same four cases built from scratch.*
