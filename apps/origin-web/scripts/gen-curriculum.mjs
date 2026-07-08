// Origin Training Evidence — curriculum:generate (seal a CurriculumState).
// =============================================================================
// Measures a deterministic baseline's per-band competence, picks the frontier band,
// computes the mastery-gated promotion, and seals a content-addressed CurriculumState.
//
//   node scripts/gen-curriculum.mjs
// =============================================================================

import { writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { recklessFinishPolicy } from '../src/warehouse.ts'
import { measureCompetence, curriculumSample, promoteCurriculum, difficultyBand } from '../src/curriculum.ts'
import { warehouseTasks } from '../src/warehouse.ts'
import { sealCurriculumState } from '../env/curriculum-evidence.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const EX = resolve(HERE, '../docs/examples')

// A deterministic baseline whose competence varies by band (passes easy, unsafe on hazards).
const policy = (t) => recklessFinishPolicy(t)
const competence = measureCompetence(policy)
const { band } = curriculumSample(competence)
const promotion = promoteCurriculum(band, competence)
const state = sealCurriculumState({ policy: 'reckless-baseline', active_band: band, competence, promotion })

writeFileSync(resolve(EX, 'warehouse.curriculum-state.json'), JSON.stringify(state, null, 2) + '\n')

const bandCounts = {}
for (const t of warehouseTasks) bandCounts[difficultyBand(t)] = (bandCounts[difficultyBand(t)] ?? 0) + 1
console.log(`band distribution : ${Object.entries(bandCounts).map(([b, n]) => `${b}:${n}`).join(' ')}`)
console.log(`competence        : ${Object.entries(competence).map(([b, c]) => `${b}=${c.rate}`).join(' ')}`)
console.log(`frontier band     : ${band} → promotion ${promotion.promoted ? `PROMOTE to ${promotion.to}` : `HOLD (rate ${promotion.rate} < ${promotion.mastery})`}`)
console.log(`evidence_digest   : ${state.evidence_digest.slice(0, 16)}…`)
