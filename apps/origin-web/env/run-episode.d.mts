// Type surface for run-episode.mjs — the P2+P4 driver: a rollout through the
// Executor seam, sealed into an EpisodeTrace + ScoreReceipt via the shared
// build-trace helper (byte-identical to the generator path).
// Hand-written declarations; keep in lockstep with run-episode.mjs.

import type { WarehouseTask, WarehouseAction } from '../src/warehouse.ts'
import type { EpisodeTrace, ScoreReceipt } from '@origin/evidence/env-evidence'
import type { CostModel } from '@origin/evidence/cost-ledger'
import type { RewardVerdict, RewardJudge } from './reward-module.ts'
import type { Executor, ExecutorMeter } from './executor.mjs'

export function runEpisode(
  executor: Executor,
  opts: {
    bundle: { env_bundle_digest: string; cost_model?: CostModel | null; [key: string]: unknown }
    task: WarehouseTask
    actions: readonly WarehouseAction[]
    seed?: number
    idPrefix?: string
    policyName?: string
    /** OPTIONAL post-gate shaper — can only reduce, never rescue a gated 0. */
    judge?: RewardJudge
  },
): {
  episode: EpisodeTrace
  receipt: ScoreReceipt
  meter: ExecutorMeter
  rollout: RewardVerdict
  license: string
  tier: string
}
