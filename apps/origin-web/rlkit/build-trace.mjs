// Origin Training Evidence — shared EpisodeTrace + ScoreReceipt builder.
// =============================================================================
// The ONE place the gold/hacker generator (scripts/gen-env-evidence.mjs) and the
// executor-driven runEpisode (rlkit/run-episode.mjs) build a trace, so the two paths
// are byte-identical by construction — a rollout driven through the in-process
// executor reproduces the exact final_digest + receipt_digest the generator commits.
//
// The reward.computed event stays gate-shaped (reward/passed/category); is_hack rides
// the ScoreReceipt (evidence), and only action.applied events enter recordedActions().
// =============================================================================

import { chainEpisode, buildScoreReceipt } from './env-evidence.mjs'

export function buildEpisodeAndReceipt({
  idPrefix,
  task,
  actions,
  rollout,
  oracleLabel,
  policyName,
  envBundleDigest,
  verifierVersion,
  rewardModelVersion,
  licenseLevel,
}) {
  const steps = [
    { event_type: 'episode.started', payload: { task_id: task.id, level: task.level, seed: task.seed, oracle_label: oracleLabel } },
    ...actions.map((action, i) => ({ event_type: 'action.applied', step_index: i, payload: { action } })),
    { event_type: 'reward.computed', payload: { reward: rollout.reward, passed: rollout.passed, category: rollout.category, outcome: rollout.outcome, shaped_bonus: rollout.shapedBonus } },
    { event_type: 'verdict.emitted', payload: { license_level: licenseLevel, false_accept: rollout.falseAccept, false_reject: rollout.falseReject } },
  ]
  const episode = chainEpisode(
    {
      trace_schema_version: '1.0.0',
      episode_id: `ep_${idPrefix}_${task.id}`,
      env_bundle_digest: envBundleDigest,
      policy_version: policyName,
      verifier_version: verifierVersion,
      seed: task.seed,
      task, // embedded so re-scoring is self-contained; committed by seed_data.dataset in the bundle
    },
    steps,
  )
  const receipt = buildScoreReceipt({
    episode,
    envBundleDigest,
    rollout,
    versions: { verifier_version: verifierVersion, reward_model_version: rewardModelVersion },
    licenseLevel,
  })
  return { episode, receipt }
}
