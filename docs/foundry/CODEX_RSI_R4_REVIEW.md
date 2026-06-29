# Review — Codex's RSI Fixes (round 4)

## Verdict: SHIP IT
The three round-3 blockers are fixed with teeth: the CRITICAL test-set leak is gone (oracle_training_v1 is 100% canonical-train via independent join, balanced 605/605/605), the validator now *gates* split purity with a real splits.json join that I proved flips `ok:false` on a reintroduced leak, and the H2 provenance columns are dropped from all 4704 trained-tensor rows. Two known, documented residuals remain (a recoverable `layout_id` provenance proxy and 269 degenerate hard-negs) — neither is a leak and neither blocks shipping.

## Gate results
- **build:rsi** — exit 0, 4704 rows (lead-verified; I did not re-run, per read-only constraint).
- **validate:rsi** — `ok:true`; `oracle_training_rows: 1815`, balanced; new check present: `"balanced train-only oracle_training_v1 view exists"`.
- **test_verifier** — passed (lead-verified).
- **checksums** — `shasum -a 256 -c CHECKSUMS`: all 6 artifacts OK (independently re-run). HEAD `0b5f654` ("Update RSI checksum pin after split fix"); fix commit `c363221`. Working tree clean.

## Scorecard

| # | Round-3 item | Status | One-line evidence |
|---|---|---|---|
| R3-1 | CRITICAL test-set leak in oracle_training_v1 | **FIXED** | Independent join vs splits.json: 1815 rows, own-split {train:1815}, canonical {train:1815}, own≠canonical = **0**, 0 in val, 0 in test, 0 dupes, balance 605/605/605. r3 signature (535/2244 non-train) absent. |
| R3-2 | Validator gates split purity (catches reintroduced leak) | **FIXED (teeth)** | `validate_rsi_dataset.mjs:313` asserts own `split==='train'`, `:314` asserts canonical `splitById.get(layout_id)==='train'` — a real join, not self-report. Lead+skeptic both proved on sandbox copies that a row *lying* `split:'train'` while canonical=test flips `ok:false` via :314. |
| R3-3 | H2 provenance confound dropped from trained features | **FIXED** | graph_tensors.jsonl: 1 keyset across all 4704 rows, `source_domain`/`geometry_kind`/`license_class` = **0/4704**; `exactKeys` (:206) rejects reintroduction. No single numeric feature is a 1:1 refuse separator (max MI dim_l = 17.4% of label entropy). |
| R3-4 | Build reproducible + checksums pin new files | **FIXED** | All 6 checksums OK; export_graph_tensors.mjs re-run reproduces pinned hash `94f78bce…` byte-identical. |
| R3-M5 | Validator compiles schemas via ajv | **RESIDUAL (low)** | 0 ajv refs in validator; ajv not in package.json, not in node_modules. Schemas read for `.title` only (:71-74); row shape hand-rolled via `exactKeys`. Schema/validator can drift independently. |
| R3 hard-negs | fake_finish 0-move hard-negatives | **RESIDUAL (low)** | **269/748** are `category:"fake_finish"`, zero-move, all end in finish (skeptic correct; the "0 fake_finish" read keyed on `variant_kind`, but the `category` field is the right axis). All reward=0, expected=refuse. Not a leak. |

## Findings by severity (real residuals only)

**MEDIUM — `layout_id` is a recoverable provenance proxy (H2-3 / skeptic [b]).** The 3 prov columns are gone, but `layout_id` is still a tensor key and **all 748 refuse rows contain `_aug_`** (refuse&non-aug = 0/4704 → recall 1.000; precision 0.790 since 199 non-refuse aug rows exist). A consumer that tokenizes/keys on `layout_id` can recover refuse-capability. The round-4 "no residual proxy" headline overstated this; README:130-132 documents it honestly, so it's a known limitation, not a hidden leak. *Action: keep `layout_id` an opaque join key downstream — do not feed it to the model as text.*

**MEDIUM — validator's split gate trusts splits.json as an unverified root (skeptic [a], `holds:false`).** Line 314 joins against `splitById`, built solely from `splits.json` (lines 14, 63-67). The gate has full teeth against leaks injected into the *view* (the stated threat). But if `splits.json` itself is also tampered, :314 won't fire — the leak is only caught incidentally by the graph_tensors split-consistency check at `:213`. splits.json is a trusted root, not independently re-derived. *Not a blocker; flag for a future integrity check (e.g. pin/sign splits.json — it is already in CHECKSUMS, which is the practical mitigation).*

**LOW — M5 (no ajv).** Declared JSON Schemas are never machine-enforced; `TENSOR_KEYS` is byte-equal to the schema's required list today but nothing binds them. Carry forward.

**LOW — hard-neg diversity.** Single `variant_kind` (`hazard_on_target`); 269/748 are degenerate zero-move fake_finish. Broaden variants in a future build.

Skeptic net: 5/7 claims `holds:true`; the 2 `holds:false` are the two MEDIUM residuals above — both already captured in the team's own H2-3/M5 findings, neither a leak.

---

## PROMPT TO SEND BACK TO CODEX

```md
SHIP IT — round-4 RSI fixes accepted.

All three round-3 blockers are fixed with teeth, independently verified:
- CRITICAL test-set leak ELIMINATED: oracle_training_v1.jsonl is 1815 rows,
  100% canonical-train via an independent join against splits.json
  (own≠canonical = 0, 0 in val, 0 in test, 0 dupes), balanced 605/605/605.
- Validator GATES split purity with a real join (validate_rsi_dataset.mjs:314)
  — a row lying split:'train' while canonical=test flips ok:false. Proven on
  sandbox copies.
- H2 provenance dropped from all 4704 graph_tensors rows (source_domain/
  geometry_kind/license_class = 0/4704; exactKeys rejects reintroduction).
- Build reproducible; all 6 CHECKSUMS OK; validate:rsi ok:true with new check
  "balanced train-only oracle_training_v1 view exists".

PROCEED to the v1 baseline (node-type classification) + the training-environment
P0s in order: floor_sampler → build_dataset → gym-rollout.

Carry these residuals forward (do NOT block on them, but track):
1. layout_id is a recoverable provenance proxy — every refuse row contains
   "_aug_" (recall 1.0, precision 0.79). When you build the v1 baseline, treat
   layout_id as an OPAQUE join key only — never feed it to the model as text/
   tokens, or the H2 confound re-enters through the back door.
2. Split gate trusts splits.json as an unverified root: a leak injected into
   the VIEW is caught (:314), but tampering splits.json itself is only caught
   incidentally by the graph_tensors consistency check (:213). splits.json is
   pinned in CHECKSUMS — fine for now; add an explicit integrity assert if the
   pipeline ever regenerates splits.
3. M5: declared JSON Schemas are never compiled (no ajv); shapes are hand-rolled
   via exactKeys. Wire ajv (or delete the unused schema files) before v1 ships so
   schema and validator can't silently drift.
4. Hard-neg diversity: 269/748 are degenerate zero-move fake_finish negatives,
   single variant_kind=hazard_on_target. Broaden variants in the next dataset rev.

None of (1)–(4) is a leak. Green to proceed.
```

---
http://localhost:5275/app.html

**Key file references (all absolute):**
- `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs:313-314` — the split-purity gate (own field + canonical join)
- `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs:63-67` — splitById built solely from splits.json (the trusted root)
- `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/oracle_training_v1.jsonl` — 1815 rows, leak-free, balanced
- `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/graph_tensors.jsonl` — 4704 rows, prov-free; `layout_id` `_aug_` proxy lives here
- `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/hard_negatives_v1.jsonl` — 748 rows; `category` field shows 269 fake_finish / 479 unsafe_zone
- `/Users/bohueilin/hackathons/Floor design/CHECKSUMS` — all 6 artifacts pinned, verified OK
