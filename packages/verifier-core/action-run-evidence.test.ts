import { describe, expect, it } from 'vitest'
import { buildActionRunEvidence } from '@origin/evidence/action-run-evidence'
import { generateSigningKey, keyThumbprint } from './sigil.mjs'
import { signActionRunEvidence, verifyActionRunEvidence } from './action-run-evidence.mjs'

const unsigned = buildActionRunEvidence({
  evidence_id: 'action-run-signer-fixture',
  issued_at: '2026-09-12T00:00:00.000Z',
  execution_mode: 'simulated',
  identity: { principal_id: 'agent-fixture', tenant_id: 'tenant-fixture', workload_id: 'janus-gym', on_behalf_of: null },
  subject: {
    run_id: 'run-fixture-1', action_id: 'action-fixture-1', model_digest: '0'.repeat(64), tools_digest: '1'.repeat(64),
    policy_digest: '2'.repeat(64), environment_digest: '3'.repeat(64), evaluator_version: 'fixture-evaluator-v1',
    verifier_version: 'fixture-verifier-v1', adapter_version: 'fixture-adapter-v1',
  },
  proposal: { action_type: 'refund', proposed_effect: { action: 'refund', amount_usd: 25 }, input_digest: 'a'.repeat(64) },
  authorization: { verdict: 'allow', reason_codes: ['fixture-policy-allow'], approval_id: null, approved_by: null, nonce_digest: null, expires_at: null },
  outcome_attestation: { status: 'simulated', attester: 'origin', attested_at: '2026-09-12T00:00:00.000Z', statement_digest: 'b'.repeat(64) },
  provider_evidence: { provider: null, receipt_digest: null, readback_digest: null, readback_at: null },
  completeness: {
    coverage: 'complete', expected_count: 12, observed_count: 12, covered_ids_digest: 'c'.repeat(64), omissions: [], duplicates: [],
    freshness: { status: 'fresh', observed_at: '2026-09-12T00:00:00.000Z', max_age_ms: 300_000 },
  },
  source: { trace_id: 'trace-fixture-1', audit_row_digest: 'd'.repeat(64), oracle_verdict_digest: 'e'.repeat(64) },
})

function pins(keyId: string, epoch: number, thumbprint: string) {
  return { expectedThumbprints: { [keyId]: { [epoch]: thumbprint } }, now: '2026-09-12T00:01:00.000Z' }
}

describe('signed Action/Run Evidence', () => {
  it('binds trusted provenance to key ID, epoch, and thumbprint', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(unsigned, pair, {
      keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z',
    })
    expect((await verifyActionRunEvidence(signed, pins('origin-prod-1', 1, signed.signature!.sigil.thumbprint))).ok).toBe(true)
    expect((await verifyActionRunEvidence(signed, { now: '2026-09-12T00:01:00.000Z' })).dimensions.issuer_trusted).toBe(false)
    expect((await verifyActionRunEvidence(signed, {
      expectedThumbprints: { 'wrong-key-id': { 1: signed.signature!.sigil.thumbprint } }, now: '2026-09-12T00:01:00.000Z',
    })).dimensions.issuer_trusted).toBe(false)
    expect((await verifyActionRunEvidence(signed, {
      expectedThumbprints: { 'origin-prod-1': { 2: signed.signature!.sigil.thumbprint } }, now: '2026-09-12T00:01:00.000Z',
    })).dimensions.issuer_trusted).toBe(false)

    const wrongSigner = await generateSigningKey()
    const wrongThumbprint = await keyThumbprint(await crypto.subtle.exportKey('jwk', wrongSigner.publicKey))
    expect((await verifyActionRunEvidence(signed, pins('origin-prod-1', 1, wrongThumbprint))).ok).toBe(false)

    const rotated = await generateSigningKey()
    const epochTwo = await signActionRunEvidence(unsigned, rotated, { keyId: 'origin-prod-1', keyEpoch: 2, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z' })
    expect((await verifyActionRunEvidence(epochTwo, {
      expectedThumbprints: { 'origin-prod-1': { 1: signed.signature!.sigil.thumbprint, 2: epochTwo.signature!.sigil.thumbprint } },
      now: '2026-09-12T00:01:00.000Z',
    })).ok).toBe(true)
  })

  it('rejects signed-statement, signature, and evidence tampering without throwing on malformed input', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(unsigned, pair, { keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z' })
    const opts = pins('origin-prod-1', 1, signed.signature!.sigil.thumbprint)
    expect((await verifyActionRunEvidence({ ...signed, evidence_id: 'tampered' }, opts)).ok).toBe(false)
    expect((await verifyActionRunEvidence({ ...signed, signature: { ...signed.signature!, key_epoch: 2 } }, opts)).ok).toBe(false)
    expect((await verifyActionRunEvidence({ ...signed, signature: { ...signed.signature!, sigil: { ...signed.signature!.sigil, signature: 'not-base64' } } }, opts)).ok).toBe(false)
    await expect(verifyActionRunEvidence({ not: 'an envelope' }, opts)).resolves.toMatchObject({ ok: false })
  })

  it('keeps simulated outcomes non-execution-verified and claimed outcomes non-green', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(unsigned, pair, { keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z' })
    const simulated = await verifyActionRunEvidence(signed, pins('origin-prod-1', 1, signed.signature!.sigil.thumbprint))
    expect(simulated.ok).toBe(true)
    expect(simulated.dimensions.outcome_consistent).toBe(true)
    expect(simulated.dimensions.execution_verified).toBe(false)
    expect(simulated.dimensions.provider_bound).toBe(true)

    const claimed = structuredClone(unsigned)
    claimed.execution_mode = 'live'
    claimed.outcome_attestation = { status: 'claimed', attester: 'origin', attested_at: '2026-09-12T00:00:00.000Z', statement_digest: 'f'.repeat(64) }
    claimed.provider_evidence = { provider: null, receipt_digest: null, readback_digest: null, readback_at: null }
    const signedClaimed = await signActionRunEvidence(buildActionRunEvidence(claimed), pair, { keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z' })
    const claimedVerdict = await verifyActionRunEvidence(signedClaimed, pins('origin-prod-1', 1, signedClaimed.signature!.sigil.thumbprint))
    expect(claimedVerdict.ok).toBe(false)
    expect(claimedVerdict.dimensions.execution_verified).toBe(false)
    expect(claimedVerdict.dimensions.provider_bound).toBe(true)
  })

  it('reports stale evidence as non-green', async () => {
    const pair = await generateSigningKey()
    const stale = structuredClone(unsigned)
    stale.completeness.freshness.status = 'stale'
    stale.completeness.freshness.max_age_ms = 1
    const staleResigned = await signActionRunEvidence(buildActionRunEvidence(stale), pair, { keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z' })
    const staleVerdict = await verifyActionRunEvidence(staleResigned, pins('origin-prod-1', 1, staleResigned.signature!.sigil.thumbprint))
    expect(staleVerdict.ok).toBe(false)
    expect(staleVerdict.dimensions.fresh).toBe(false)
  })

  it('refuses to silently reseal stale-digest or already-signed input', async () => {
    const pair = await generateSigningKey()
    const tampered = { ...unsigned, proposal: { ...unsigned.proposal, input_digest: '9'.repeat(64) } }
    await expect(signActionRunEvidence(tampered, pair, { keyId: 'origin-prod-1', keyEpoch: 1 })).rejects.toThrow(/evidence_digest/)
    const signed = await signActionRunEvidence(unsigned, pair, { keyId: 'origin-prod-1', keyEpoch: 1 })
    await expect(signActionRunEvidence(signed, pair, { keyId: 'origin-prod-1', keyEpoch: 1 })).rejects.toThrow(/unsigned/)
  })
})
