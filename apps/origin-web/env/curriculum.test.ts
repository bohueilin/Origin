import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { warehouseTasks, oraclePolicy, recklessFinishPolicy } from '../src/warehouse.ts'
import { canonical } from '@origin/evidence/env-evidence'
import { verifyCurriculumState } from './curriculum-evidence.mjs'
import {
  BANDS, BAND_REGISTRY, difficultyBand, taskComplexity, nextBand,
  measureCompetence, curriculumSample, promoteCurriculum,
} from '../src/curriculum.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))

describe('curriculum (P8) — difficulty bands as first-class metadata', () => {
  it('difficultyBand is deterministic and spreads the task set across all 5 bands', () => {
    const counts: Record<string, number> = {}
    for (const t of warehouseTasks) {
      const b = difficultyBand(t)
      expect(difficultyBand(t)).toBe(b) // deterministic
      counts[b] = (counts[b] ?? 0) + 1
    }
    for (const band of BANDS) expect(counts[band], `band ${band} is populated`).toBeGreaterThan(0)
  })

  it('the band is a pure function of measurable complexity + the frozen cutoffs', () => {
    for (const t of warehouseTasks) {
      const score = taskComplexity(t)
      const i = BAND_REGISTRY.cutoffs.filter((c) => score >= c).length
      expect(difficultyBand(t)).toBe(BANDS[i])
    }
  })

  it('curriculumSample picks the hardest band inside the [0.5,0.7] frontier', () => {
    const comp = { B0: { pass: 5, total: 5, rate: 1 }, B1: { pass: 3, total: 5, rate: 0.6 }, B2: { pass: 1, total: 5, rate: 0.2 } }
    expect(curriculumSample(comp).band).toBe('B1')
    const comp2 = { B0: { pass: 5, total: 5, rate: 1 }, B1: { pass: 2, total: 5, rate: 0.4 } }
    expect(curriculumSample(comp2).band).toBe('B1') // no in-frontier → closest to midpoint
  })

  it('promoteCurriculum advances one band on mastery, holds below, caps at B4', () => {
    expect(promoteCurriculum('B0', { B0: { pass: 5, total: 5, rate: 1 } }).to).toBe('B1')
    expect(promoteCurriculum('B0', { B0: { pass: 2, total: 5, rate: 0.5 } }).promoted).toBe(false)
    expect(promoteCurriculum('B4', { B4: { pass: 5, total: 5, rate: 1 } }).to).toBe('B4')
    expect(nextBand('B4')).toBe('B4')
  })

  it('the oracle masters every band it covers (pass rate 1.0)', () => {
    const comp = measureCompetence((t) => oraclePolicy(t))
    for (const band of Object.keys(comp)) expect(comp[band].rate).toBe(1)
  })

  it('the committed CurriculumState re-measures identically under the pinned verifier', () => {
    const state = load('warehouse.curriculum-state.json')
    expect(verifyCurriculumState(state)).toBe(true)
    const fresh = measureCompetence((t) => recklessFinishPolicy(t))
    expect(canonical(fresh)).toBe(canonical(state.competence))
    const tampered = { ...state, competence: { ...state.competence } }
    const anyBand = Object.keys(tampered.competence)[0]
    tampered.competence[anyBand] = { ...tampered.competence[anyBand], rate: 0.99 }
    expect(verifyCurriculumState(tampered)).toBe(false)
  })

  it('the VERIFIER never reads the difficulty band (Goodhart guard)', () => {
    // the band lives ONLY in curriculum.ts — the deterministic verifier is band-blind,
    // so a policy cannot farm easy bands for reward.
    const warehouseSrc = readFileSync(resolve(HERE, '../src/warehouse.ts'), 'utf8')
    const verifierSrc = readFileSync(resolve(HERE, '../src/verifier.ts'), 'utf8')
    for (const src of [warehouseSrc, verifierSrc]) {
      expect(src).not.toContain('difficultyBand')
      expect(src).not.toContain('difficulty_band')
      expect(src).not.toContain('BAND_REGISTRY')
    }
  })
})
