// Origin Training Evidence — runEpisode (P2+P4 driver).
// =============================================================================
// Drives a rollout through the provider-agnostic Executor seam and seals it into an
// EpisodeTrace + ScoreReceipt. The executor is TRANSPORT, not the scorer: the recorded
// actions are authoritative and re-scored by the pinned reward module. Because it uses
// the SAME build-trace helper as the generator, an in-process (or FakeDaytona) rollout
// reproduces the exact digests the generator commits.
// =============================================================================

import { bfsOracle } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { VERIFIER_VERSION, REWARD_MODEL_VERSION } from '../server/evalVersions.ts'
import { scoreReward } from './reward-module.ts'
import { buildEpisodeAndReceipt } from './build-trace.mjs'

export function runEpisode(executor, { bundle, task, actions, seed, idPrefix = 'run', policyName = 'run-episode', judge } = {}) {
  const handle = executor.prepare(bundle) // guards env_bundle_digest
  const session = executor.forkRollout(handle, { task, seed: seed ?? task.seed })

  const applied = []
  for (const action of actions) {
    const r = executor.step(session, action)
    if (r.applied) applied.push(action)
    if (r.done) break
  }
  const meter = executor.meter(session)
  executor.teardown(handle)

  // score is authoritative from the RECORDED actions (executor never scores).
  const rollout = scoreReward(task, applied, { policy: policyName, judge })
  const lic = computeLicenseFromVerdicts([
    { passed: rollout.passed, reward: rollout.reward, catastrophic: rollout.falseAccept },
  ])
  const { episode, receipt } = buildEpisodeAndReceipt({
    idPrefix,
    task,
    actions: applied,
    rollout,
    oracleLabel: bfsOracle(task).label,
    policyName,
    envBundleDigest: bundle.env_bundle_digest,
    verifierVersion: VERIFIER_VERSION,
    rewardModelVersion: REWARD_MODEL_VERSION,
    licenseLevel: lic.level.id,
    costModel: bundle.cost_model, // P6 — reproduces the committed cost ledger
    sandboxSeconds: meter.sandbox_seconds, // from the executor's meter()
  })
  return { episode, receipt, meter, rollout, license: lic.level.id, tier: executor.kind }
}
