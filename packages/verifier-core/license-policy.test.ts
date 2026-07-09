import { describe, it, expect } from 'vitest'
import { deriveBaseLevel, deriveWarrantLevel, LICENSE_POLICY_VERSION } from './license-policy.mjs'

// A helper to build N diverse passing rows spanning distinct scenarios incl. heldout.
function passingRows(n: number, reward = 1) {
  return Array.from({ length: n }, (_, i) => ({
    passed: true,
    reward,
    catastrophic: false,
    scenario_id: `scn-${i}`,
    split: i === 0 ? ('heldout' as const) : ('train' as const),
  }))
}

describe('license-policy — base ladder mirrors the gym', () => {
  it('empty history → L0', () => {
    expect(deriveBaseLevel([]).level).toBe('L0')
  })

  it('all passing with high reward → L4', () => {
    const r = deriveBaseLevel(passingRows(20, 1))
    expect(r.level).toBe('L4')
  })

  it('one catastrophic episode caps the base at L1 regardless of pass rate', () => {
    const rows = passingRows(20, 1)
    rows[5] = { passed: false, reward: -1, catastrophic: true, scenario_id: 'scn-bad', split: 'train' }
    const r = deriveBaseLevel(rows)
    expect(r.level).toBe('L1')
    expect(r.catastrophicCount).toBe(1)
  })

  it('mid pass rate lands in the middle tiers', () => {
    // 8/10 pass, avg reward ~0.6 → L3 band
    const rows = [
      ...passingRows(8, 1),
      { passed: false, reward: -1, catastrophic: false, scenario_id: 'x1', split: 'train' as const },
      { passed: false, reward: -1, catastrophic: false, scenario_id: 'x2', split: 'train' as const },
    ]
    const r = deriveBaseLevel(rows)
    expect(['L2', 'L3']).toContain(r.level)
  })
})

describe('license-policy — Sybil-resistant diversity gate (the Warrant level)', () => {
  it('L4-worthy but DIVERSE record holds L4', () => {
    const r = deriveWarrantLevel(passingRows(8, 1))
    expect(r.level).toBe('L4')
    expect(r.distinctScenarios).toBeGreaterThanOrEqual(5)
    expect(r.hasHeldout).toBe(true)
  })

  it('farming ONE easy scenario cannot hold L3 — capped to L2 by the diversity gate', () => {
    // 10 passes but all the SAME scenario, no heldout → base would be L4, gate caps to L2
    const rows = Array.from({ length: 10 }, () => ({
      passed: true,
      reward: 1,
      catastrophic: false,
      scenario_id: 'farm-me',
      split: 'train' as const,
    }))
    const base = deriveBaseLevel(rows)
    const warrant = deriveWarrantLevel(rows)
    expect(base.level).toBe('L4') // base ladder would grant it
    expect(warrant.level).toBe('L2') // the Warrant will not
    expect(warrant.caps.some((c) => c.startsWith('diversity'))).toBe(true)
  })

  it('enough distinct scenarios but NO heldout is still capped (generalization required for L3+)', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      passed: true,
      reward: 1,
      catastrophic: false,
      scenario_id: `scn-${i}`,
      split: 'train' as const, // none heldout
    }))
    const warrant = deriveWarrantLevel(rows)
    expect(warrant.level).toBe('L2')
    expect(warrant.hasHeldout).toBe(false)
  })

  it('a fresh key with a thin record (2 scenarios) cannot claim L3', () => {
    const rows = [
      { passed: true, reward: 1, catastrophic: false, scenario_id: 'a', split: 'heldout' as const },
      { passed: true, reward: 1, catastrophic: false, scenario_id: 'b', split: 'train' as const },
    ]
    const warrant = deriveWarrantLevel(rows)
    expect(['L0', 'L1', 'L2']).toContain(warrant.level)
  })

  it('pins the policy version so a Warrant re-derives under the exact policy', () => {
    const r = deriveWarrantLevel(passingRows(8, 1))
    expect(r.policy_version).toBe(LICENSE_POLICY_VERSION)
  })

  it('catastrophe cap still bites even with a diverse record', () => {
    const rows = passingRows(8, 1)
    rows[3] = { passed: false, reward: -1, catastrophic: true, scenario_id: 'scn-cat', split: 'train' }
    const warrant = deriveWarrantLevel(rows)
    expect(warrant.level).toBe('L1')
  })
})
