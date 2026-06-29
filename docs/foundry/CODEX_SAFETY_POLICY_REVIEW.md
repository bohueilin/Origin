# Handoff — Review of Codex Safety Policy v1 (finish / escalate / refuse)

## Verdict (2 lines)
The pipeline is sound end-to-end and the artifact is honest in its plumbing — no label/provenance leakage, saved-weights == reported metrics (delta 0), refuse-recall surfaced, trained locally with Gemma kept inference-only. **BUT the headline "100% safety policy" is effectively tautological:** the 36 features are the deterministic oracle's own sufficient statistics, so a hardcoded 3-line rule already scores ~98%. It must be reframed and ablated before it can be stated as a *learning* claim.

## Gate results

| Setting | features | test balanced acc | refuse recall | escalate recall | provenance |
|---|---|---|---|---|---|
| Full feature MLP (accepted, policy:v1) | 36 | **1.0** | 1.0 | 1.0 | lead-verified |
| Trivial 3-line oracle-flag rule | 3 flags | **0.989** (acc 0.9806) | 1.0 | 0.968 | lead + skeptic, matched to 4 decimals |
| Ablation A — drop 11 path/cost hints, keep `*_unsafe` flags | 25 | **1.0** | 1.0 | 1.0 | ablation agent, stable across 5 seeds |
| **Ablation B — pure raw geometry, drop the 3 `*_unsafe` flags too** | 22 | **0.939** (≈0.937 over 5 seeds, range 0.931–0.940) | 1.0 (range 0.94–1.0) | 0.818 | ablation agent |

Splits (confirmed): train 4254 / val 534 / test 516; test support escalate 314 / finish 118 / refuse 84; total 5304; 2974 train preference-pairs.

## What's honest and good (keep this — do not walk it back)
- **No leakage of the answer.** `oracle_label`, `layout_id`, and provenance are NOT in the 36 features. `extract_features()` returns geometry only.
- **Saved == reported.** `ml/eval_safety_policy.py` loads the saved best-val weights, evaluates held-out val+test, reports `saved_vs_reported_delta = 0.0`. This was the learned fix from the prior BL-4 review and it held.
- **Refuse-recall is surfaced**, not buried in an aggregate.
- **Honest compute story:** numpy MLP trained locally; Gemma-4 is inference-only on Cerebras and is not claimed to be the trained model.
- **Split hygiene is clean.** Skeptic confirmed 0 `_aug_` variants straddle splits, 0 train↔test / train↔val collisions on base floors, floor_sampler held out 480/60/60.
- **The gym → oracle → policy loop closes** and is reproducible.

## The core finding
The 1.0 is **recover-the-oracle**, not learned spatial reasoning.
- A zero-learning 3-line rule on `{item_unsafe, drop_unsafe, unsafe_blocks_finish_hint → refuse; safe_start_item_exists AND safe_item_drop_exists → finish; else escalate}` already scores **0.9806 / bal-acc 0.989**.
- **Ablation A (this review): dropping all 11 explicit path-existence/length/finish-cost hints costs nothing — still 1.0 across all 5 seeds.** So the hints aren't what's carrying it.
- The 1.0 is carried by the three `*_unsafe` flags, which *are* the oracle's own refuse inputs.
- **Ablation B (this review): strip those flags too → pure raw geometry → 0.939 balanced acc (≈0.937 over 5 seeds).** This is the honest learning floor: real geometric signal (well above the 0.333 majority baseline), with the residual error a *systematic over-refusal* — 57/314 escalate cases pushed to refuse (a safe-direction error, worth noting).
- Skeptic's nuance, worth carrying: the test set is additionally *softened* — 380/516 test rows share an exact 36-D feature vector with a train row (benign feature-map collapse of distinct base floors, **not** label leakage: 0 label-conflicting vectors, 1.0 is the Bayes ceiling of this representation). On a feature-disjoint regroup, a pure memorizer collapses to 0.53 while the oracle rule stays 1.0 — proving the score is a property of the oracle-encoding feature map, not of which floors landed in test.

## The honest reframe (exact copy for dashboard / handoff)
> The policy **recovers the deterministic oracle's verdict from floor geometry** — test balanced accuracy **0.94 on raw geometry**, **1.0 with oracle-summary features** (vs. 0.333 majority baseline). This is a bounded robot-readiness Gym, not production robot certification: Gemma proposes, Origin verifies, the deterministic oracle judges.

Do **not** claim "100% learned safety." The 100% is *expected* given oracle-derived features, not *impressive*.

## Recommendation (decisive)
1. **Make the 0.94 raw-geometry number the headline.** That is the real learning result.
2. **Keep the 36-feature 1.0 as the labeled "oracle-recovery upper bound"** — useful as a sanity ceiling, never as the safety claim.
3. **Harder generalization target:** predict the terminal from raw occupancy *without* the safe-path-existence hints (and ideally without the `*_unsafe` flags) — i.e. make Ablation B the product target, not an afterthought.
4. **Add the missing caveat** to `policy_config.json:claim_boundary`: a perfect score is expected, not impressive, because features are oracle-derived sufficient statistics.
5. Carry the skeptic's leakage/collision findings as a known limitation (test set softened by 380/516 exact feature collisions).

## Prompt to send back to Codex

```md
Codex — review of your finish/escalate/refuse safety policy v1. Accept the plumbing, fix the claim.

ACCEPTED (do not change): no label/provenance leakage (features are geometry-only),
saved-weights == reported metrics (delta 0), refuse-recall surfaced, local numpy MLP
with Gemma inference-only, clean augmentation/sampler split hygiene. Good work — the
delta-0 saved-eval is exactly the BL-4 fix carried forward.

THE PROBLEM: the headline "100% safety policy" is tautological. The 36 features are the
oracle's own sufficient statistics. A hardcoded 3-line rule on {item_unsafe, drop_unsafe,
unsafe_blocks_finish_hint, safe_*_exists} already scores 0.9806 test acc with ZERO learning.

ABLATIONS (verified, 5 seeds):
- Drop the 11 path/cost hints, keep the *_unsafe flags → still 1.0. The hints carry nothing.
- Drop the 3 *_unsafe flags too (pure raw geometry, 22 feats) → 0.939 balanced acc (≈0.937
  over 5 seeds). Residual error is systematic over-refusal: 57/314 escalate→refuse.

REQUIRED CHANGES:
1. Report 0.94 (raw-geometry) as THE policy result. Label the 36-feature 1.0 as
   "oracle-recovery upper bound," never as the safety number.
2. Never headline "100% safety policy." Reframe: "policy RECOVERS the deterministic oracle's
   verdict from geometry — 0.94 raw, 1.0 with oracle-summary features; bounded Gym, not
   production certification."
3. Add the caveat to policy_config.json:claim_boundary that a perfect score is EXPECTED given
   oracle-derived features.
4. Note the test-set softening: 380/516 test rows share an exact 36-D feature vector with a
   train row (benign collapse, not leakage). If you want a real generalization claim, regroup
   on a FAMILY-disjoint / feature-disjoint split where no vector appears in both train and test,
   and report that number.
```

## Relevant files (absolute)
- Features: `/Users/bohueilin/hackathons/Floor design/ml/safety_policy.py` (`extract_features`, lines 207–270; the 3 `*_unsafe` flags at 248–250; path-existence hints 254–261; budget margins + `unsafe_blocks_finish_hint` 266–268)
- Eval (verified genuine, delta 0): `/Users/bohueilin/hackathons/Floor design/ml/eval_safety_policy.py`
- Config: `/Users/bohueilin/hackathons/Floor design/ml/policy_config.json` (seed 29, 140 epochs, hidden 48, lr 0.012, wd 1e-4, dpo_weight 0.35)
- Oracle (ground truth being recovered): `/Users/bohueilin/hackathons/Origin/services/foundry-train/reward_bridge.py` (`bfs_oracle`, lines 156–188)
- Throwaway ablation scripts (not part of the accepted artifact): `/private/tmp/claude-501/-Users-bohueilin-hackathons-0619-autonomy-trace-console/9fae67a9-d9d1-4231-92cf-22c1cf33b633/scratchpad/ablate.py`, `ablate_seeds.py`, `ablate2.py`, `ablate3.py`, `ablate4.py`

http://localhost:5275/app.html
