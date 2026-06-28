import { describe, expect, it } from 'vitest'
import { describeExposure, evaluateRuleOfTwo, type TrifectaExposure } from './ruleOfTwo'

const e = (p: boolean, u: boolean, x: boolean): TrifectaExposure => ({ privateData: p, untrustedContent: u, externalComms: x })

describe('evaluateRuleOfTwo', () => {
  it('allows zero, one, or two exposures autonomously', () => {
    expect(evaluateRuleOfTwo(e(false, false, false)).requiresHuman).toBe(false)
    expect(evaluateRuleOfTwo(e(true, false, false)).withinBudget).toBe(true)
    expect(evaluateRuleOfTwo(e(true, true, false)).withinBudget).toBe(true)
    expect(evaluateRuleOfTwo(e(true, true, false)).requiresHuman).toBe(false)
  })

  it('requires a human when all three are present', () => {
    const v = evaluateRuleOfTwo(e(true, true, true))
    expect(v.count).toBe(3)
    expect(v.withinBudget).toBe(false)
    expect(v.requiresHuman).toBe(true)
    expect(v.reason).toMatch(/lethal trifecta/)
  })

  it('permits all three only once a human has approved', () => {
    const v = evaluateRuleOfTwo(e(true, true, true), true)
    expect(v.requiresHuman).toBe(false)
    expect(v.reason).toMatch(/human approved/)
  })

  it('reports which exposures are present', () => {
    expect(evaluateRuleOfTwo(e(true, false, true)).present).toEqual(['privateData', 'externalComms'])
  })
})

describe('describeExposure', () => {
  it('summarizes exposure', () => {
    expect(describeExposure(e(false, false, false))).toBe('no trifecta exposure')
    expect(describeExposure(e(true, true, true))).toBe('private data + untrusted content + external communication')
  })
})
