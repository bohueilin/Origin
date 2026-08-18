# Over-grant metrics — definitions, denominators, and what is actually verifiable

> **Model proposes. Environment verifies. Gate decides. Trace proves. — Capability is not permission.**
>
> The IAM gym ([`packages/verifier-core/iamGym.mjs`](../packages/verifier-core/iamGym.mjs)) scores a
> **policy** against a fixed battery of decisions: *would this agent decide correctly?* The
> over-grant analyzer ([`packages/verifier-core/overGrant.mjs`](../packages/verifier-core/overGrant.mjs))
> points the other way and scores **observed authority** against what was actually exercised: *how
> much authority is this fleet holding that it never uses — and what could it reach if one identity
> were hijacked?*

Everything here is computed from a **seeded synthetic** agent fleet and tool-call log. The published
artifact measures the **analyzer**, not any real deployment. Synthetic is labeled synthetic; the
artifact's own `scope` string says so.

## Why denominators are the whole thing

A utilization number without a stated denominator is a vibe. Two rules apply throughout:

1. **Fleet aggregates are Σnumerator ÷ Σdenominator, never the mean of per-identity ratios.**
   Mean-of-ratios lets one busy 3-scope agent cancel out a dormant 60-scope one.
2. **Every metric measures something the others do not.** An earlier draft reported
   `gur.overGrantSurface` and a `sah.dormantFraction` that were the same number by construction.
   Two numbers that are the same number are one number wearing a hat. SAH is now scoped to the
   authority actually in use, and the dormant count survives only as a labeled cross-reference.

## The five metrics

| | Metric | Numerator | Denominator |
|---|---|---|---|
| **GUR** | Grant-Utilization Ratio | distinct scopes exercised with an `allow`, joined back to the grant | scopes granted **at or before window start** |
| **BRI** | Blast-Radius Index | distinct sensitive (`high`\|`forbidden`) resources reachable under **effective** authority | sensitive resources in the catalogue |
| **AMV** | Attenuation-Monotonicity Violations | delegation edges where `child.granted ⊄ parent.granted` | delegation edges |
| **TRP** | Taint-Reachability | tainted identities holding **both** a sensitive read **and** an egress capability | tainted identities (plus `paths` = Σ reads × writes, the surface) |
| **SAH** | Standing-Authority Half-Life | — | median over **exercised** scopes of `(window − last_use) ÷ ttl` and `(last_use − first_use) ÷ ttl` |

Three details that carry most of the meaning:

- **A `deny` is not use.** An identity does not "use" authority it was refused, and an `allow` on a
  scope outside the grant does not count either. Both are asserted in the test suite.
- **Grants minted mid-window are excluded from GUR's denominator** so a fresh grant is not scored as
  waste before it has had a chance to be exercised.
- **Effective authority = own grants ∪ every descendant's, transitively.** Under a correct
  attenuating capability token (macaroon / biscuit model) this union is a **no-op**, because a child
  can only narrow. It stops being a no-op exactly when an attenuation violation exists somewhere
  below — so a single violation three hops down widens the blast radius measured *at the root*.
  **AMV is not a hygiene metric; it is the integrity precondition that makes BRI and TRP mean
  anything.** Both behaviours are pinned by tests.

## What is verifiable, and at what tier

Per [`EVALUATION-CONVENTIONS.md`](EVALUATION-CONVENTIONS.md) §5:

- **`free-bit`** — the published artifact `public/trust/over-grant-bench.json` is a pure function of
  its seed. `npm run bench:overgrant:check` (inside `npm run gates`) fails the build if the committed
  JSON drifts from the analyzer in source. No key, no spend, byte-identical recompute.
- **Ground-truth scored, not merely computed.** The corpus generator *plants* a known population of
  attenuation violations and dormant scopes; the bench refuses to publish unless the analyzer
  recovers them with catch rate 1 and zero false positives, and unless the dormant count matches
  exactly. A metric you cannot score against ground truth is a dashboard, not a verifier.
- **Two independent implementations.** The same five metrics are implemented in SQL under
  [`packages/verifier-core/sql/over-grant/`](../packages/verifier-core/sql/over-grant/) — including
  the delegation closure as a recursive CTE — and `npm run sql:conformance` (in `packages/verifier-core`)
  asserts that all 20 reported fields agree with the JavaScript analyzer. The JS analyzer is the
  authority; the SQL exists to keep it honest. This check is **not** in `npm run gates`: it needs
  `node:sqlite` (Node ≥ 22.5) and CI runs Node 20, so it skips with an explicit notice rather than
  failing a build for an unrelated reason.

## Limits (say these before they are discovered)

- The corpus is **synthetic**. These numbers describe the instrument, not an enterprise. No claim
  about any real fleet's over-grant surface is made or implied anywhere in this repo.
- GUR measures **breadth of use, not necessity**. A scope exercised once in the window counts as
  used; whether it *should* have been granted is a policy question this metric does not answer.
- BRI counts **reachability, not exploitability**. It is an upper bound on what authority permits,
  not a claim that a path is exercisable end to end.
- TRP encodes the lethal-trifecta shape (untrusted content + private data + external comms). It is a
  **structural** exposure count. It does not detect an exfiltration, and containing one is Cordon's
  job, not this analyzer's.
- The window is a parameter. Every ratio here is relative to it, and a longer window will move GUR
  and SAH in opposite directions.

## Running it

```bash
cd apps/origin-web && npm run bench:overgrant          # regenerate the published artifact
cd apps/origin-web && npm run bench:overgrant:check    # fail if the committed artifact is stale
cd packages/verifier-core && npm test                  # the hand-computed fixture + properties
cd packages/verifier-core && npm run sql:conformance   # SQL vs JS, 20 fields
```
