// Origin Training Evidence — CostLedger (P6: cost-per-rollout attribution)
// =============================================================================
// A deterministic, digest-bound cost ledger attached to the ScoreReceipt.
//
// Reproducibility split (honest): tokens are RECORDED (authoritative — a hosted model
// is not reproducible), while sandbox_seconds / verifier_ms / storage_bytes ARE
// derivable and are RECOMPUTED. In the P0 deterministic gym there is no model, so
// tokens = {in:0,out:0}; the cost is the sandbox synthetic clock (= applied steps) +
// storage. Rates live in the PINNED bundle.cost_model, never in code alone.
//
// HONESTY: cost is attribution-only. reward_per_dollar never feeds the license/safety
// gate. sandbox_seconds is a synthetic clock (= steps), never wall-clock, so the
// ledger reproduces in vitest.
// =============================================================================

import { canonical, sha256 } from './env-evidence.mjs'

const usd = (n) => Math.round(n * 1e6) / 1e6 // 6-decimal USD

export function rateDigest(costModel) {
  return sha256(canonical(costModel))
}

export function buildCostLedger({ sandbox_seconds, tokens = { in: 0, out: 0 }, storage_bytes, verifier_ms = 0, reward = 0, costModel }) {
  const token_cost_usd = usd((tokens.in * costModel.token_in_per_m + tokens.out * costModel.token_out_per_m) / 1e6)
  const sandbox_cost_usd = usd(sandbox_seconds * costModel.sandbox_usd_per_second)
  const verifier_cost_usd = usd(verifier_ms * (costModel.verifier_usd_per_ms ?? 0))
  const storage_cost_usd = usd(storage_bytes * costModel.storage_usd_per_byte)
  const total_usd = usd(token_cost_usd + sandbox_cost_usd + verifier_cost_usd + storage_cost_usd)
  const reward_per_dollar = total_usd > 0 ? usd(reward / total_usd) : null
  return {
    tokens,
    token_cost_usd,
    sandbox_seconds,
    sandbox_cost_usd,
    verifier_ms,
    verifier_cost_usd,
    storage_bytes,
    storage_cost_usd,
    total_usd,
    reward_per_dollar,
    rate_digest: rateDigest(costModel),
  }
}
