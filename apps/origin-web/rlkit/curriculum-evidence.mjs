// Origin Training Evidence — CurriculumState sealing (P8)
// =============================================================================
// The sealing layer for the curriculum: a content-addressed, versioned CurriculumState
// (band_registry_digest + per-band competence + promotion + evidence_digest). Kept in
// .mjs so it can reuse canonical()+sha256() from env-evidence.mjs verbatim while the
// pure band/sampler logic stays in src/curriculum.ts.
// =============================================================================

import { canonical, sha256 } from './env-evidence.mjs'
import { BAND_REGISTRY, CURRICULUM_VERSION } from '../src/curriculum.ts'

export const bandRegistryDigest = () => sha256(canonical(BAND_REGISTRY))

export function sealCurriculumState({ policy, active_band, competence, promotion }) {
  const state = {
    curriculum_schema_version: '1.0.0',
    curriculum_version: CURRICULUM_VERSION,
    band_registry_digest: bandRegistryDigest(),
    policy,
    active_band,
    competence, // per-band { pass, total, rate }
    promotion, // { from, to, promoted, mastery, rate }
  }
  state.evidence_digest = sha256(canonical(state))
  return state
}

// The state is self-consistent AND pinned to the frozen band registry — so a tampered
// pass rate (or a swapped band registry) fails to reproduce (curriculum:verify exit 3).
export function verifyCurriculumState(state) {
  const { evidence_digest, ...rest } = state
  if (sha256(canonical(rest)) !== evidence_digest) return false
  if (rest.band_registry_digest !== bandRegistryDigest()) return false
  return true
}
