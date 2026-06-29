# Review — Codex RSI Training-Environment Sprint (v1 baseline + trainenv P0 + gym-rollout)

## Verdict: ACCEPT WITH MINOR FIXES
The sprint is honest and oracle-grounded across both repos — the 0.6509 baseline is real learned structure (adversarially probed, survived), the trainenv P0 is leak-free with the oracle as labeler, and the gym-rollout route grades on the real deterministic oracle. Three minor fixes gate "ship": the saved-vs-reported model mismatch (BL-4), the unbounded-body DoS on the gym route (medium), and the coord-clamp asymmetry — none are leakage or correctness-of-grade defects.

## Gate results (lead-verified, all PASS)

| Gate | Repo | Result |
|---|---|---|
| py_compile | Floor design | ok |
| baseline:v1 test balanced acc | Floor design | 0.6509 (acc 0.7292; floor 0.067, target 0.25) |
| baseline:v1 deterministic re-run | Floor design | identical (0.729221 / 0.650868) |
| trainenv:p0 floors | Floor design | 600, balanced 200/200/200 |
| trainenv:p0 floor split | Floor design | 480/60/60 |
| trainenv:p0 RL rows | Floor design | 6480 |
| trainenv:p0 SFT rows | Floor design | 600 |
| build:rsi | Floor design | 4704 rows |
| validate:rsi | Floor design | ok:true |
| test_verifier | Floor design | passed |
| shasum -c CHECKSUMS | Floor design | 6/6 OK |
| foundryHandler tests | Origin | 6/6 pass |
| npm run build | Origin | ok |
| eslint | Origin | clean |
| git status | both | clean (datasets/ gitignored) |

## What's strong (honest wins)
- **Real 65% balanced accuracy with verified anti-leakage.** The v1 baseline's 0.6509 is learned graph structure, not a leak. Target node's own type is genuinely masked (`ml/dataset.py:87`, `one_hot[target_idx]=0.0`) — flipping a node's own type leaves its feature vector bitwise-identical. No provenance/`layout_id`/oracle field reaches `x` (`feature_dim=38=15*2+8`). Leakage probe: geometry/degree-only = 0.4757, and no single feature family reproduces the headline (self-xy 0.295, degree 0.253, rel-nbr-xy 0.305, one-hop type-mean 0.439, two-hop type-mean 0.367) — 0.6509 only emerges by combining families, the fingerprint of honest distributed structure.
- **Oracle-as-labeler via reject-sampling.** The trainenv (`floor_sampler.py` + `build_dataset.py`) labels every floor through Origin's deterministic `bfs_oracle`/`verify_rollout`. Independent replay over all 600 floors + 6480 RL / 600 SFT rows: 0 label / path / reward / category divergence. No misleading "success" row exists for any refuse/escalate floor; an adversarial lazy-finish on a refuse floor scores reward 0.0 / `fake_finish`. The gate cannot be reward-hacked into a false positive.
- **Bounded, judge-honest route.** `/api/foundry/gym-rollout` clamps the grid to ≤64×64 (4096 cells, oracle bounded), filters actions to the legal enum, calls the real `bfsOracle + verifyWarehouseRollout` (no LLM, no config/key), leaks no secrets, and is byte-for-byte deterministic.

## Findings by severity

**MEDIUM**
- **`gym-actions-array-unbounded` — event-loop DoS via large body.** `actionsFromGymBody` (`apps/origin-web/server/foundryHandler.ts:647`) runs `raw.filter(...)` with no length cap, and `safeCells` (`:597`) iterates obstacle/hazard/humanOnly arrays uncapped; `jsonBody` (`app.ts:73`, wired at `app.ts:411`) has no `bodyLimit` anywhere in `server/`. A 5M-action + 200K-obstacle body returns `ok=true` but blocks the event loop. **Note the skeptic correction:** the verifier's headline ~4970ms is overstated — re-measuring `handleGymRollout` in isolation, the same body took **292ms** and a 20M-action body took **958ms**. The gap is real and the mechanism (linear event-loop work, no cap) holds; the latency figure does not. Fix: cap `actions.length` (to `maxSteps`) and cell-array lengths (to grid-cell-count), and/or add `bodyLimit` to the foundry routes.

**LOW**
- **BL-4 — saved weights ≠ reported headline.** `train.py:101` reports `metrics.json["test"]` from the FINAL-epoch model (0.650868 balanced), but `train.py:108` saves best-val weights (epoch 50). Loading the persisted `model_weights.json` and scoring test yields **0.643617 balanced / 0.722294 acc** — a **−0.0072** gap. Reproduced exactly by both verifier and skeptic. Anyone loading the artifact gets 0.6436, not the advertised 0.6509. Not leakage; an artifact/report honesty mismatch. Fix: either evaluate+report the saved best-val model, or save the final-epoch model.
- **`coord-clamp-vs-reject-asymmetry`.** `safeCell` (`foundryHandler.ts:589`) clamps out-of-range `item`/`drop` into the grid instead of rejecting; relocated anchors can land on hazards/obstacles and flip the oracle label. Not exploitable for an unfair PASS (grading stays self-consistent on the clamped task), but a trainer can be graded on a different task than it submitted with no error signal. A 400 would be more honest.
- **`test-happy-path-only`.** `foundryHandler.test.ts:75` asserts oracle grading only on the finish/pass path — no refuse/escalate, no false-accept (finish proposed when oracle=refuse), no unsafe-zone case. The route handles those (verified by probe), but the assertion gap is where honest grading matters most for a trainer trying to game reward.

**INFO / portability**
- **TE-6 — hardcoded cross-repo bridge path.** `floor_sampler.py:20` / `build_dataset.py:18` hardcode `BRIDGE_DIR = /Users/bohueilin/hackathons/Origin/services/foundry-train`. Resolves on this host; a CI/portability concern only. Consider vendoring `reward_bridge.py` or an env override.

**Skeptic results (summary):** central baseline-honesty claim — **holds** (re-ran, own-type masking bitwise-confirmed, probe reproduced to 4 decimals). BL-4 defect — **holds** (−0.007251 reproduced). Route judge-honesty + injection-safety — **holds** (CASE1–5 clean). DoS gap exists — **holds**. DoS latency ~4970ms — **does NOT hold** (292ms / 958ms measured; fairness correction, finding stands). Coord-clamp asymmetry — **holds**.

## The `eval_trained.py` I added
I (lead) implemented a deterministic evaluator that loads the SAVED `model_weights.json` and scores it on the test split — the artifact-vs-report check that BL-4 calls for. Its result is **0.643617 balanced / 0.722294 acc**, matching the saved best-val model and confirming the **−0.0072** gap against the reported `metrics.json` 0.650868. This is the harness Codex should wire into the gate so the reported headline always corresponds to the persisted weights.

## PROMPT TO SEND BACK TO CODEX

```md
Verdict: ACCEPT WITH MINOR FIXES. The sprint is honest and ships after three small fixes. We adversarially probed the baseline (own-type masking is bitwise-genuine, no single feature family reproduces 0.6509, geometry-only is 0.4757) and independently replayed the oracle over all 600 floors + 6480 RL / 600 SFT rows with ZERO divergence. The gym-rollout route grades on the real deterministic oracle, clamps the grid, filters actions, and leaks no secrets. Strong work.

Three fixes before we call it done:

1. [BL-4, must-fix] Saved weights don't match the reported headline. train.py:101 reports the FINAL-epoch test score (0.650868 balanced); train.py:108 saves best-val (epoch 50), which scores 0.643617 (−0.0072). Pick ONE: report the best-val model you actually save, OR save the final-epoch model you report. I added ml/eval_trained.py — a deterministic loader+scorer of the SAVED weights (returns 0.643617). Wire it into the gate so the headline always corresponds to the persisted artifact.

2. [route DoS, medium] No length cap on the actions array or the obstacle/hazard/humanOnly arrays in foundryHandler.ts, and no bodyLimit on the foundry routes (app.ts). Cap actions.length to the task's maxSteps and the cell arrays to grid-cell-count BEFORE the filter passes, and add a bodyLimit to the foundry router. (Latency note: real single-request cost is ~300ms–1s, not the ~5s first reported — but the unbounded mechanism is real; cap it.)

3. [route honesty, low] safeCell silently relocates out-of-range item/drop instead of rejecting (foundryHandler.ts:589), so a trainer can be graded on a different task than it submitted. Return 400 on out-of-range anchors. While there, add gym-rollout tests for a refuse/escalate case and a false-accept (finish proposed when oracle=refuse) — the happy-path-only coverage (foundryHandler.test.ts:75) misses exactly where gaming would show.

Carry-forward (not blocking this sprint, but next): vendor reward_bridge.py or add an env override — the hardcoded /Users/bohueilin/hackathons/Origin path breaks on any other host (floor_sampler.py:20, build_dataset.py:18). Also confirm the layout_id / ajv-validation / hard-negative items from the prior handoff are still tracked.

Agreed next steps — decisive:
- pref_pairs_v1: YES, build it next. Use the same reject-sampling + oracle-verify discipline that made trainenv P0 clean — pairs are (winner=oracle-verified pass, loser=oracle-rejected or fake_finish on the SAME floor), inheriting the floor split. This is the highest-leverage next dataset.
- policy runner vs gym-rollout: keep BOTH, with a clear split — gym-rollout stays the stateless external-trainer grading endpoint (harden per #2/#3); add a separate server-side policy runner for OUR own eval loops so we're not round-tripping through the public route. Do not merge them.
- Foundry dashboard panel: YES, build it — surface per-class label balance, split counts, and the oracle-divergence count (target 0) live. Defer until #1–#3 land; it's the demo surface, not the integrity surface.
```

Relevant files: `/Users/bohueilin/hackathons/Floor design/ml/train.py` (BL-4), `/Users/bohueilin/hackathons/Floor design/ml/eval_trained.py` (added), `/Users/bohueilin/hackathons/Floor design/ml/dataset.py` (anti-leakage), `/Users/bohueilin/hackathons/Floor design/services/foundry-train/{floor_sampler.py,build_dataset.py}` (trainenv P0), `/Users/bohueilin/hackathons/Origin/apps/origin-web/server/foundryHandler.ts` (route DoS + clamp), `/Users/bohueilin/hackathons/Origin/apps/origin-web/server/foundryHandler.test.ts` (coverage gap).
