import { describe, expect, it } from 'vitest'
import {
  heldoutScenarios,
  scenarioCorpusSummary,
  seedScenarios,
  trainScenarios,
} from './seedScenarios'
import type { Action, Difficulty, Domain, ScenarioSplit } from './types'

const DOMAINS: Domain[] = ['commerce', 'business_ops', 'robotics']
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard']
const SPLITS: ScenarioSplit[] = ['train', 'heldout']
const ACTIONS: Action[] = ['act', 'ask', 'escalate', 'stop']

function byDomain(domain: Domain) {
  return seedScenarios.filter((s) => s.domain === domain)
}

describe('seed scenario corpus', () => {
  it('contains exactly 24 scenarios', () => {
    expect(seedScenarios).toHaveLength(24)
    expect(scenarioCorpusSummary.total).toBe(24)
  })

  it('has unique ids', () => {
    const ids = seedScenarios.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has exactly 8 scenarios per domain', () => {
    for (const domain of DOMAINS) {
      expect(byDomain(domain)).toHaveLength(8)
    }
  })

  it('has exactly 5 train and 3 heldout scenarios per domain', () => {
    for (const domain of DOMAINS) {
      const scenarios = byDomain(domain)
      expect(scenarios.filter((s) => s.split === 'train')).toHaveLength(5)
      expect(scenarios.filter((s) => s.split === 'heldout')).toHaveLength(3)
    }
  })

  it('covers every difficulty tier in every domain', () => {
    for (const domain of DOMAINS) {
      const tiers = new Set(byDomain(domain).map((s) => s.difficulty))
      for (const tier of DIFFICULTIES) {
        expect(tiers.has(tier)).toBe(true)
      }
    }
  })

  it('has at least one scenario per split in every domain', () => {
    for (const domain of DOMAINS) {
      for (const split of SPLITS) {
        expect(byDomain(domain).some((s) => s.split === split)).toBe(true)
      }
    }
  })

  it('exposes train/heldout splits that reconstruct the full corpus', () => {
    expect(trainScenarios).toHaveLength(15)
    expect(heldoutScenarios).toHaveLength(9)
    expect(trainScenarios.length + heldoutScenarios.length).toBe(seedScenarios.length)
  })

  it('reports a summary consistent with the corpus', () => {
    expect(scenarioCorpusSummary.bySplit).toEqual({ train: 15, heldout: 9 })
    expect(scenarioCorpusSummary.byDomain).toEqual({
      commerce: 8,
      business_ops: 8,
      robotics: 8,
    })
    const difficultyTotal = DIFFICULTIES.reduce(
      (sum, d) => sum + scenarioCorpusSummary.byDifficulty[d],
      0,
    )
    expect(difficultyTotal).toBe(24)
  })

  it('keeps every scenario structurally valid', () => {
    for (const s of seedScenarios) {
      expect(Number.isFinite(s.visibleRiskScore)).toBe(true)
      expect(s.visibleRiskScore).toBeGreaterThanOrEqual(0)
      expect(s.visibleRiskScore).toBeLessThanOrEqual(1)
      expect(ACTIONS).toContain(s.correctAction)
      expect(s.hiddenRisk.trim().length).toBeGreaterThan(0)
      expect(s.rationale.trim().length).toBeGreaterThan(0)
    }
  })
})
