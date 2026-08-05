# Evaluation conventions

The standard this repo holds its own published numbers to. Every artifact under
`apps/origin-web/public/trust/` is expected to follow these conventions; deviations are defects.
This document exists so the conventions are citable — by artifacts, by lint rules, and by anyone
re-checking our numbers.

The one-sentence version: **a number may only ever mean what its authority actually established,
and everything else about the run — refusals, failures, provenance, what a stranger can recompute —
travels with the number instead of disappearing under it.**

---

## 1. Authority

Every evaluation names what decides that an output is correct. The recognized kinds:

| Kind | Meaning | Example here |
|---|---|---|
| `generator` | ground truth by construction (seeded synthesis) | floor benches, perceiver dataset |
| `oracle` | deterministic code over behavior | `bfsOracle`, `parseGate`, the fleet verifier |
| `signature-list` | deterministic matching against a curated list | — (none currently; if used, the artifact must state that "not detected" ≠ "absent") |
| `human-frozen` | a small, versioned, frozen human-labelled corpus | — |
| `human-signoff` | a named person's recorded decision | ESCALATE-lane resolutions |

**An LLM is never the authority.** An LLM may be the *measured subject* (the thing being scored) or
a *proposer* ahead of a deterministic gate; its say-so never defines "correct" for a published
number or a gate decision. When an LLM judge is studied as a baseline, its output is data —
measured against the oracle — and a reply the parser cannot classify is a raised error, never a
verdict. The same field must never carry labels from two different authorities.

## 2. Outcome vocabulary

Every published rate carries three counts, whatever the local type names are:

```json
"counts": { "n_total": 72, "n_measured": 71, "n_refused": 1, "n_unevaluated": 0 }
```

- **measured** — the authority answered.
- **refused** — the subject or a gate declined (VOID, abstained, escalated). Informative; often the
  product working. Reported as its own rate, never folded into pass/fail.
- **unevaluated** — infrastructure failed (timeout, API error, unparseable transport). Says nothing
  about the subject and may never appear in any mean under any encoding — not 0, not the scale
  minimum, not a neutral midpoint, not an unflagged worst-case value.

Headline denominators use `n_measured`. Breakdowns accompany the counts
(`refused_breakdown`, `unevaluated_breakdown`) so a cause is never recoverable only by
triangulation.

**Abstention has two flavors and both are first-class:** *the answer is genuinely none* (a
substantive negative) and *it could not be determined* (an absence). They get distinct
representations, they ride the same object as any score, no consumer reads a score without
checking status first, and status is included in any digest or fingerprint derived from the
finding.

## 3. Failure direction

Every metric declares which way it fails when evaluation itself breaks. For a **gate**, fail-closed
means refusal (block / no artifact). For a **detector's score**, fail-closed means abstention —
`unevaluated`, counted separately. A handler may return a value only when that value is
semantically identical to what the failure means; an authority that cannot answer must raise, not
guess. Concretely: an oracle-side crash must never label a row wrong, and a dead container must
never read as a successful kill.

Guards that make this operational:

- **Minimum-measured**: a run that loses too many rows to infrastructure refuses to emit a report
  at all (denominator shrinkage flatters means silently).
- **Check-before-write**: regression gates run before the artifact is written; a failed run writes
  nothing.
- **No vacuous passes**: an empty denominator is a defect, not a pass.

## 4. Provenance

Every published artifact carries (or is accompanied by a dated companion carrying):

`producing_commit` · tool/verifier version · authority kind + id · corpus/dataset digest
(content-addressed over sorted path + bytes + tool version) · seeds — including honesty about seeds
a provider ignores · model id, temperature, reasoning setting, token budget (or `null` when no
model is involved) · a runnable reproduce command · `predecessor` when superseding, with the reason
· `corrections[]` when amending.

**Dated artifacts are immutable.** Corrections and additions ride a NEW dated file that references
its predecessor — history is append-only.

**Run outputs are write-once.** Reports and per-row files are named by date + content digest and
are never overwritten with different bytes. Per-row results are a first-class artifact: the run
report cites its rows file by digest, and both publish together. (This convention exists because a
smoke run once overwrote the only copy of a headline experiment's raw rows, leaving its aggregates
permanently unrecomputable — see `public/trust/perceiver-2026-08-04-rederivability.json`.)

## 5. Re-derivability

Every artifact declares what a third party can actually recompute, in one of four tiers:

| Tier | Meaning |
|---|---|
| `free-bit` | no key, no spend, byte-identical recompute (e.g. the bench `--check` commands) |
| `free-statistical` | no key; exercises the same pipeline, numbers vary |
| `api-statistical` | reproducible in distribution only, at API cost |
| `attested-only` | not recomputable from retained data; the aggregate must be trusted or the pipeline re-run |

"Reproducible" without a qualifier belongs only to `free-bit`. Every other tier carries its
qualifier in the same sentence as the number. `attested-only` is legitimate **only when declared**;
silence about it is the defect.

## 6. Scope strings

Every artifact states, inside the artifact, what was and was not measured — in the form "numbers
hold under THIS scorer on THIS dataset; no broader claim." Synthetic is labeled synthetic;
"measured" means a real authority-scored run and everything else is "projected." A benchmark whose
classes are constructed relative to the system's own thresholds says so: it is a regression pin,
not a discovery instrument.
