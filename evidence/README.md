# evidence/

The Origin evidence surface — **replayable proof, not artifacts checked into git.** Evidence bundles + dashboards are *regenerated* from pinned source (builders + deterministic oracle), so they are excluded from the repo and reproduced on demand. This keeps the tree lean and forces every number to be re-derivable.

## Two evidence layers

1. **Training evidence (RL) — `apps/origin-web/`.** Reproducible **ScoreReceipts**: an EnvironmentBundle + a recorded action trace + a pinned verifier → a tamper-evident receipt you re-derive with `npm run env:verify` (see `apps/origin-web/docs/rl-platform-architecture.md`). Nine pillars, 360 tests. The committed examples (`apps/origin-web/docs/examples/*`) are the digest-valid proof set.

2. **Site-to-Gym evidence (Physical AI) — `site-to-gym/`.** Oracle-labeled Robot-Readiness Gyms + oracle-verified preference pairs + a bounded safety policy. Regenerate:
   ```bash
   cd site-to-gym
   npm run build:rsi && npm run validate:rsi        # RSI dataset bundle → outputs/rsi_dataset/
   npm run propose:verify && npm run render:dashboard # → outputs/rsi_dashboard.html
   npm run eval:customer-holdout                     # customer-readiness verdict (blocked by default)
   shasum -a 256 -c CHECKSUMS                        # provenance
   ```
   Headline numbers (regenerable, from `site-to-gym/README.md`): **4,704** oracle-labeled floors (finish 1009 / escalate 2947 / refuse 748) → **4,704** oracle-verified preference pairs at **0 divergence** → a raw-occupancy safety policy at **~98.5%** balanced accuracy (5-seed), budget-aware **~96.8%**, all oracle-labeled and off-Cerebras.

## Claim boundary
Bounded Robot-Readiness **Gym evidence**, not robot certification. The deterministic oracle is the only label/reward authority. Synthetic demo evidence, generated counterfactual robustness, and authorized local fixtures are **each separated** and are **not** real customer-owned proof. Real customer readiness stays **blocked** until approved real customer evidence exists and passes gates. Training is **fail-closed**.
