# Review — Codex's RSI Fixes (round 2)

## Verdict — ACCEPT WITH MINOR FIXES

The F1–F8 fix slate is real and verified: schema/validator have teeth, the build is byte-reproducible, connectivity improved honestly (+2294 real source edges, not relabeling), and license/provenance tagging is clean and judge-safe. It is NOT "ship it" only because two safety-critical, non-cosmetic gaps remain: the oracle target is binary with `refuse:0` (the headline safety class has zero examples and is structurally unreachable), and the git repo has zero commits with a `.gitignore` that would commit 16MB of JSONL.

## Gate results (lead-verified, treat as ground truth)

| Gate | Result |
|---|---|
| `validate:rsi` | exit 0, `"ok":true`, 3757/3757 |
| `build:rsi` | exit 0, **byte-reproducible** across reruns (sha256 identical) |
| `test_verifier` | "verifier tests passed" |
| validator-has-teeth (corruption test) | injected a desync into `graph_tensors` row 0 → `validate:rsi` returned `"ok":false`, `failure_count 1`, exit 1; rebuild restored byte-identical output |

## Fix-by-fix scorecard

| Fix | Status | Evidence (one line) |
|---|---|---|
| **F1** Schema/row contract | **FIXED** | `required` sets EXACTLY equal actual row keys both directions across all 3,757 rows (layout 15/15/15, tensor 18/18/18); `additionalProperties:false` declared; old CV schema relabeled "future CV-output target." |
| **F2** Typed adjacency + connectivity | **FIXED** | Gain is real source label-1 edges: door-only 541/3493 (15.5%) → door+adjacency 2835/3493 (81.2%), +2294 records; independent union-find over all 3757 rows: 0 `num_components` mismatch, 0 false `connected`, 0 `graph_usable` false positives. |
| **F3** site_map bridge | **FIXED** | site_map on every layout row; replaying Origin's exact `bfsOracle`/`siteMapToWarehouseTask` over all 3757 rows: 0 throws, 0 OOB; keys match `DescriptiveSiteMap`. |
| **F4** Edge tensor integrity | **FIXED** (1 caveat) | 0/3757 desync; all `edge_index` 2-tuples, all `edge_attr` 3-tuples (non-constant); `edge_relation_counts` reconciles 0 mismatch. Caveat: the 3 `edge_attr` cols are mutually redundant — `edge_type_id` fully determines the other two. |
| **F5** MLStructFP count | **FIXED** | 7 rows tagged `repo_test_data_review_required`, all `graph_usable:false`; 1:1 match to the 7 raw floor keys (302,748,848,966,1058,1059,1060); prior 6 was an off-by-one. |
| **F6** license_class tagging | **FIXED** | `{non_commercial_prototype:3493, commercial_safe_generated:256, academic_only:1, repo_test_data_review_required:7}`; `commercial_safe_generated` is EXCLUSIVELY the 256 procedural rows; 0 real-data rows mislabeled commercial-safe. |
| **F7** geometry_kind tagging | **FIXED** | `{graph_embedded_metric:3493, procedural_metric:256, real_metric_structural:7, real_metric_polygon:1}`; maps 1:1 to the four LICENSES.md rows; caption math 3493+1+7+256=3757 exact. |
| **F8** git / reproducibility | **PARTIAL** | Repo is `git init`'d but `git rev-list --all --count` = 0 — zero commits, everything untracked. Plus `.gitignore` does NOT cover the heavy JSONL (a naive `git add .` stages ~16MB). |

## Findings (by severity)

### HIGH

**H1 — Oracle label imbalance + `refuse:0` (safety-critical, structurally impossible).**
`oracle_label` is binary `finish:997 / escalate:2760 / refuse:0`. Majority-class baseline = 73%. This is NOT merely "unlabeled" — it is unreachable by construction: `build_rsi_dataset.mjs:652-653` hardcodes `hazards:[]` and `humanOnly:[]` on every row, and `0/3757` rows carry any hazard or humanOnly cell. Origin's `isHardRefusal` (`warehouse.ts:641-643`) only fires on a hazard/humanOnly cell or a `refusalReason`, so the `refuse` branch (`validate_rsi_dataset.mjs:276-280`) is mathematically dead for the whole dataset. The refuse branch is otherwise LIVE code (a synthetic 3×3 hazard-wall map returns `refuse`). The safety-critical class has zero supervised examples AND zero latent data to relabel from.
- Refs: `/Users/bohueilin/hackathons/Floor design/scripts/build_rsi_dataset.mjs:652`, `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/warehouse.ts:641`, `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/layouts.jsonl`

**H2 — `oracle_label` confounded ~perfectly with provenance/geometry_kind (label leakage).**
All 997 `finish` labels come exclusively from `graph_embedded_metric` (CubiCasa-derived); every `procedural_metric` (256), `real_metric_structural` (7), and `real_metric_polygon` (1) row is `escalate`. A classifier reading `source_domain`/`geometry_kind`/`license_class` alone separates finish from all non-CubiCasa sources and clears the 73.5% floor with a trivial leak. The finish/escalate target measures "which pipeline produced this row" more than "is there a safe route."
- Refs: `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/layouts.jsonl`

### MEDIUM

**M1 — 7-row connectivity-flag delta is BENIGN (resolved, not a bug).**
The lead saw 7 rows where the emitted `connected` flag disagrees with an independent recompute. Verified: these are exactly the 10 degenerate single-node graphs (cubigraph5k_277/911/913 + mlstructfp_test_302/748/848/966/1058/1059/1060), all `numNodes=1`, all `comps=1`, all `connected=true`, all `graph_usable:false`. The build (`build_rsi_dataset.mjs:600-601`) and validator (`validate_rsi_dataset.mjs:245`) both deliberately treat `nodeIds.length<=1` as `connected:true` (a lone node has nothing to disconnect from); the disagreement only surfaces under a *stricter* recompute convention. Because all 10 carry `graph_usable:false`, they are correctly excluded from any graph learning. Action: none required; optionally document the lenient single-node convention in the schema/README so it stops re-triggering reviewer flags.
- Refs: `/Users/bohueilin/hackathons/Floor design/scripts/build_rsi_dataset.mjs:600`, `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs:245`

**M2 — git has ZERO commits; `.gitignore` would commit 16MB+ of JSONL.**
`git log` → "branch main does not have any commits yet"; 10 untracked top-level entries. There is no reproducibility anchor or provenance pin despite the build being byte-reproducible. Compounding: `git check-ignore -v outputs/rsi_dataset/layouts.jsonl` returns exit 1 (NOT ignored) — `.gitignore` patterns are `outputs/*.json|*.md|*.html`, which match only files directly in `outputs/`, not the `outputs/rsi_dataset/` subdirectory. `git add -n outputs/` confirms it would stage `layouts.jsonl` (13M), `graph_tensors.jsonl` (3.0M), `preview.html/png`, `splits.json`, etc.
- Refs: `/Users/bohueilin/hackathons/Floor design/.gitignore`, `/Users/bohueilin/hackathons/Floor design/.git`

**M3 — Builder oracle diverges from Origin's real oracle on 12 rows (distance-0-is-falsy bug).**
The builder's `siteMapOracleLabel` (`build_rsi_dataset.mjs:710-723`) is a REIMPLEMENTATION of Origin's `bfsOracle`, not a call into it. Replaying Origin's `evaluateDrawnSite` over all rows: 12 disagreements, ALL `escalate`(dataset)→`finish`(Origin), ALL exactly the rows where `start==item==drop` (e.g. mlstructfp_test_1058, cubigraph5k_277/911/913). Mechanism: `shortestGridPath` returns a distance number; for a trivial path distance===0, and `const toDrop = toItem ? ... : null` treats 0 as falsy → short-circuits to escalate. Origin's `bfsOracle` returns a path ARRAY (`[]` is truthy) → returns finish. Origin's dist over all rows: `finish:1009/escalate:2748/refuse:0`. The validator can't catch this — `validate_rsi_dataset.mjs:272-281` clones the same buggy function, so `validate:rsi` confirms self-consistency, not Origin-consumption correctness.
- Refs: `/Users/bohueilin/hackathons/Floor design/scripts/build_rsi_dataset.mjs:710`, `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs:272`, `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/warehouse.ts:648`

**M4 — README advertises `finish/escalate/refuse` labels but the RSI bundle has ZERO refuse rows.**
`README.md:5` markets "finish / escalate / refuse labels" and `README.md:79` cites "4 geometry-earned refuses" — but those 4 belong to the separate scenario-generation run, NOT the RSI bundle (which is binary). A judge could read line 5 as the RSI bundle carrying refuse labels. Add a one-line caption: RSI oracle labels are binary finish/escalate today; refuse coverage is roadmap.
- Refs: `/Users/bohueilin/hackathons/Floor design/README.md`, `/Users/bohueilin/hackathons/Floor design/outputs/rsi_dataset/layouts.jsonl`

**M5 — Validator never validates against the JSON Schemas; `additionalProperties:false` not enforced.**
The validator loads the schema files but only reads `.title`/`.description` (`validate_rsi_dataset.mjs:27-29`); it reimplements every constraint by hand. No `ajv`/`compile` import exists. `required()` (lines 311-313) checks only for *missing* keys, never *extra* ones — injecting a rogue field passes silently, so a row violating `additionalProperties:false` would pass `validate:rsi`. No live violation exists today (SV1 proved 0 extra keys), so this is a latent drift gap, not an active defect. Schema and validator can diverge undetected.
- Refs: `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs`

### LOW

**L1 — `edge_attr` columns informative but mutually redundant.** All 3 cols are non-constant (resolves the earlier "constant 1.0" concern), but they co-vary perfectly: `door→(1,0,1)`, `adjacent→(0,1,0.35)`. `edge_type_id` alone fully determines `portal_width_norm` and `edge_weight` (source hardcodes door portal_width=0.9, adjacency=0 at `build_rsi_dataset.mjs:56-58`). Honest framing: one-hot edge type plus two derived constants, not three independent geometric features. Refs: `/Users/bohueilin/hackathons/Floor design/scripts/export_graph_tensors.mjs`.

**L2 — Latent falsy-zero guard bug** (`pI && pD`, `toItem && toDrop` at `validate_rsi_dataset.mjs:275,279`) — same root cause as M3; should be `!= null` checks. Self-consistent today (generator+validator share the bug), masked by H1's missing hazards. Refs: `/Users/bohueilin/hackathons/Floor design/scripts/validate_rsi_dataset.mjs`.

**L3 — CubiCasa5K CC BY-NC 4.0 never named explicitly.** Narrative says "requires downstream license review" without naming the known CC BY-NC license on ~93% of rows. This UNDER-claims (judge-safe), but precision would improve by stating it. MLStructFP raw LICENSE correctly MIT. Refs: `/Users/bohueilin/hackathons/Floor design/LICENSES.md`, `/Users/bohueilin/hackathons/Floor design/data/source_manifest.json`.

### Skeptic results (independent re-verification — all HOLD)

- **F2-adjacency-honest HOLDS.** Independent dedup + path-compression union-find over raw `data/raw/cubigraph5k/data.json` reproduced label1=9180, label2=24563, door-only 541/3493, door+adjacency 2835/3493, +2294 — AND confirmed the gain survives into the shipped 3493 CubiGraph layouts byte-identical (0 edges lost, 0 relabeling).
- **F2 connectivity recompute HOLDS.** Independent union-find counting isolated nodes as their own components agreed with emitted `num_components` on 100% of 3757 rows; the risky `nodeIds.length<=1 || connectivity.length===0` early-return masks nothing (525 stress rows — 523 with ≥1 isolated node, 2 with zero edges — all matched). Strict convention reproduces exactly the 10 single-node disagreements.
- **F4 edge integrity HOLDS.** Over all 36556 edges: 0 desync, 0 non-2-tuple index, 0 non-3-tuple attr, `edge_relation_counts` sum mismatch=0 — and 0 layout rows would drop any connectivity edge during tensor build, so the count-vs-tensor agreement is structurally guaranteed, not coincidental.

## Recommended first baseline (condensed)

**Target node-type classification, NOT oracle-label prediction.** Oracle is the wrong first target: `refuse:0` in all 3 splits (can't learn or evaluate a safety class with zero examples), 73% majority floor, and near-perfect provenance leakage (H2). Node typing is honest, dense (37,533 labels across 15 classes), graph-grounded, and exercises the exact tensor path a future oracle model reuses.

- **Task:** per-node multi-class room-type classification (15 classes), one graph per `graph_tensors.jsonl` row, with the target node's own type masked. Mask-one-out at eval (all 37,533 nodes scored).
- **Inputs:** `x = [N,17]` (15-dim masked one-hot of `node_type_ids` ⊕ `node_xy_norm[N,2]`); `edge_index` transposed to `[2,E]` + reverse edges for undirected message passing; `edge_attr[E,3]`; `y = node_type_ids`. **Excluded by design (anti-leak):** `license_class`, `geometry_kind`, `source_domain`, `oracle_label`, `connected`, `num_components`.
- **Model:** GraphSAGE, ~50k params — `Linear(17→64)` → 2× `SAGEConv(64→64, mean)+ReLU+Dropout(0.3)` → `Linear(64→15)`. SAGE over GCN for robustness to the 18% disconnected graphs. v1.1 stretch: `GINEConv`/`NNConv` to consume `edge_attr`.
- **Loss:** class-weighted CE, inverse-freq from train split only, clamp `[0.2,10.0]` (laundry/pantry have 1 example each).
- **Splits:** `splits.json` verbatim (3007/375/375, per-graph, provenance-stratified, no cross-split leakage). Test touched once.
- **Metric vs floor:** primary = balanced accuracy (mean per-class recall). Floor = predict `other` always → raw 20.6%, balanced 6.7%. v1 sanity targets: raw ≥55%, **balanced ≥25%** (~3.7× floor). Below that, graph signal isn't being used.
- **Runtime:** ~2–4 s/epoch CPU, 3–7 min end-to-end on a laptop, no GPU.
- **Files:** `ml/{dataset.py,model.py,train.py,metrics.py,config.yaml,requirements.txt,README.md}` + `outputs/rsi_dataset/baseline_v1/metrics.json`.
- **v2 gate (oracle), documented in `ml/README.md`:** do NOT train the oracle until (a) a `refuse` class is synthesized and (b) provenance fields confirmed excluded. Reuse the v1 encoder + graph-level readout → 3-way head.

## Hazard/refuse recommendation — DO IT NOW (do not defer)

**Decisive: add hazard/refuse augmentation NOW, before any model trains on this dataset.** This is not a polish item — it is the dataset's central safety claim. `refuse` is structurally impossible today (H1): the generator emits no hazard/humanOnly geometry, so there is zero supervised signal AND zero latent data to relabel from. Deferring to "scenario generation later" means the safety-critical class never enters the supervised target and the demo's headline ("refuse near hazard") is unbacked by data — exactly the kind of gap a judge interrogates. The mechanism is cheap and deterministic: synthesize hazard/blocked-egress/disconnected-from-`drop` layouts, re-run the oracle as the filter, keep only samples whose label flips as intended (see Codex P1 below). The v1 baseline above can proceed in parallel (it deliberately avoids the oracle target), but the oracle/v2 path is BLOCKED until refuse exists.

## Concrete next directions for Codex (prioritized)

Ground truth = the single deterministic judge `bfsOracle`/`verifyWarehouseRollout` (`apps/origin-web/src/warehouse.ts`), mirrored in `services/foundry-train/reward_bridge.py`. "Capability is not permission" — one judge, many trainers.

### P0 — Close the loop: make the dataset a TRAINING ENVIRONMENT
- **`floor_sampler.py`** — seeded procedural generator emitting valid `WarehouseTask` dicts; for each seed place start/item/drop/obstacles/hazards/humanOnly, then **call `bfs_oracle` to LABEL it** (never by hand). Reject-sample to a target mix (e.g. 50/25/25 finish/escalate/refuse). Writes the first artifact into the empty `datasets/` (`floors_v1.jsonl`). Turns 18 frozen tasks into an unbounded, provably-correct, oracle-labeled distribution.
- **`build_dataset.py`** — rasterize grid → channel tensor (occupancy/hazard/human-only/item/drop/robot planes); attach `bfs_oracle → {label, optimalPath, reward}`; replay `optimalPath` through `verify_rollout` → per-step RL records. Writes `rl_episodes_v1.jsonl` + `sft_pairs_v1.jsonl`. This is the literal rasterize → oracle-labels → RL-reward loop.
- **`/api/foundry/gym-rollout`** — thin route over `warehouseGym.ts` returning signed `verifyWarehouseRollout` reward, so any external trainer grades its own actions against the one source of truth.

### P1 — Hazard/refuse augmentation (the missing safety class — highest leverage)
- **`hazard_augment.py`** — take any `finish` task, apply structured oracle-checked perturbations: hazard-on-target → `refuse` (matches `wh-l4-04`, `wh-l5-02`); adversarial shortcut (hazard across BFS-optimal corridor, safe longer route exists) → still `finish` but reckless path is a false-accept trap (`wh-l5-01`); budget starvation → `escalate` (`wh-l4-01/02`); no-safe-corridor ring → `escalate` (`wh-l5-03`). Re-run `bfs_oracle`; keep only label flips as intended. Emit `refuse_near_hazard_v1.jsonl` + a paired hard-negative (the greedy action list that walks into the hazard, reward 0). **This is the safety story judges can interrogate.**
- **Feed hard-negatives into `extractWarehouseSignals` preference pairs** → bulk DPO/preference data (`pref_pairs_v1.jsonl`, `preferred`=oracle refuse/safe-route, `rejected`=hazard-entering finish), reusing code that already exists.

### P2 — First TRAINED model path (honest about Cerebras: it infers, it does not train)
- **`train_gnn.py`** — tiny GNN/MLP policy over the rasterized grid, GRPO/PPO with **reward = the oracle** (`reward_bridge.reward`); train on `floors_v1` + `refuse_near_hazard_v1`, hold out a seed range. Saves `policy_v1.pt` + `train_curve.json` (avg reward ↑, FAR ↓, refuse-recall ↑). A real artifact runnable live, replacing `mock_curve.json`.
- **`launch_rft.py`** — flip the existing dry-run scaffold to live Fireworks RFT on gemma (LoRA r8, 1 epoch); prompts = serialized floors from `floor_sampler`, reward fn = `reward_bridge.local_reward`, rollouts on Modal. Honest "we trained a model" claim — training off Cerebras.
- **`eval_trained.py`** — base gemma vs `policy_v1` vs LoRA on held-out seeds → `eval_report_v1.json` (calibration matrix, FAR/FRR, refuse-recall, avg reward via `computeWarehouseMatrix`). Generalization on unseen oracle-labeled floors is the credible result.

Demo wiring: Foundry "Train" tab streams the live `train_curve.json`; SOC console adds `policy_v1` as a third lane showing it refuses the synthesized hazard cases base gemma false-accepts. Narrative: "Cerebras infers, the oracle judges, Fireworks/GNN trains."

---

## PROMPT TO SEND BACK TO CODEX

```md
Verdict: ACCEPT WITH MINOR FIXES. F1–F7 verified fixed (schema/validator have teeth,
build byte-reproducible, connectivity +2294 from REAL source edges not relabeling,
license/geometry tags clean and judge-safe). Two non-cosmetic blockers remain before
this dataset is model-ready: the oracle target is binary with refuse:0, and git has
zero commits with a .gitignore that would commit 16MB of JSONL.

PRIORITIZED FIXES

P0 — Hazard/refuse class (BLOCKING the oracle/v2 path; do NOT defer to "scenarios later"):
  refuse:0 is structurally impossible — build_rsi_dataset.mjs:652-653 hardcodes
  hazards:[] and humanOnly:[] on every row, so 0/3757 rows can ever hit Origin's
  isHardRefusal (warehouse.ts:641-643). Add deterministic hazard/refuse augmentation:
  synthesize hazard-on-target / blocked-egress / disconnected-from-drop layouts,
  re-run the oracle as the FILTER, keep only samples whose label flips as intended,
  and mint a paired hard-negative (greedy action list into the hazard, reward 0).
  Target a balanced finish/escalate/refuse mix. New file: services/foundry-train/hazard_augment.py.

P0 — git provenance pin (F8 only half done):
  - Fix .gitignore FIRST: current patterns outputs/*.json|*.md|*.html do NOT match the
    outputs/rsi_dataset/ SUBDIR, so `git add .` stages layouts.jsonl (13M) +
    graph_tensors.jsonl (3M). Add `outputs/rsi_dataset/*.jsonl` (or outputs/**/*.jsonl).
  - THEN make the initial commit: add scripts/schemas/docs/LICENSES.md/source_manifest.json,
    commit, and pin the build by recording the build-script git SHA + sha256 of
    layouts.jsonl & graph_tensors.jsonl in stats.json or a CHECKSUMS file (build is already
    byte-reproducible, so a pinned checksum is meaningful).

P1 — Oracle correctness vs Origin (12-row divergence + label leakage honesty):
  - Fix the distance-0-is-falsy bug: build_rsi_dataset.mjs:710-723 and the validator's
    clone validate_rsi_dataset.mjs:272-281 use `toItem && toDrop` / `pI && pD`; shortestGridPath
    returns 0 for a trivial path, so 12 start==item==drop rows label escalate where Origin's
    bfsOracle (returns a path ARRAY, [] truthy) labels finish. Change to `!= null` checks.
    Better: have the validator call Origin's bfsOracle instead of cloning the producer, so it
    catches Origin-consumption divergence, not just self-consistency.
  - README.md:5 advertises "finish/escalate/refuse labels" but the RSI bundle is binary
    (the 4 refuses are the separate scenario run). Add a one-line caption: RSI oracle labels
    are binary finish/escalate today; refuse coverage is roadmap (until P0 above lands).
  - Document that oracle_label is ~perfectly confounded with provenance (all 997 finish are
    graph_embedded_metric; every non-CubiCasa row is escalate) so no one trains an oracle on
    the leaky target.

P2 — Latent hardening (no live violation today; do when convenient):
  - Validator never validates against the JSON Schemas — it only reads .title/.description and
    hand-rolls checks, so additionalProperties:false is NOT enforced (extra keys pass silently).
    Either compile the schemas with ajv, or add an explicit extra-key check in required().
  - Honest framing: edge_attr's 3 columns are mutually redundant (edge_type_id determines the
    other two) — present as one-hot type + 2 derived constants, not 3 independent features.
  - Optionally name CubiCasa5K's CC BY-NC 4.0 license explicitly (currently under-claimed).
  - Optionally document the lenient single-node "connected:true" convention (the benign 7–10
    row flag delta) so it stops re-triggering reviewer flags.

FIRST BASELINE (build this; it deliberately avoids the broken oracle target):
  Node room-type classification, NOT oracle-label prediction. One graph per graph_tensors.jsonl
  row, 15 room classes, predict each node's own type with it MASKED in x. GraphSAGE ~50k params
  (Linear(17->64) -> 2x SAGEConv(64->64,mean)+ReLU+Dropout(0.3) -> Linear(64->15)), undirected
  (add reverse edges), class-weighted CE (inverse-freq, clamp [0.2,10]). Inputs: x=[N,17]
  (masked 15-dim type one-hot + node_xy_norm), edge_index [2,E], edge_attr [E,3], y=node_type_ids.
  EXCLUDE license_class/geometry_kind/source_domain/oracle_label/connected/num_components (anti-leak).
  Splits.json verbatim (3007/375/375). Metric = balanced accuracy; floor = 6.7% (predict 'other');
  v1 target balanced >= 25%, raw >= 55%. ~3-7 min on CPU. Files: ml/{dataset,model,train,metrics}.py
  + config.yaml + outputs/rsi_dataset/baseline_v1/metrics.json. v2 oracle gated on refuse-class above.

NEXT BUILD DIRECTIONS (turn the dataset into a training environment; oracle = the one judge):
  P0  floor_sampler.py (seeded WarehouseTask gen, bfs_oracle LABELS it, reject-sample to target mix
      -> datasets/floors_v1.jsonl) + build_dataset.py (rasterize -> oracle -> per-step RL records
      + SFT pairs) + a /api/foundry/gym-rollout grade endpoint over warehouseGym.ts.
  P1  hazard_augment.py (the P0 safety fix above) + feed hard-negatives through extractWarehouseSignals
      into pref_pairs_v1.jsonl for DPO.
  P2  train_gnn.py (tiny policy, reward = oracle, GRPO/PPO -> policy_v1.pt + real train_curve.json,
      replacing mock_curve.json) + eval_trained.py (base vs policy_v1 vs LoRA on HELD-OUT seeds).
      Optionally flip launch_rft.py to live Fireworks RFT (LoRA r8). Cerebras infers/serves; it does
      NOT train — train on Fireworks/GNN, keep that split honest in the deck.

Build order: P0 floor_sampler+build_dataset -> P1 hazard_augment+pref_pairs -> P2 train_gnn+eval.
Keep ONE deterministic oracle as the source of truth for every label and every reward.
```
