import { describe, expect, it } from 'vitest'
import { buildActionRunEvidence } from '@origin/evidence/action-run-evidence'
import { generateSigningKey } from './sigil.mjs'
import { signActionRunEvidence, verifyActionRunEvidence } from './action-run-evidence.mjs'

const unsigned = buildActionRunEvidence({
  evidence_id: 'action-run-signer-fixture',
  issued_at: '2026-09-12T00:00:00.000Z',
  execution_mode: 'simulated',
  identity: { principal_id: 'agent-fixture', tenant_id: 'tenant-fixture', on_behalf_of: null },
  proposal: { proposed_effect: { action: 'refund', amount_usd: 25 }, input_digest: 'a'.repeat(64) },
  approval: { authorization: 'allow', required: false, status: 'not_required', nonce_digest: null, expires_at: null },
  outcome_attestation: { status: 'simulated', attester: 'origin', attested_at: '2026-09-12T00:00:00.000Z', statement_digest: 'b'.repeat(64) },
  provider_evidence: { provider: null, receipt_digest: null, readback_digest: null, readback_at: null },
  completeness: {
    coverage: 'complete', expected_count: 12, observed_count: 12, covered_ids_digest: 'c'.repeat(64), omissions: [], duplicates: [],
    freshness: { status: 'fresh', observed_at: '2026-09-12T00:00:00.000Z', max_age_ms: 300_000 },
  },
  source: { trace_id: 'trace-fixture-1', audit_row_digest: 'd'.repeat(64), verifier_version: 'fixture-oracle-v1', oracle_verdict_digest: 'e'.repeat(64) },
})

describe('signed Action/Run Evidence', () => {
  it('requires a pinned issuer for trusted offline verification', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(unsigned, pair, {
      keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z',
    })
    expect((await verifyActionRunEvidence(signed, {
      expectedThumbprint: signed.signature!.sigil.thumbprint,
      now: '2026-09-12T00:01:00.000Z',
    })).ok).toBe(true)
    expect((await verifyActionRunEvidence(signed, { now: '2026-09-12T00:01:00.000Z' })).dimensions.issuer_trusted).toBe(false)

    const wrongSigner = await generateSigningKey()
    const wrongThumbprint = await (await import('./sigil.mjs')).keyThumbprint(wrongSigner.publicKey)
    expect((await verifyActionRunEvidence(signed, {
      expectedThumbprint: wrongThumbprint,
      now: '2026-09-12T00:01:00.000Z',
    })).ok).toBe(false)
  })

  it('rejects signed-statement, signature, and evidence tampering without throwing on malformed input', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(unsigned, pair, {
      keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z',
    })
    const opts = { expectedThumbprint: signed.signature!.sigil.thumbprint, now: '2026-09-12T00:01:00.000Z' }
    expect((await verifyActionRunEvidence({ ...signed, evidence_id: 'tampered' }, opts)).ok).toBe(false)
    expect((await verifyActionRunEvidence({ ...signed, signature: { ...signed.signature!, key_epoch: 2 } }, opts)).ok).toBe(false)
    expect((await verifyActionRunEvidence({ ...signed, signature: { ...signed.signature!, sigil: { ...signed.signature!.sigil, signature: 'not-base64' } } }, opts)).ok).toBe(false)
    await expect(verifyActionRunEvidence({ not: 'an envelope' }, opts)).resolves.toMatchObject({ ok: false })
  })

  it('reports stale and claimed-only execution as typed non-green dimensions', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(unsigned, pair, {
      keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z',
    })
    const stale = structuredClone(signed)
    stale.completeness.freshness.status = 'stale'
    stale.completeness.freshness.max_age_ms = 1
    const staleResigned = await signActionRunEvidence(stale, pair, { keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z' })
    const staleVerdict = await verifyActionRunEvidence(staleResigned, { expectedThumbprint: staleResigned.signature!.sigil.thumbprint, now: '2026-09-12T00:01:00.000Z' })
    expect(staleVerdict.ok).toBe(false)
    expect(staleVerdict.dimensions.fresh).toBe(false)

    const claimed = structuredClone(unsigned)
    claimed.execution_mode = 'live'
    claimed.outcome_attestation = { status: 'claimed', attester: 'provider', attested_at: '2026-09-12T00:00:00.000Z', statement_digest: 'f'.repeat(64) }
    claimed.provider_evidence = { provider: 'fixture-provider', receipt_digest: '1'.repeat(64), readback_digest: null, readback_at: null }
    const signedClaimed = await signActionRunEvidence(claimed, pair, { keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: '2026-09-12T00:00:00.000Z' })
    const claimedVerdict = await verifyActionRunEvidence(signedClaimed, { expectedThumbprint: signedClaimed.signature!.sigil.thumbprint, now: '2026-09-12T00:01:00.000Z' })
    expect(claimedVerdict.ok).toBe(false)
    expect(claimedVerdict.dimensions.outcome_verified).toBe(false)
  })
})
