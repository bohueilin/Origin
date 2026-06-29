# Review — Codex's RSI P0 Fixes (round 3)

## Verdict: ACCEPT WITH MINOR FIXES
The three round-2 P0 blockers (H1 refuse-class, M2 git/checksums, M3 oracle-bridge) are genuinely fixed and independently re-verified — refuse is real hazard geometry, not a label. But `oracle_training_v1.jsonl` leaks 100% of the test set into the training material (535/2244 rows, 23.8%, non-train) and the validator is blind to it; that and the H2 provenance confound must be fixed before training.

## Gate results (lead-verified, re-confirmed by me)
- `npm run build:rsi` → exit 0, 4704 layouts + 4704 tensor rows, augmenter stdout `used_origin_reward_bridge: true`.
- `npm run validate:rsi` → exit 0, `"ok": true`. finish 1009 / escalate 2947 / refuse 748 (was 0 in r2); connected 4045 / disconnected 659; balanced oracle_training_v1 748/748/748.
- `node scripts/test_verifier.mjs` → verifier tests passed.
- `shasum -a 256 -c CHECKSUMS` → all 6 OK (layouts, graph_tensors, hard_negatives_v1, oracle_training_v1, splits, stats). **Re-run by me: all 6 OK.**
- git: 4 commits — `f13cadf` (build+augment), `6a6d2f1` (checksum pin), `ef7ba85` (reproducible timestamp), `9341fe8` (checksum update). `git rev-list --count HEAD` = 4. **Re-confirmed.**
- `git check-ignore -v outputs/rsi_dataset/layouts.jsonl` → `.gitignore:5: outputs/**`. Heavy JSONL never committed. **Re-confirmed.**
- splits: train 3774 / val 474 / test 456 = 4704.

## P0 scorecard

| ID | Item | Status | Evidence (measured) |
|----|------|--------|---------------------|
| H1 | refuse-class hazard geometry (r2 `hazards:[]` bug) | **FIXED** | 748/748 refuse rows carry ≥1 hazard on item (374) or drop (374); 0 rows with no unsafe cell. Reverses r2's 0/3757. |
| H1b | Origin's real oracle agrees refuse | **FIXED** | Re-ran `reward_bridge.bfs_oracle`/`_is_hard_refusal` with NO refusalReason injected: 748/748 → refuse. Skeptic's *independent* JS reimpl from `warehouse.ts` agrees: 748/748, 0 disagreements. Porous test: strip hazards → 748/748 → finish (honest refuse, not escalate). |
| M2 | git commits + checksums + .gitignore | **FIXED** | 4 commits; 6/6 checksums OK; layouts.jsonl ignored; `git log --all` shows heavy files never committed. |
| M3 | oracle bridge matches Origin's bfsOracle | **FIXED** | Augmenter imports Origin `reward_bridge`; replay over all 4704 rows = 0 divergence, incl. the 12 `start==item==drop` rows (all finish, Origin agrees). Distance-0-falsy bug cannot recur (`_shortest_path` returns `[]` truthy, `is not None` checks). |
| M5 | validator compiles JSON Schemas (ajv) | **RESIDUAL** | No ajv anywhere (`grep ajv scripts/ package.json` empty; no node_modules). Checks hand-rolled via `exactKeys`/`required`; `additionalProperties:false` is decorative. **Plus new gap:** `validateOracleTrainingView()` (validate_rsi_dataset.mjs:296-311) checks only existence + label balance + layout_id-resolves — never split purity. |
| H2 | oracle_label confounded with provenance | **PARTIAL** | Improved on geometry_kind/license_class (refuse no longer separable, majority share 0.606). But by `source_domain`, refuse = 748/748 AUG, finish = 748/748 BASE in the training view; rule `source==aug ⇒ refuse` recall 1.000. `graph_tensors.jsonl` **exposes** `source_domain`/`geometry_kind`/`license_class` as trained columns (verified key list). |

## Findings by severity

**CRITICAL — test-set contamination of the training view (AUG-L2, NEW).** `oracle_training_v1.jsonl` (2244 rows, balanced 748/748/748 confirmed) mixes splits: train 1709 / **test 456 / val 79** → 535 rows (23.8%) are not from train. Per-label × split (my re-run): finish{train 650, test 98}, escalate{train 454, test 294}, refuse{train 605, val 79, test 64}. **456 of 456 test floors (100%) appear in the training view.** Root cause: `balanced_oracle_training_view()` at `hazard_augment.py:254` does `sorted(..., key=lambda r:(split_by_id.get(id,''), id))[:n]` — `'test' < 'train' < 'val'` alphabetically, so test rows are taken first. The file carries **no split column** (confirmed: `has split column: false`), so a consumer cannot filter back to train-only. Anyone training on this view and evaluating on the test split has zero unseen test floors. Skeptic reproduced the exact on-disk row set from this rule (0 in-repro-not-on-disk, 0 on-disk-not-in-repro).
- Files: `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/oracle_training_v1.jsonl`, `/Users/bohueilin/hackathons/Floor design/services/foundry-train/hazard_augment.py:254`

**HIGH — validator blind to the leak (AUG-L3 / M5 extension).** `npm run validate:rsi` → ok:true while AUG-L2 is on disk. `validateOracleTrainingView()` (validate_rsi_dataset.mjs:296-311) never checks split purity or asserts a split column — unlike `validateHardNegatives` (line ~286) and `validateTensor` (the "split mismatch" check) which do enforce split consistency. The one training artifact is the unguarded one.
- Files: `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs:296`

**HIGH — H2 provenance confound exposed as a feature (AUG-H2, PARTIAL).** In `oracle_training_v1.jsonl`: refuse 748/748 AUG; finish 748/748 BASE; escalate = CubiGraph5K 671 / aug 52 / procedural 25 (exact source_domain breakdown confirmed). A classifier can predict refuse perfectly from `source_domain` alone, and `graph_tensors.jsonl` (the trained feature file) exposes that column. The label stays geometry-honest per-row; the *training signal* is shortcut-able.
- Files: `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/graph_tensors.jsonl`, `hazard_augment.py:206`

**MEDIUM — hard-negative reward-0 demonstration is weaker for 269 rows (HARD-NEG, PARTIAL).** All 748 hard_negatives_v1 rows score reward 0 (re-derived via Origin `verify_rollout`: {0:748}, 0 nonzero). But category split = unsafe_zone 479 / **fake_finish 269**, and `unsafeEntered=true` for only 479. The 269 are the hazard-on-drop `start==drop` cases: 0-move trajectory, reward 0 via finish-without-drop rather than physically entering the hazard. Refuse *label* honest in all 748; the hard-negative *trace* is a weaker demonstration for 269. (Not a blocker.)
- Files: `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/hard_negatives_v1.jsonl`, `hazard_augment.py:215-239`

**Residuals confirmed, non-blocking:** M5 no-ajv (schemas read but never compiled; `additionalProperties:false` decorative). Validator's hard-neg reward-0 check trusts the field, doesn't replay (field is in fact honest). M3 builder clone `siteMapOracleLabel` (build_rsi_dataset.mjs:713-726) lacks `isHardRefusal` — latent only because 0 base rows have item/drop on a hazard (all 748 refuse are augmentation-sourced); 0 divergence in practice. L1 edge_attr 3 cols redundant (`[adjacent, door-onehot, weight]`, weight tied to type). CHECKSUMS `build_source_commit=ef7ba85` lags HEAD `9341fe8` (which changed only CHECKSUMS — harmless). `used_origin_reward_bridge:true` is augmenter stdout, **not** a field in `stats.json` (grep = 0 matches) — substance correct, but the lead-gate phrasing implies a persisted field.

**Clean (no leakage vector):** Augmented-floor split leakage AUG-L1 — 947 aug rows, 0 cross-split, 0 floor-families spanning >1 split, verified two ways (source_record_id and stripped layout_id agree for all 947). Hard-negatives carry a correct `split` field (train 605 / val 79 / test 64), self-filterable. Skeptic independently failed to falsify both refuse-honesty and AUG-L1.

## What's now genuinely model-ready
- The **base dataset** (layouts, graph_tensors, splits, hard_negatives_v1) is sound: oracle labels match Origin (0 divergence), refuse class is real geometry, checksums hold, reproducible build (fixed `generated_at`, byte-faithful local-oracle fallback), splits leak-free at the floor level, hard-negatives reward-0 and split-tagged.
- The **balanced `oracle_training_v1` view is NOT model-ready** as-is: it leaks 100% of test and 79 val floors into training, has no split column to recover from, and bakes the source_domain provenance shortcut into the trained features.

Before training: (1) rebuild the balanced view from **train-only** rows (or add a split column and filter downstream); (2) drop or neutralize `source_domain`/`geometry_kind`/`license_class` from `graph_tensors.jsonl` features, or balance refuse across base+aug provenance; (3) add a validator gate asserting oracle_training split purity so this can't regress silently.

## PROMPT TO SEND BACK TO CODEX

```md
Round-3 review: ACCEPT WITH MINOR FIXES. Your three round-2 P0 blockers are genuinely fixed and independently re-verified (H1 refuse = real hazard geometry, 748/748 confirmed by Origin's own oracle AND a from-scratch reimpl; M2 git/checksums/gitignore all clean, 4 commits, 6/6 shasum OK; M3 oracle bridge 0 divergence vs Origin over all 4704 rows incl. the 12 distance-0 rows). Hard-negatives all reward-0. Do NOT redo any of this.

Two new/residual P0s block training on the balanced view — fix these before the v1 baseline:

1. [CRITICAL] oracle_training_v1.jsonl leaks 100% of the test set into training.
   - 535/2244 rows (23.8%) are non-train: test 456 / val 79. All 456 test floors appear in the view.
   - Root cause: balanced_oracle_training_view() at services/foundry-train/hazard_augment.py:254 sorts by (split_name, id) and slices [:n]; 'test' < 'train' alphabetically so test rows are taken FIRST.
   - Fix: select the balanced view from TRAIN-ONLY rows (filter split_by_id[id]=='train' before sampling), and ADD a 'split' column to oracle_training_v1.jsonl so it's self-filterable like hard_negatives_v1.jsonl already is.

2. [HIGH] Validator is blind to this. validate_rsi_dataset.mjs:296-311 validateOracleTrainingView() checks only existence + label balance + layout_id resolution.
   - Fix: assert every oracle_training_v1 row's split=='train' (matching the validateTensor/validateHardNegatives split checks). This gate would have caught #1.

3. [HIGH] H2 provenance confound is only partial. In the balanced view refuse=748/748 'Origin deterministic hazard augmentation' and finish=748/748 base; graph_tensors.jsonl exposes source_domain/geometry_kind/license_class as trained columns (rule source==aug ⇒ refuse, recall 1.000).
   - Fix: drop source_domain (and ideally geometry_kind/license_class) from the trained feature set, or balance refuse across base+aug provenance, so the model learns hazard geometry, not provenance.

Lower priority, not blockers (can defer): hard_negatives_v1 demonstrates reward-0 via fake_finish (0-move, start==hazard) for 269/748 rather than unsafe-entry — refuse label still honest, but consider regenerating those 269 so the rejected trajectory physically enters the hazard. M5 still stands (validator hand-rolls checks, never compiles the JSON Schemas with ajv; additionalProperties:false is decorative) — wire ajv when convenient. CHECKSUMS build_source_commit (ef7ba85) lags HEAD (9341fe8); persist used_origin_reward_bridge into stats.json instead of stdout-only.

Once 1-3 land and validate:rsi gates split purity, ship it and proceed to the v1 baseline + the training-environment P0s from round 2.
```

Relevant files: `/Users/bohueilin/hackathons/Floor design/services/foundry-train/hazard_augment.py:254` (leak root cause), `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs:296` (blind validator), `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/oracle_training_v1.jsonl` (no split column), `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/graph_tensors.jsonl` (exposes provenance columns).
