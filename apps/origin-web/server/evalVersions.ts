// ----------------------------------------------------------------------------
// Eval attribution versions.
//
// A frontier-lab eval record must be attributable to a specific environment,
// scenario set, verifier, reward model, and license policy — so a persisted row
// can be replayed and reasoned about long after the run. Bump the relevant
// constant whenever that component's behavior changes.
// ----------------------------------------------------------------------------

import { SCENARIO_VERSION } from '../src/seedScenarios.ts'
import type { EvalVersions } from '../src/types'

export const ENVIRONMENT_NAME = 'autonomy_trace_console'
/** Shape/format version of the scenario registry. */
export const SCENARIO_REGISTRY_VERSION = '1.0.0'
/** Behavior version of the deterministic verifier (src/verifier.ts). */
export const VERIFIER_VERSION = '1.0.0'
/** Behavior version of the reward model (the verifier's reward calibration). */
export const REWARD_MODEL_VERSION = '1.0.0'
/** Behavior version of the license ladder + gate (src/license.ts). */
export const LICENSE_POLICY_VERSION = '1.0.0'

/** Behavior version of the MCP tool registry authorization (scope map + token bucket) — rlkit/tool-registry.mjs (P3). */
export const TOOL_REGISTRY_VERSION = '1.0.0'
/** Behavior version of the curriculum band registry + frontier sampler + promotion policy — src/curriculum.ts (P8). */
export const CURRICULUM_POLICY_VERSION = '1.0.0'
/** Behavior version of the sandbox rate model (cost_model rates for the Daytona/in-process tiers) — rlkit/cost-ledger.mjs (P4/P6). */
export const DAYTONA_RATE_VERSION = '1.0.0'

/** Schema version of the persisted audit row (bump when columns change). */
export const ROW_SCHEMA_VERSION = '1.0.0'

/** Optional build commit, from env if available; otherwise null. */
export const APP_COMMIT: string | null = process.env.APP_COMMIT ?? null

/** The attribution block stamped onto every server-owned trace + persisted row. */
export function getEvalVersions(): EvalVersions {
  return {
    environmentName: ENVIRONMENT_NAME,
    scenarioRegistryVersion: SCENARIO_REGISTRY_VERSION,
    scenarioVersion: SCENARIO_VERSION,
    verifierVersion: VERIFIER_VERSION,
    rewardModelVersion: REWARD_MODEL_VERSION,
    licensePolicyVersion: LICENSE_POLICY_VERSION,
    appCommit: APP_COMMIT,
  }
}
