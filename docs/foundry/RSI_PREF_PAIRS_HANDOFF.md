# RSI/RL Sprint — Pref-Pairs + Gemma-Proposer + Dashboard (handoff)

Continues the accepted RSI state. Built by 3 parallel agents, integrated + gated by the lead.
**No accepted RSI fix was redone. Nothing pushed/published/deployed — local only.**

Claim boundary (honored everywhere): **Gemma proposes · Origin verifies · the deterministic oracle is the judge — a bounded robot-readiness Gym, not production robot certification.** gemma-4-31b on Cerebras is proposal/inference only (no training, no video).

## What shipped (4 new files + 4 npm scripts)

| Artifact | Files |
|---|---|
| **1. Preference pairs** | `services/foundry-train/build_pref_pairs.py`, `scripts/validate_pref_pairs.mjs` → `outputs/rsi_dataset/pref_pairs_v1.jsonl` |
| **2. Gemma proposer → Origin verifier** | `services/foundry-train/propose_verify.py` → `outputs/rsi_dataset/propose_verify_metrics.json` |
| **3. Demo dashboard** | `scripts/render_rsi_dashboard.mjs` → `outputs/rsi_dashboard.html` |
| npm scripts (added to `package.json`) | `build:prefpairs`, `validate:prefpairs`, `propose:verify`, `render:dashboard` |

## Exact gates (all run by the lead, all pass)

```
python3 -m py_compile build_pref_pairs.py propose_verify.py   → OK
npm run build:prefpairs      → exit 0
npm run validate:prefpairs   → exit 0  "ok": true
npm run propose:verify       → exit 0
npm run render:dashboard     → exit 0  wrote outputs/rsi_dashboard.html (28 KB)
npm run validate:rsi         → exit 0  (accepted dataset UNCHANGED)
node scripts/test_verifier.mjs → exit 0  verifier tests passed
shasum -a 256 -c CHECKSUMS   → 6/6 OK  (pinned dataset bytes untouched)
git status                   → only the 4 new scripts + package.json tracked; all outputs gitignored
```

## Results

**Preference pairs (`pref_pairs_v1.jsonl`)**
- **4,704 pairs** (one per eligible floor), split inherited exactly from `splits.json`: **train 3774 / val 474 / test 456**.
- Source: `synthetic_fail` 3956, `hard_negative` 748.
- Winner terminals: finish 1009 / refuse 748 / escalate 2947 (= the full oracle-label distribution). Loser categories: `fake_finish` 4225, `unsafe_zone` 479 — every loser reward 0, every winner reward 1.0.
- **`oracle_divergence: 0`** — both winner and loser re-validated through Origin's real `verify_rollout`/`bfs_oracle` (`used_origin_reward_bridge: true`); a pair is dropped unless winner>loser and loser==0. Build is byte-deterministic (identical MD5 on rebuild). The validator independently re-derives the oracle (faithful JS clone), exits 1 on a corrupted pair, 0 on the real file.

**Gemma proposer → Origin verifier (`propose_verify_metrics.json`)** — mock path in this env (no `CEREBRAS_API_KEY`); with a key, `source: "cerebras"` and real gemma-4-31b proposals.
- `used_origin_reward_bridge: true`, candidates 24 → schema_valid **24** → oracle_accepted **15** → unsafe_caught **9** → preference_pairs **24** → **`oracle_divergence: 0`**.
- Headline beat captured live: **`pv-floor-0002: proposed=finish / oracle=refuse (reward 0, unsafe_zone)`** — the proposer wanted to finish; the oracle refused.

**Dashboard (`outputs/rsi_dashboard.html`, self-contained, opens as a file)** — honest claim-boundary header; the Gemma→Origin verifier funnel (with the cerebras|mock badge + divergence-0 badge); the money beat (a real `fake_finish` floor rendered as an SVG grid with the greedy path walking INTO the hazard, "Proposed: FINISH ✗ · Oracle: REFUSE ✓"); per-label balance bars; a policy scorecard (v1 baseline 64.4% balanced acc vs 6.7% floor, honestly labeled *structural reading, not the safety policy*); a bounded L0→L4 readiness ladder ("we are here: L2 propose & verify").

## Remaining risks
1. **Validator oracle is a JS clone** of `reward_bridge.py` (same pattern as `validate_rsi`). Agrees today (divergence 0); if `reward_bridge.py` semantics drift (battery/maxSteps shaping, `siteMapToWarehouseTask` battery formula), the builder follows Origin while the validator wouldn't → false divergence. The builder uses `battery = max(8, w*h*2)`; keep builder + validator in lockstep with Origin's task construction.
2. **propose_verify local fallback reward is simplified** (0/1 vs the bridge's shaped [0.6,1.0]); only matters if the Origin bridge import fails AND someone asserts exact magnitudes. Bridge present here (`used_origin_reward_bridge: true`), so real rewards are used; metrics are threshold-based so they stay correct either way.
3. **New artifacts are gitignored + not in CHECKSUMS.** Reproducible via the scripts. Consider pinning `pref_pairs_v1.jsonl` in `CHECKSUMS` if it becomes a shipped training artifact.
4. **`render:dashboard` must run from repo root** (relative paths, like `render_demo.mjs`) — gated via the npm script.
5. **The real remaining gap = train the finish/escalate/refuse safety POLICY (P0.2).** `pref_pairs_v1.jsonl` now provides the DPO/preference data for it; the gym, oracle reward, and labeled dataset all exist.

## PROMPT TO SEND BACK TO CODEX

```md
RSI sprint continued + accepted. Three new artifacts, all gated, zero oracle divergence,
accepted dataset untouched (validate:rsi ok, test_verifier passed, 6/6 CHECKSUMS):

1. pref_pairs_v1.jsonl — 4704 DPO pairs (winner=oracle optimalPath reward 1.0, loser=paired
   hard-negative or synthesized fake_finish reward 0), same floor, split inherited
   (3774/474/456), oracle_divergence 0, byte-deterministic. + build:prefpairs / validate:prefpairs
   (validator re-derives the oracle, exits 1 on corruption).
2. propose_verify.py — Gemma proposes (Cerebras gemma-4-31b when CEREBRAS_API_KEY set; deterministic
   mock otherwise), Origin verifies EVERY candidate → propose_verify_metrics.json
   (candidates/schema_valid/oracle_accepted/unsafe_caught/preference_pairs/oracle_divergence=0,
   source cerebras|mock). Captures "proposed=finish / oracle=refuse". + propose:verify.
3. render_rsi_dashboard.mjs → outputs/rsi_dashboard.html (self-contained) — the funnel, the
   finish-vs-refuse money beat as an SVG grid, per-label balance, policy scorecard, readiness ladder,
   honest claim boundary. + render:dashboard.

Carry forward (not blockers): validate_pref_pairs.mjs oracle is a JS clone of reward_bridge — keep
in lockstep if the bridge's task/battery shaping changes; propose_verify fallback reward is 0/1 vs
the bridge's shaped value (bridge present here, so real). Consider pinning pref_pairs_v1.jsonl in
CHECKSUMS. NEXT (the one real gap): train the finish/escalate/refuse safety POLICY with these pairs
(DPO) + floors_v1 — gym + oracle reward + dataset all exist; gemma-4 is inference-only on Cerebras,
so train off-Cerebras and report one honest measured number (esp. refuse-class recall vs the floor).
Files are uncommitted in your repo for you to commit. Do not push.
```
