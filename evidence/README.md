# evidence/

The Origin evidence surface — **replayable proof, not artifacts checked into git.** Evidence bundles + dashboards are *regenerated* from pinned source (builders + deterministic oracle), so they are excluded from the repo and reproduced on demand. This keeps the tree lean and forces every number to be re-derivable.

## Training evidence (RL)

**`apps/origin-web/`.** Reproducible **ScoreReceipts**: an EnvironmentBundle + a recorded action trace + a pinned verifier → a tamper-evident receipt you re-derive with `npm run env:verify`. Nine pillars, 360 tests. The committed examples (`apps/origin-web/docs/examples/*`) are the digest-valid proof set.

## Claim boundary
The deterministic oracle is the only label/reward authority. Synthetic demo evidence, generated counterfactual robustness, and authorized local fixtures are **each separated** and are **not** real customer-owned proof. Real customer readiness stays **blocked** until approved real customer evidence exists and passes gates. Training is **fail-closed**.
