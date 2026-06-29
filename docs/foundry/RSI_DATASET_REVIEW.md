# Adversarial Review — Codex's RSI/RL Floor-Plan Dataset Bundle

**Reviewer:** Claude
**Date:** 2026-06-28
**Subject:** `/Users/bohueilin/hackathons/Floor design` → `outputs/rsi_dataset/`
**Context:** Cerebras × Gemma-4 hackathon. Origin = floor plans → robot proving grounds, judged by a *deterministic* BFS oracle (`apps/origin-web/src/warehouse.ts`). This bundle is the claimed *data substrate + tensor export* for RSI/RL environment training.
**Method:** All claims below were verified by running code over the full 3,757-record dataset and by re-running the builder in an isolated copy. No Floor-design files were modified.

---

## VERDICT

**ACCEPT WITH FIXES — the substrate is real, clean, reproducible, and honestly captioned, but it is NOT yet wired to Origin's oracle and has data-quality issues that will bite an RL/GNN baseline if used naively.**

What is genuinely good (verified, not taken on faith):

- **Structural integrity is 100%.** All 3,757 layout records and all 3,757 tensor rows pass a strict structural validator: zero nulls/NaN/Inf, zero out-of-bounds coords, zero malformed rows, zero duplicate ids, zero edges referencing unknown nodes, zero self-loops.
- **Counts are exactly as claimed.** 3,757 / 3,757; split 3,007 / 375 / 375 sums to 3,757 with **zero overlap or leakage** between train/val/test, and every layout_id appears in exactly one split.
- **Fully deterministic & reproducible.** Re-running `build:rsi` in a clean copy produced **byte-identical** `layouts.jsonl` and `graph_tensors.jsonl`.
- **Honesty boundaries hold up.** The "geometry is graph-embedded, not pixel-extracted," "ZInD portal matching is heuristic," and "not a trained CV model" caveats are all accurate to what the code actually does.

What blocks "production-grade dataset" status:

1. A **schema mismatch**: the repo ships a strict JSON Schema (`schemas/origin_floor_environment.schema.json`) that **none of the 3,757 records satisfy** — the records follow a *different, undocumented-as-JSON-Schema* shape.
2. **78.6% of layouts are graph-disconnected** (have unreachable rooms) — a serious problem for any navigation/path RL use and for a "traversability" learning target.
3. The dataset has **no RL-relevant fields** (start/goal/hazard/traversable) and its **continuous metric schema does not align with Origin's grid-based `WarehouseTask`/`DescriptiveSiteMap`** — so it cannot feed the existing oracle without a rasterizer that does not exist yet.
4. One **provenance count error** (MLStructFP) and **real non-commercial licensing exposure** (CubiCasa CC BY-NC, ZInD academic-only) that must be captioned before any judge-facing or commercial framing.

None of these are fatal for a hackathon submission. All are fixable in hours. Details, severities, proof, and fixes below.

---

## PRIORITIZED FINDINGS

### [CRITICAL] F1 — The shipped strict JSON Schema matches ZERO records

- **File:** `schemas/origin_floor_environment.schema.json` (required keys, lines 5) vs `outputs/rsi_dataset/layouts.jsonl`
- **Claim under test:** "3,757 **strict-schema** layout records."
- **Proof (ran):**
  ```
  STRICT SCHEMA required: ['source', 'geometry', 'topology', 'semantics', 'verification']
  ACTUAL record keys:     ['layout_id','source_domain','dimensions','boundaries',
                           'internal_walls','navigable_nodes','connectivity']
  schema-required keys present in record: set()   # i.e. NONE
  ```
  The `schemas/origin_floor_environment.schema.json` defines `OriginFloorPlanEnvironment` (source/geometry/topology/semantics/verification). The actual records use a flat layout shape. They overlap on **zero** required top-level keys. The "strict schema" the handoff means is the *inline prose* schema in `HANDOFF.md` lines 79–93 and `stats.json` `schema` block — there is **no machine-checkable JSON Schema for the format actually produced**, and the one JSON Schema in the repo describes a format nothing emits.
- **Why it matters:** "strict-schema" is the headline credibility claim. Right now it is unenforced and the only formal schema present is for a different object. A judge who opens `schemas/` and `layouts.jsonl` sees an immediate inconsistency.
- **Fix:** Ship a JSON Schema that matches the emitted records (`origin_rsi_layout.schema.json` and `origin_rsi_graph_tensor.schema.json`), and add a `npm run validate:rsi` step that runs it over both JSONL files in CI. Either retire `origin_floor_environment.schema.json` or clearly mark it as the *future CV-output* target, not the dataset format. (The validator I wrote — see Appendix — can be dropped in directly.)

### [HIGH] F2 — 78.6% of layouts are graph-disconnected (unreachable rooms)

- **File:** `scripts/build_rsi_dataset.mjs:48-56` (CubiGraph connectivity keeps only door edges) and `:373-397` (ZInD heuristic), feeding `connectivity`.
- **Proof (ran over all 3,757):**
  ```
  layouts with 0 edges:        18  (0.5%)
  layouts with <=1 node:       10
  disconnected layouts:       2953  (78.6%)   # >=1 room unreachable from room 0
  total isolated nodes (deg 0): 4231
  ```
- **Root cause:** CubiGraph `collectGraphEdges` keeps only `label === 2` (door-connect) edges and drops `label === 1` (adjacent, no door). That is *semantically correct* (no door ⇒ no portal), but it shatters connectivity: dataset-wide **9,180 adjacency edges are dropped vs 24,563 door edges kept (~27% of topology discarded)**, leaving many rooms with no portal at all.
- **Why it matters:** For RL navigation or a "can the robot reach the goal" traversability label, a disconnected room graph means a large fraction of (start, goal) pairs have *no path* — the oracle would label most of them `escalate`/unreachable, collapsing label diversity. A GNN trained on `node_xy_norm` + `edge_index` will see 4,231 isolated nodes with no neighborhood to aggregate.
- **Fix:** (a) Add a `connected: bool` and `num_components: int` field per layout so consumers can filter. (b) Offer a build flag to *also* emit adjacency (label-1) edges as a separate `adjacency` edge set with an `edge_type` attribute (door=1, adjacency=0), so the graph stays connected and the GNN can learn the door-vs-wall distinction. (c) For the first baseline, **filter to the single-largest-connected-component or to connected layouts only.**

### [HIGH] F3 — Schema/format does NOT align with Origin's oracle; no RL fields present

- **Files:** records (`navigable_nodes`/`connectivity`, continuous meters) vs `apps/origin-web/src/warehouse.ts:45-63` (`WarehouseTask`: integer grid, `start/item/drop`, `obstacles/hazards/humanOnly`, `battery/maxSteps`) and `apps/origin-web/src/workflowDraft.ts:24-68` (`DescriptiveSiteMap`).
- **Proof (ran):**
  ```
  union of layout keys: ['boundaries','connectivity','dimensions','internal_walls',
                         'layout_id','navigable_nodes','source_domain']
  -> NO start/goal/hazard/traversable/operationalZones fields anywhere.
  ```
  Origin's oracle (`bfsOracle`, warehouse.ts:645) operates on an **integer grid** with cell-level `obstacles`/`hazards`/`humanOnly` sets and explicit `start`/`item`/`drop`. Codex's data is a **continuous metric room-graph** (float meters, line-segment walls, room-center nodes). `floorToSiteMap` (workflowDraft.ts:229) — the only existing floor→site bridge — consumes *counts* (`robots`, `docks`, `aisles`, `no_go_zones`), **not geometry**, and synthesizes a ≤12×12 grid. So this dataset currently **cannot feed the oracle**: there is no rasterizer from room-polygons/walls → occupancy grid, and no mapping from room types → hazard/human-only cells.
- **Why it matters:** The whole Origin thesis is "deterministic oracle is the only judge." A dataset that can't reach the oracle is a parallel artifact, not a feeder. The handoff *says* it's a substrate (honest), but the merge story needs the bridge to be real.
- **Fix:** Add a `rasterizeToSiteMap(layout, cellSizeMeters) → DescriptiveSiteMap` converter (place walls as obstacles on a grid; pick start = entry/hallway node, item/drop = two far rooms; map room types to hazards where appropriate). Then `bfsOracle` can label each rasterized layout finish/escalate/refuse. See Merge Plan §M3.

### [MEDIUM] F4 — `edge_attr` is a constant; `edge_index`/`edge_attr` alignment is an unguarded invariant

- **File:** `scripts/export_graph_tensors.mjs:25-28`
- **Proof (ran):**
  ```
  portal_width value distribution: {0.9: 27376}     # every single edge
  edge_index vs edge_attr length MISMATCH count: 0  # OK today, but...
  ```
  Two issues in the same lines:
  1. `edge_attr_portal_width_norm` is `portal_width / 0.9` and **every** edge has `portal_width = 0.9` (constant in the builder), so `edge_attr` is a vector of `1.0` carrying **zero information**. A GNN gains nothing from it.
  2. `edge_index` is `connectivity.map(...).filter(Number.isInteger)` — it can **drop** rows. `edge_attr` is `connectivity.map(...)` — it **never** filters. If any edge ever referenced a node missing from `nodeIdToIndex`, `edge_index` would be shorter than `edge_attr` and the attrs would silently misalign to the wrong edges. It doesn't fire today (builder pre-filters bad edges) — it's a **latent** bug, not a live one.
- **Fix:** Build `edge_index` and `edge_attr` in a **single pass** so they cannot desync (filter once, push both together). Drop the constant `edge_attr` or replace it with a real signal (e.g. inter-room center distance, or door-vs-adjacency type from F2). Until portal widths are real, document `edge_attr` as a placeholder.

### [MEDIUM] F5 — MLStructFP provenance count is wrong, and those 7 records are graph-dead weight

- **Files:** `data/source_manifest.json:34` (`"records_available": 6`) vs reality.
- **Proof (ran):**
  ```
  raw fp.json floor keys: ['1058','1059','1060','302','748','848','966'] -> 7 floors
  MLStructFP records in dataset: 7   (stats.json says 7; manifest says 6 -> manifest is wrong)
  each MLStructFP record: nodes=1 (structural_floor_plate), edges=0, walls=28..80
  ```
  `stats.json` (7) and the actual data (7) agree; only `source_manifest.json` says 6. Separately, every MLStructFP record collapses to a **single node with zero edges** — they contribute real metric wall geometry but **no graph topology**, so they are inert for any GNN over `edge_index`.
- **Why it matters:** A provenance file that miscounts its own source undercuts the "auditable" claim. And 7 single-node graphs in the GNN training set are noise.
- **Fix:** Correct `source_manifest.json` to `records_available: 7` (and note "7 floor plates emitted"). Tag MLStructFP records with a `graph_usable: false` flag or exclude them from the GNN split; keep them only for the wall-geometry track.

### [MEDIUM] F6 — Non-commercial / academic-only licensing exposure (must be captioned)

- **Files:** `data/raw/cubicasa_repo_metadata/LICENSE`, `data/raw/zind_sample/README.md`, `data/raw/mlstructfp_test/LICENSE`.
- **Proof (read the actual license files):**
  - **CubiCasa5K: `Creative Commons Attribution-NonCommercial 4.0`** (CC BY-NC 4.0). CubiGraph5K is *derived from CubiCasa5K* (CubiGraph README confirms), so the 3,493 CubiGraph records (93% of the dataset) inherit a **NonCommercial** restriction.
  - **ZInD:** README, §License — "ZInD is **not** licensed for commercial purposes … free of charge for academic, non-commercial use." Even the public sample tour carries the Zillow Terms of Use.
  - **MLStructFP: MIT** (the *library*). Clean — but the README notes the *full dataset* needs a form; only repo test data is used here, which is fine.
- **Why it matters:** Origin's pitch is a *startup licensing physical autonomy*. Training a commercial model on CC-BY-NC + academic-only data is a real TOS/copyright risk if anyone reads the slide as "this is our training data." The handoff's "hackathon/research prototype, not a commercial asset" caveat (HANDOFF.md:116) is correct and must stay loud.
- **Fix / honest caption:** On any judge-facing artifact: *"Research/non-commercial dataset (CubiCasa5K CC BY-NC, ZInD academic-only, MLStructFP MIT). Used here as a methodology proof; commercial deployment uses permissioned/partner data or fully synthetic (procedural) layouts."* Note the **256 procedural records are the only unambiguously commercial-safe slice** — lean on those for any commercial framing, and consider scaling them up.

### [LOW] F7 — CubiGraph "geometry" is a BFS-layer grid, not metric space (honest, but mislabel-prone)

- **File:** `scripts/build_rsi_dataset.mjs:234-275` (`embedGraph`), `:280-291` (`roomDimensions` fixed per type).
- **Proof (ran):**
  ```
  sample cubigraph5k_1000 distinct X centers: [2.3, 6.7, 11.1, 15.5, 19.9, 24.3, 28.7]
  # exactly 1.5 + depth*4.4 -> nodes quantized to BFS-depth columns
  CubiGraph width: min 6.8  median 17.8  max 45.5  (meters)
  # a ~10-room flat rendered ~31m wide is non-physical -> coords encode graph layout, not metres
  ```
  `node_xy_norm` therefore largely encodes **BFS depth + sibling index**, not real room positions. The handoff is explicit about this (HANDOFF.md:128, quality_notes), so this is a *labeling/expectations* risk, not a dishonesty.
- **Fix:** In `vocab.json`, relabel `node_xy_norm` for CubiGraph as `"graph-embedded layout coords (not metric)"` and add a per-record `geometry_kind` field (`graph_embedded` | `real_metric`) so a model never treats CubiGraph coords as ground-truth geometry. Only ZInD (1 record) is true metric geometry today.

### [LOW] F8 — Dataset folder identity / git provenance is thin

- **Proof (ran):** `git log` in `/Users/bohueilin/hackathons/Floor design` returns nothing — **not a git repo**, so there is no commit history to audit the build. `package.json:name` is `origin-environment-factory`, while `HANDOFF.md` calls the folder the dataset repo. Minor identity drift.
- **Fix:** `git init` the folder (or fold it into Origin per Merge Plan) so the build is version-pinned, and reconcile the package name with the bundle's stated purpose.

---

## RECOMMENDED FIRST BASELINE (concrete, minimal, fits a hackathon)

**Train a 2-layer GraphSAGE node classifier that predicts room type from graph context.** This is the single best first model because it (a) uses the data exactly as exported with no new labels, (b) has a clean, defensible success metric, and (c) directly demonstrates "the graph is learnable," which is the substrate's whole reason to exist. Link-prediction (portals) is tempting but F2/F4 make the edge signal weak; layout-quality scoring needs labels that don't exist yet. Node-type classification needs none.

**Task:** masked node-type classification (node classification).

**Inputs (straight from `graph_tensors.jsonl`):**
- `x` = node features: one-hot `node_type_ids` is the *label*, so do **not** feed it; feed `node_xy_norm` (shape `[N, 2]`) **+ structural features** you can derive cheaply: node degree, num_neighbors-by-position. Practical start: `x = [node_xy_norm (2), degree (1)] → [N, 3]`.
- `edge_index` = `[2, E]` long tensor (transpose the `[E,2]` rows; make it **undirected** by also adding the reversed edges).
- `y` = `node_type_ids`, `[N]`, 15 classes (`vocab.json:room_type_to_id`).
- masks: use the existing `split` field (train/val/test) at the **layout** level; do node-level masking only within layouts so there is no leakage.

**Model / loss:**
- `GraphSAGE(in=3, hidden=64, num_layers=2, out=15)`, ReLU, dropout 0.3.
- Loss: cross-entropy over nodes. Class weights recommended (`other`=7,731 vs `pantry`=1 — see `stats.json:room_type_counts`, heavy imbalance).
- Optimizer: Adam, lr 1e-3, ~50 epochs. Batch by layout with a PyG `DataLoader`.

**Pre-processing guardrails (from findings):** drop the 7 MLStructFP single-node graphs (F5); optionally restrict to connected layouts or largest-CC (F2); ignore `edge_attr` (it's constant, F4).

**Tiny train loop sketch (PyTorch Geometric):**
```python
import json, torch
from torch_geometric.data import Data, DataLoader
from torch_geometric.nn import SAGEConv
import torch.nn.functional as F

rows = [json.loads(l) for l in open("graph_tensors.jsonl") if l.strip()]
def to_data(r):
    n = len(r["node_type_ids"])
    if n < 2 or not r["edge_index"]: return None          # drop trivial/edgeless (F2/F5)
    ei = torch.tensor(r["edge_index"], dtype=torch.long).t().contiguous()
    ei = torch.cat([ei, ei.flip(0)], dim=1)                # undirected
    deg = torch.zeros(n); deg.index_add_(0, ei[0], torch.ones(ei.size(1)))
    xy = torch.tensor(r["node_xy_norm"], dtype=torch.float)
    x  = torch.cat([xy, deg.unsqueeze(1)], dim=1)          # [N,3]
    y  = torch.tensor(r["node_type_ids"], dtype=torch.long)
    d = Data(x=x, edge_index=ei, y=y); d.split = r["split"]; return d

ds = [d for d in (to_data(r) for r in rows) if d]
tr = DataLoader([d for d in ds if d.split=="train"], batch_size=64, shuffle=True)
va = DataLoader([d for d in ds if d.split=="val"],   batch_size=128)

class Net(torch.nn.Module):
    def __init__(s): super().__init__(); s.c1=SAGEConv(3,64); s.c2=SAGEConv(64,15)
    def forward(s,x,ei): return s.c2(F.dropout(F.relu(s.c1(x,ei)),0.3,s.training), ei)

m=Net(); opt=torch.optim.Adam(m.parameters(),1e-3)
for ep in range(50):
    m.train()
    for b in tr:
        opt.zero_grad(); out=m(b.x,b.edge_index)
        F.cross_entropy(out,b.y).backward(); opt.step()
    # val accuracy
    m.eval(); c=t=0
    with torch.no_grad():
        for b in va:
            p=m(b.x,b.edge_index).argmax(1); c+=(p==b.y).sum().item(); t+=b.y.numel()
    print(ep, "val_acc", round(c/t,3))
```

**What "success" looks like in a hackathon timeframe:**
- Trains in **< 2 min on CPU**, < 30 s on any GPU (graphs are tiny, ~10 nodes).
- **Val accuracy ≥ ~0.55–0.65** beats the majority-class baseline (`other` ≈ 7,731 / 37,602 ≈ 0.21) by a wide margin → proves the graph topology carries real room-type signal.
- One slide: confusion matrix + "GraphSAGE recovers room semantics from pure topology at Xx the majority baseline" → concrete evidence the substrate is learnable, in one afternoon.

---

## MERGE-INTO-ORIGIN PLAN (no build break)

Origin is npm workspaces with `"workspaces": ["apps/origin-web","apps/passport","packages/*"]` (root `package.json`), an **empty** `packages/` and an **empty** `datasets/` dir, plus per-service Python under `services/`.

**M1 — Where it goes:** create **`packages/rsi-dataset/`** (picked up automatically by the `packages/*` glob — no root edits needed) for the *builder + schema + tensor export* (the `.mjs` scripts, the two new JSON Schemas, `vocab.json`), and put the heavy generated artifacts under **`datasets/rsi/`** (already exists, gitignore the large JSONL or commit via Git LFS). Rationale: code that must build belongs in a workspace; multi-MB JSONL should not bloat the package install.

**M2 — Wire without breaking the build:**
- Give `packages/rsi-dataset/package.json` `"name": "@origin/rsi-dataset"`, `"type": "module"`, **no build step** (scripts only) and **no deps** beyond Node stdlib (the builder uses only `node:fs`/`node:path`). It will install as an empty-but-valid workspace and cannot break `apps/origin-web`'s Vite/TS build because nothing imports it yet.
- Add root scripts: `"rsi:build": "node packages/rsi-dataset/scripts/build_rsi_dataset.mjs && node packages/rsi-dataset/scripts/export_graph_tensors.mjs"` and `"rsi:validate": "node packages/rsi-dataset/validate.mjs"`. Keep them out of the default `build`/`test` chain so CI stays green.
- TS safety: do **not** add the `.mjs` to `tsconfig` includes (they're plain ESM, no types needed). `apps/origin-web` is untouched.

**M3 — Schema alignment with the oracle (the real value):** the layout schema should **not** be retrofitted onto `DescriptiveSiteMap` directly (continuous-vs-grid mismatch, F3). Instead add **one adapter** in the package:
`rasterizeToSiteMap(layout: OriginRsiLayout, cellMeters = 1): DescriptiveSiteMap` that
(1) bins walls/boundaries into an occupancy grid sized `ceil(width/cellMeters) × ceil(length/cellMeters)` (clamped to the oracle's sane range), (2) marks wall cells as `obstacles`, (3) picks `start` = entry/hallway node, `item`/`drop` = two far-apart room centers, (4) maps room types → `hazards`/`humanOnly` where appropriate (e.g. `garage`/`outdoor` → none; a flagged room → hazard).
Then the **existing `bfsOracle` (warehouse.ts:645) labels every rasterized layout finish/escalate/refuse with zero changes to warehouse.ts** — this is the merge's payoff: 3,757 real-topology floor plans become oracle-scored proving grounds, feeding the same gym the demo already uses. Ship `rasterizeToSiteMap` behind a unit test that asserts the output validates against `DescriptiveSiteMap`'s shape and that `bfsOracle` returns a terminal for a sample.

**M4 — Provenance & license hygiene on merge:** copy `data/source_manifest.json` (with F5 fixed) into `packages/rsi-dataset/` and add a `LICENSES.md` summarizing the F6 findings, so the non-commercial constraint travels with the data inside Origin.

---

## PROMPT TO SEND BACK TO CODEX

```md
Codex — Claude reviewed the RSI dataset bundle in /Users/bohueilin/hackathons/Floor design.
Verdict: ACCEPT WITH FIXES. The substrate is real, 100% structurally valid (all 3,757
layout + 3,757 tensor rows pass), splits are clean (3007/375/375, no leakage), and the
build is byte-for-byte reproducible. Please fix these, in priority order:

1. [CRITICAL] schemas/origin_floor_environment.schema.json matches ZERO emitted records
   (required keys source/geometry/topology/semantics/verification; records have
   layout_id/source_domain/dimensions/boundaries/internal_walls/navigable_nodes/connectivity).
   Ship a JSON Schema that matches the ACTUAL layout + graph_tensor format, add
   `npm run validate:rsi` that runs it over both JSONL files, and either delete or clearly
   relabel the old schema as the future CV-output target (not the dataset format).

2. [HIGH] 78.6% of layouts are graph-disconnected (verified: 2953/3757 have an unreachable
   room, 4231 isolated nodes). CubiGraph keeps only door edges (label==2) and drops 9180
   adjacency edges (label==1, ~27% of topology). Add per-layout `connected`/`num_components`
   fields, and a build flag to ALSO emit adjacency edges as a typed edge set
   (edge_type: door|adjacency) so graphs stay connected for a GNN.

3. [HIGH] Format doesn't reach Origin's oracle. Records are continuous metric room-graphs;
   the oracle (apps/origin-web/src/warehouse.ts WarehouseTask/bfsOracle) is an integer grid
   with start/item/drop/obstacles/hazards/humanOnly. There are NO RL fields
   (start/goal/hazard/traversable) in any record. Add a rasterizeToSiteMap(layout) ->
   DescriptiveSiteMap adapter so bfsOracle can label each layout finish/escalate/refuse.

4. [MEDIUM] export_graph_tensors.mjs:25-28 — edge_attr_portal_width_norm is constant 1.0
   (every portal_width==0.9), so it's an uninformative feature; and edge_index is
   filtered while edge_attr is not, an unguarded desync invariant. Build edge_index and
   edge_attr in a single filtered pass, and replace the constant edge_attr with a real
   signal (inter-center distance, or door/adjacency type from #2).

5. [MEDIUM] data/source_manifest.json:34 says MLStructFP records_available: 6 but raw
   fp.json has 7 floors and stats.json/data both have 7. Fix to 7. Also: all 7 MLStructFP
   records are single-node, zero-edge — tag them graph_usable:false / exclude from the GNN split.

6. [MEDIUM] License captioning. CubiCasa5K (and thus the 3,493 CubiGraph records, 93% of the
   set) is CC BY-NC 4.0; ZInD is academic/non-commercial only. Add LICENSES.md and a loud
   "research/non-commercial prototype" caption. The 256 procedural records are the only
   commercial-safe slice — consider scaling them up for any commercial framing.

7. [LOW] CubiGraph node_xy_norm is BFS-layer grid coords (X centers exactly 1.5+depth*4.4),
   not metric geometry. Add a per-record geometry_kind: graph_embedded | real_metric, and
   relabel node_xy_norm accordingly in vocab.json.

8. [LOW] The folder isn't a git repo and package.json name is origin-environment-factory.
   git init it (or fold into Origin packages/rsi-dataset) so the build is version-pinned.

Recommended first baseline to add: a 2-layer GraphSAGE node classifier predicting room type
from graph context (inputs node_xy_norm+degree, edge_index undirected, y=node_type_ids, CE
loss with class weights). Drop trivial graphs, ignore edge_attr. Success = val_acc ~0.55-0.65,
well above the 0.21 majority-class floor, trains in <2 min CPU.

Merge target: packages/rsi-dataset/ (auto-picked by the packages/* workspace glob; scripts-only,
node-stdlib-only, so it can't break apps/origin-web). Heavy JSONL under datasets/rsi/ (LFS or
gitignored). Add rsi:build / rsi:validate root scripts kept OUT of the default build/test chain.
```

---

## APPENDIX — Validator used (drop-in for `npm run validate:rsi`)

The full Python validator that produced the F1–F8 evidence lives in the review scratchpad; its checks: schema-required-key presence, NaN/Inf/null, coord-in-bounds, dup ids, edge index validity, self-loops, split sum + leakage, layout/tensor id parity, edge_index/edge_attr alignment, xy_norm ∈ [0,1], graph connectivity/component count. **Result over the full 3,757: structural PASS 3757/3757 for both files** — every failure in this report is a *semantic/provenance/integration* finding, not a malformed-record finding. Recommend porting it to a Node script inside `packages/rsi-dataset/` so it runs in the same workspace as the builder.
