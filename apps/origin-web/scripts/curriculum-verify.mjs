// Origin Training Evidence — curriculum:verify (replay a CurriculumState).
// =============================================================================
// Re-derives bands from the frozen BAND_REGISTRY, RE-MEASURES the baseline's per-band
// competence via the pinned verifier, and confirms the committed CurriculumState
// reproduces (self-consistent digest + honest competence). A tampered pass rate that
// inflates mastery fails to reproduce.
//
//   node scripts/curriculum-verify.mjs [state.json]
// Exit: 0 verified · 3 competence/evidence mismatch.
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recklessFinishPolicy } from '../src/warehouse.ts'
import { measureCompetence } from '../src/curriculum.ts'
import { canonical } from '../rlkit/env-evidence.mjs'
import { verifyCurriculumState, bandRegistryDigest } from '../rlkit/curriculum-evidence.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EX = resolve(HERE, '../docs/examples')
const argv = process.argv.slice(2)
const statePath = argv[0] || resolve(EX, 'warehouse.curriculum-state.json')
const state = JSON.parse(readFileSync(statePath, 'utf8'))

const checks = []
const ok = (b, m) => (checks.push([b ? 'PASS' : 'FAIL', m]), b)

const selfOk = ok(verifyCurriculumState(state), 'curriculum state is self-consistent + pinned to the frozen band registry')
const registryOk = ok(state.band_registry_digest === bandRegistryDigest(), 'band_registry_digest recomputes from BAND_REGISTRY')
const fresh = measureCompetence((t) => recklessFinishPolicy(t))
const competenceOk = ok(canonical(fresh) === canonical(state.competence), 'per-band competence re-measures identically under the pinned verifier')

for (const [status, msg] of checks) console.log(`${status}  ${msg}`)
const code = selfOk && registryOk && competenceOk ? 0 : 3
console.log(code === 0
  ? `\nVERIFIED — the curriculum state reproduces (frontier ${state.active_band}, ${state.promotion.promoted ? `promoted to ${state.promotion.to}` : 'held'}). Difficulty is verifier-independent metadata; the score never reads the band.`
  : `\nFAILED (exit ${code}) — the curriculum state does not reproduce (a pass rate or the band registry was tampered).`)
process.exit(code)
