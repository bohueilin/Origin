import { describe, it, expect } from 'vitest'
import { certify, verify, type CertifyResponse } from './certifyApi'
import { detectArtifact, verifyArtifact } from '../verify/detect.mjs'

// The verification-substrate API a GRC platform / insurer embeds. Deterministic,
// no secrets, and every artifact re-verifies offline (the caller trusts no one).
const agent = { model: 'acme-agent-v3', tools: ['iam.decide', 'data.read'], context: 'sp@2', harness: 'h@1' }

async function ok(res: CertifyResponse | { ok: false; error: string }): Promise<CertifyResponse> {
  expect(res.ok).toBe(true)
  return res as CertifyResponse
}

describe('verification-substrate API', () => {
  it('certifies a least-privilege config: high RSL, 0 catastrophic, credential self-verifies', async () => {
    const res = await ok(await certify({ agent, policy: 'least-privilege' }))
    expect(res.catastrophic_over_grants).toBe(0)
    expect(res.self_verify_code).toBe(0)
    expect(res.credential).toBeTruthy()
    expect(res.underwriting).toBeTruthy()
    expect(res.sigil).toBeTruthy()
  })

  it('flags an over-granting (permissive) config: catastrophic > 0, RSL capped', async () => {
    const res = await ok(await certify({ agent, policy: 'permissive' }))
    expect(res.catastrophic_over_grants).toBeGreaterThan(0)
    expect(['L0', 'L1']).toContain(res.rsl_level)
  })

  it('accepts an explicit PolicySpec, not just a preset', async () => {
    const res = await ok(
      await certify({
        agent,
        policy: { honorRoleAllowlist: true, denyForbidden: true, denyTainted: true, escalateOnApproval: true, autoAllowUpTo: 'low' },
      }),
    )
    expect(res.rsl_level).toBeTruthy()
  })

  it('rejects an unknown policy', async () => {
    const res = await certify({ agent, policy: 'nonsense-preset' })
    expect(res.ok).toBe(false)
  })

  it('the returned Sigil round-trips through the public /verify (detect.mjs); tamper VOIDs', async () => {
    const res = await ok(await certify({ agent, policy: 'least-privilege' }))
    expect(detectArtifact(res.sigil)).toBe('sigil')
    const v = await verifyArtifact(res.sigil)
    expect(v.verdict).toBe('VALID')
    const bad = JSON.parse(JSON.stringify(res.sigil))
    bad.payload.rsl_level = 'L4'
    expect((await verifyArtifact(bad)).verdict).toBe('VOID')
  })

  it('verify() returns VALID for the fresh credential and VOID on config drift', async () => {
    const res = await ok(await certify({ agent, policy: 'least-privilege', sign: false }))
    expect(verify({ credential: res.credential as never }).code).toBe(0)
    const drifted = { ...agent, model: 'acme-agent-v4' }
    expect(verify({ credential: res.credential as never, liveConfig: drifted }).code).toBe(4)
  })
})
