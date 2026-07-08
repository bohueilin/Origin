// Type surface for build-trace.mjs — the ONE shared EpisodeTrace + ScoreReceipt
// builder (generator path and executor path are byte-identical by construction).
// Hand-written declarations; keep in lockstep with build-trace.mjs.

import type { EpisodeTrace, ScoreReceipt, RolloutSummary } from '@origin/evidence/env-evidence'
import type { CostModel } from '@origin/evidence/cost-ledger'

export function buildEpisodeAndReceipt(args: {
  idPrefix: string
  task: { id: string; level?: string; seed?: number; [key: string]: unknown }
  actions: readonly unknown[]
  /** Gate-shaped rollout; outcome/shapedBonus ride the reward.computed event. */
  rollout: RolloutSummary & { outcome?: string; shapedBonus?: number }
  oracleLabel: string
  policyName: string
  envBundleDigest: string
  verifierVersion: string
  rewardModelVersion: string
  licenseLevel: string
  /** P6: when present, a CostLedger is folded into the receipt. */
  costModel?: CostModel | null
  /** = executor.meter().sandbox_seconds; defaults to the applied step count. */
  sandboxSeconds?: number
}): { episode: EpisodeTrace; receipt: ScoreReceipt }
