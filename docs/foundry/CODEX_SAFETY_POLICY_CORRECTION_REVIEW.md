# Review — Codex Safety Policy v1 claim-correction

Verifies Codex's correction continuation. No accepted RSI fix redone. Local only — nothing pushed.

## Verdict: SHIP IT

Codex implemented **every** correction from the prior review, and it's verified clean. The
overclaim is gone, the headline is the honest raw-geometry number, the oracle-recovery 1.0 is
labeled as an upper bound, and a feature-disjoint generalization split was added. The plumbing
(no leakage, saved==reported, refuse-recall surfaced, local training) still holds.

Claim boundary (honored): Gemma proposes · Origin verifies · the deterministic oracle is the judge — a bounded robot-readiness Gym, not production robot certification.

## Gate results (all run by the lead, all pass)

```
python3 -m py_compile ml/{safety_policy,train_safety_policy,eval_safety_policy}.py → OK
npm run policy:v1        → exit 0  (raw_geometry headline; unsafe_no_path & full = upper bounds)
npm run eval:policy      → exit 0  saved-vs-reported delta 0.0
npm run build:prefpairs  → exit 0  4704 pairs, divergence 0
npm run validate:prefpairs → exit 0  ok:true
npm run propose:verify   → exit 0  24 candidates, 9 unsafe caught, divergence 0
npm run render:dashboard → exit 0
npm run validate:rsi     → exit 0  ok:true   (accepted dataset unchanged)
node scripts/test_verifier.mjs → exit 0
shasum -a 256 -c CHECKSUMS → 6/6 OK
```

## The honest numbers (reproduced)

| Feature view | features | test balanced acc | label |
|---|---|---|---|
| **`raw_geometry`** | **22** | **0.93949** | **the policy headline** (vs 0.333 majority) |
| `unsafe_no_path` | 25 | 1.0 | oracle-recovery (keeps the unsafe flags) |
| `full_oracle_summary` | 36 | 1.0 | **oracle-recovery upper bound** — not a safety claim |
| feature-disjoint regroup (raw geometry) | 22 | **0.900331** | generalization, **0 train/test vector overlap** (supplementary, not the canonical headline) |

refuse recall (saved best-val, epoch 120): val 0.96 / test 1.0. saved-vs-reported delta 0.0.

## Verification of the 9 review points

1. ✅ Read the handoff + `RSI_PREF_PAIRS_HANDOFF.md`.
2. ✅ Inspected `safety_policy.py` / `train_safety_policy.py` / `eval_safety_policy.py`.
3. ✅ **No leakage**: `extract_features()` is geometry-only; grep for `source_domain`/`geometry_kind`/`license_class`/`oracle_label`/`pair_id`/`reward` in feature extraction returns nothing. `layout_id` is join-only (`load_pair_indices`), never featurized.
4. ✅ **pref_pairs train-only + terminal-different**: `safety_policy.py:133` `if pair.get("split") != "train": continue`; `:144` `if winner == loser: same_terminal_skipped`. (2,974 terminal-diff DPO rows used; 800 same-terminal skipped.)
5. ✅ All gates pass (above).
6. ✅ **Overclaim gone**: every "100%" string in README / dashboard / handoffs is now the *corrected* framing ("oracle-recovery upper bound, **not** '100% learned safety'"; listed under "what NOT to claim"). Headline is `raw_geometry 0.93949`.
7. ✅ The 36-feature 1.0 is labeled **`oracle_recovery_upper_bound`** in code + docs + dashboard, never as the safety number.
8. ✅ Feature-disjoint regroup reports **0** train/test feature-vector overlap (test bal-acc 0.900331) and is presented as supplementary — it does not replace the canonical split headline.
9. ✅ Recommendations below.

## One honest note (not a blocker)
The raw-geometry policy trains **noisily** — val refuse-recall swings across epochs (0.20 → 0.96), a real signature of genuine learning (vs the upper-bound view that snaps to 1.0 by epoch 10). The saved model is selected on best val-balanced-accuracy (epoch 120) and lands well, but a different seed/epoch could shift refuse-recall. **Recommend reporting the headline as a mean ± range over ~5 seeds** (the prior review already saw ~0.937 ± over 5 seeds) so the 0.939 isn't read as a single lucky run.

## Recommendations

- **Next demo/product step:** wire the dashboard's money beat into the live Origin Foundry app — one click that runs propose→verify and shows the funnel + the "proposer said FINISH / oracle said REFUSE" floor + the honest scorecard (raw-geometry 0.94 headline, upper-bound 1.0 labeled). This makes the Gemma-proposes / Origin-verifies loop the visible hero, not a static file.
- **Next science step:** move from hand-engineered geometric summaries to a **raw-occupancy model** — a small CNN/GNN over the actual cell grid (occupancy / hazard / human-only / start / item / drop planes) predicting the terminal, with NO precomputed manhattan/path/degree features. That is the real "learns spatial reasoning from the floor" result. Pair it with a **source-domain holdout** (train CubiCasa-derived, test procedural/MLStructFP) for a cross-distribution generalization number.

## Prompt to send back to Codex

```md
Safety Policy v1 claim-correction — SHIP IT, verified. Every correction landed:
- headline = raw_geometry 0.93949 (22 feats); full-36 = 1.0 labeled oracle_recovery_upper_bound;
  feature-disjoint regroup = 0.900331 with 0 train/test vector overlap (supplementary).
- no leakage (geometry-only features; layout_id join-only; no provenance/label/reward/pair_id);
  pref_pairs train-only + terminal-different (2974 used / 800 skipped); saved==reported delta 0.
- overclaim removed everywhere ("100%" only appears as the corrected "do-not-claim" framing).
- all gates green (policy:v1, build/validate prefpairs, propose:verify, render:dashboard,
  validate:rsi, test_verifier, 6/6 CHECKSUMS).

Two follow-ups (not blockers):
1. Report the raw-geometry headline as mean ± range over ~5 seeds — the per-epoch refuse-recall
   is noisy (0.20→0.96), so a single 0.939 reads as lucky; the 5-seed mean (~0.937) is the honest headline.
2. NEXT science: a raw-occupancy CNN/GNN over the cell grid (no hand path/degree features) +
   a source-domain holdout (train CubiCasa, test procedural/MLStructFP) — that's the real
   "learned spatial reasoning + generalizes across distributions" result.
NEXT product: wire the dashboard money beat into the live Origin Foundry app (one-click propose→verify).
Keep: bounded Gym, not production cert; Gemma inference-only; oracle is the judge.
```
