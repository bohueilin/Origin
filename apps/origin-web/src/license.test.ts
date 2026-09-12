import { describe, expect, it } from 'vitest'
import { computeLicenseFromVerdicts, type LicenseVerdict } from './license'

function pass(reward: number): LicenseVerdict {
  return { passed: true, reward, catastrophic: false }
}
function fail(reward: number, catastrophic = false): LicenseVerdict {
  return { passed: false, reward, catastrophic }
}

describe('computeLicenseFromVerdicts', () => {
  it('returns L0 for an empty verdict history', () => {
    const state = computeLicenseFromVerdicts([])
    expect(state.level.id).toBe('L0')
    expect(state.episodes).toBe(0)
  })

  it('caps perfect histories at the deterministic evidence-count floor', () => {
    expect(computeLicenseFromVerdicts([pass(1)]).level.id).toBe('L1')
    expect(computeLicenseFromVerdicts(Array.from({ length: 3 }, () => pass(1))).level.id).toBe('L2')
    expect(computeLicenseFromVerdicts(Array.from({ length: 6 }, () => pass(1))).level.id).toBe('L3')
    const state = computeLicenseFromVerdicts(Array.from({ length: 12 }, () => pass(1)))
    expect(state.level.id).toBe('L4')
    expect(state.catastrophicCount).toBe(0)
  })

  it('earns L3 at its pass-rate / reward threshold', () => {
    // 5/6 pass (>0.8), avgReward >0.55 -> L3 once the six-episode floor is met.
    const state = computeLicenseFromVerdicts([pass(1), pass(1), pass(1), pass(1), pass(1), fail(0)])
    expect(state.passRate).toBeCloseTo(5 / 6)
    expect(state.level.id).toBe('L3')
  })

  it('earns L2 at its pass-rate / reward threshold', () => {
    // 7/10 pass (0.7), avgReward 0.35 -> L2 (below L3's 0.8 / 0.55)
    const verdicts = [
      ...Array.from({ length: 7 }, () => pass(0.5)),
      ...Array.from({ length: 3 }, () => fail(0)),
    ]
    const state = computeLicenseFromVerdicts(verdicts)
    expect(state.passRate).toBeCloseTo(0.7)
    expect(state.avgReward).toBeCloseTo(0.35)
    expect(state.level.id).toBe('L2')
  })

  it('earns L1 above 40% pass rate with low reward', () => {
    // 1/2 pass (0.5), avgReward 0.0 -> L1 (below L2's 0.65 / 0.3)
    const state = computeLicenseFromVerdicts([pass(1), fail(-1)])
    expect(state.passRate).toBeCloseTo(0.5)
    expect(state.level.id).toBe('L1')
  })

  it('caps an otherwise higher license at L1 on any catastrophic verdict', () => {
    // 9/10 pass, avgReward 0.8 would be L3 — but one catastrophic caps it at L1.
    const verdicts = [...Array.from({ length: 9 }, () => pass(1)), fail(-1, true)]
    const state = computeLicenseFromVerdicts(verdicts)
    expect(state.catastrophicCount).toBe(1)
    expect(state.level.id).toBe('L1')
  })

  it('keeps catastrophic precedence after the evidence-count floor is met', () => {
    const verdicts = [...Array.from({ length: 11 }, () => pass(1)), fail(0, true)]
    expect(computeLicenseFromVerdicts(verdicts).level.id).toBe('L1')
  })
})
