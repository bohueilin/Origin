// Type surface for cost-ledger.mjs — the deterministic, digest-bound CostLedger (P6).
// Hand-written declarations; keep in lockstep with cost-ledger.mjs.

/** Pinned rate model — lives in the bundle's cost_model, never in code alone. */
export interface CostModel {
  /** USD per 1M input tokens. */
  token_in_per_m: number
  /** USD per 1M output tokens. */
  token_out_per_m: number
  sandbox_usd_per_second: number
  verifier_usd_per_ms?: number
  storage_usd_per_byte: number
  [key: string]: unknown
}

export interface TokenCounts {
  in: number
  out: number
}

export interface CostLedger {
  /** RECORDED (authoritative — hosted models are not reproducible); {in:0,out:0} in the deterministic gym. */
  tokens: TokenCounts
  token_cost_usd: number
  /** Synthetic clock (= applied steps), never wall-clock — reproduces in vitest. */
  sandbox_seconds: number
  sandbox_cost_usd: number
  verifier_ms: number
  verifier_cost_usd: number
  storage_bytes: number
  storage_cost_usd: number
  total_usd: number
  /** Attribution only — never feeds the license/safety gate. null when total_usd is 0. */
  reward_per_dollar: number | null
  rate_digest: string
}

export function rateDigest(costModel: CostModel): string

export function buildCostLedger(args: {
  sandbox_seconds: number
  tokens?: TokenCounts
  storage_bytes: number
  verifier_ms?: number
  reward?: number
  costModel: CostModel
}): CostLedger
