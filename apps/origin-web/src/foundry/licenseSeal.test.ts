import { describe, expect, it } from 'vitest'
import { sealLicense, verifyLicense, type SealLicenseInput } from './licenseSeal'

const sampleInput: SealLicenseInput = {
  verdict: 'pass',
  oracleVersion: 'bfs-oracle/warehouse-v1',
  embodiment: 'amr',
  floor: JSON.stringify({ id: 'gym-rollout', width: 8, height: 8, start: { x: 0, y: 0 } }),
  pathLength: 14,
  reward: 1,
  issuedAt: 1_700_000_000_000,
}

describe('sealLicense / verifyLicense', () => {
  it('produces a full ReadinessLicense from a verdict input', () => {
    const license = sealLicense(sampleInput)
    expect(license.verdict).toBe('pass')
    expect(license.oracleVersion).toBe('bfs-oracle/warehouse-v1')
    expect(license.embodiment).toBe('amr')
    expect(license.pathLength).toBe(14)
    expect(license.reward).toBe(1)
    expect(license.issuedAt).toBe(1_700_000_000_000)
    // Derived fields are present and content-shaped (not random).
    expect(license.licenseId).toMatch(/^rl_[0-9a-f]{24}$/)
    expect(license.floorHash).toMatch(/^[0-9a-f]{64}$/)
    expect(license.nonce).toMatch(/^[0-9a-f]{16}$/)
    expect(license.seal).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifies a freshly sealed license', () => {
    const license = sealLicense(sampleInput)
    expect(verifyLicense(license)).toBe(true)
  })

  it('fails verification when any sealed field is tampered with', () => {
    const license = sealLicense(sampleInput)

    // Tamper the verdict — the most security-relevant field.
    expect(verifyLicense({ ...license, verdict: 'unsafe_zone' })).toBe(false)
    // Tamper a numeric field.
    expect(verifyLicense({ ...license, reward: 999 })).toBe(false)
    // Tamper the floor fingerprint.
    expect(verifyLicense({ ...license, floorHash: 'deadbeef' })).toBe(false)
    // Tamper the timestamp.
    expect(verifyLicense({ ...license, issuedAt: license.issuedAt + 1 })).toBe(false)
    // Tamper the seal itself.
    expect(verifyLicense({ ...license, seal: 'a'.repeat(64) })).toBe(false)
  })

  it('is deterministic: identical input yields an identical seal', () => {
    const a = sealLicense(sampleInput)
    const b = sealLicense({ ...sampleInput })
    expect(b).toEqual(a)
    expect(b.seal).toBe(a.seal)
    expect(b.licenseId).toBe(a.licenseId)
    expect(b.nonce).toBe(a.nonce)
  })

  it('derives distinct nonces for different verdicts on the same floor', () => {
    const pass = sealLicense(sampleInput)
    const fail = sealLicense({ ...sampleInput, verdict: 'unsafe_zone' })
    // Same floor → same floorHash, but verdict-bound nonce/seal differ.
    expect(fail.floorHash).toBe(pass.floorHash)
    expect(fail.nonce).not.toBe(pass.nonce)
    expect(fail.seal).not.toBe(pass.seal)
    expect(verifyLicense(fail)).toBe(true)
  })
})
