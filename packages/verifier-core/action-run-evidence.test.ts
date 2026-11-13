import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildActionRunEvidence } from '@origin/evidence/action-run-evidence'
import { generateSigningKey, keyThumbprint } from './sigil.mjs'
import { actionRunEvidenceDigest, signActionRunEvidence, verifyActionRunEvidence } from './action-run-evidence.mjs'

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

const DAY_MS = 24 * 60 * 60 * 1000
const ISSUED = '2026-09-12T00:00:00.000Z'
const after = (from: string, ms: number) => new Date(Date.parse(from) + ms).toISOString()
const SIGN = { keyId: 'origin-prod-1', keyEpoch: 1, issuer: 'origin', signedAt: ISSUED }
const evaluation = {
  battery: { id: 'fixture-battery', version: 'fixture-battery-v1' },
  oracle_version: 'fixture-verifier-v1',
  policy_parameters: { refundCap: 100, denyPii: true },
  decisions: [{ id: 'task-1', decision: 'allow', expected: 'allow' }, { id: 'task-2', decision: 'allow', expected: 'deny' }],
  summary: { matched: 1, total: 2, over_grants: 1, misses: 0 },
}
// The builder re-stamps the version and re-seals, so the unsigned 1.0.0 record above serves as input.
function buildCurrent(maxAgeMs: number) {
  const input = structuredClone(unsigned)
  input.completeness.freshness.max_age_ms = maxAgeMs
  return buildActionRunEvidence({ ...input, evaluation })
}
// A genuine 1.0.0 record downloaded from /reference-check before 1.1.0 existed (default support
// scenario and labels, synthetic inputs only). It declares a 24-hour window.
const legacyFixture = JSON.parse(readFileSync(new URL('../../apps/origin-web/src/verify/fixtures/action-run-1.0.0.json', import.meta.url), 'utf8'))

describe('signed Action/Run Evidence 1.1.0 and the clock', () => {
  it('verifies a 1.1.0 record under a pin', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(buildCurrent(30 * DAY_MS), pair, SIGN)
    expect(signed.schema_version).toBe('1.1.0')
    const verdict = await verifyActionRunEvidence(signed, { ...pins('origin-prod-1', 1, signed.signature.sigil.thumbprint), simulatedMaxAgeCapMs: 30 * DAY_MS })
    expect(verdict).toMatchObject({ ok: true, clock: null })
  })

  it('fails the signature when a 1.1.0 record is relabelled 1.0.0 without its evaluation block', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(buildCurrent(30 * DAY_MS), pair, SIGN)
    const relabelled: Record<string, unknown> = { ...signed, schema_version: '1.0.0' }
    delete relabelled.evaluation
    relabelled.evidence_digest = actionRunEvidenceDigest(relabelled)
    const opts = pins('origin-prod-1', 1, signed.signature.sigil.thumbprint)
    const verdict = await verifyActionRunEvidence(relabelled, opts)
    expect(verdict.ok).toBe(false)
    expect(verdict.dimensions).toMatchObject({ structure: true, integrity: true, statement_bound: false, signature_valid: false })

    // Rewriting the signed statement to match does not help: the Sigil no longer verifies.
    const sigil = signed.signature.sigil
    const rewritten = { ...relabelled, signature: { ...signed.signature, sigil: { ...sigil, payload: { ...sigil.payload as object, schema_version: '1.0.0', evidence_digest: relabelled.evidence_digest } } } }
    const rewrittenVerdict = await verifyActionRunEvidence(rewritten, opts)
    expect(rewrittenVerdict.ok).toBe(false)
    expect(rewrittenVerdict.dimensions).toMatchObject({ statement_bound: true, signature_valid: false })
  })

  it('checks the signature of a stale record and keeps it not fresh', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(buildCurrent(30 * DAY_MS), pair, SIGN)
    const opts = { ...pins('origin-prod-1', 1, signed.signature.sigil.thumbprint), now: after(ISSUED, 31 * DAY_MS) }
    const stale = await verifyActionRunEvidence(signed, opts)
    expect(stale).toMatchObject({ ok: false, clock: 'stale' })
    expect(stale.dimensions).toMatchObject({ structure: true, semantics: true, integrity: true, statement_bound: true, signature_valid: true, issuer_trusted: true, fresh: false })

    const corrupted = { ...signed, signature: { ...signed.signature, sigil: { ...signed.signature.sigil, signature: 'not-base64' } } }
    const corruptedVerdict = await verifyActionRunEvidence(corrupted, opts)
    expect(corruptedVerdict).toMatchObject({ ok: false, clock: 'stale' })
    expect(corruptedVerdict.dimensions).toMatchObject({ structure: true, integrity: true, signature_valid: false, fresh: false })
  })

  it('checks the signature of a future-dated record and keeps it not fresh', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(buildCurrent(30 * DAY_MS), pair, SIGN)
    const verdict = await verifyActionRunEvidence(signed, { ...pins('origin-prod-1', 1, signed.signature.sigil.thumbprint), now: after(ISSUED, -10 * 60 * 1000) })
    expect(verdict).toMatchObject({ ok: false, clock: 'future' })
    expect(verdict.dimensions).toMatchObject({ structure: true, semantics: true, signature_valid: true, fresh: false })
  })

  it('caps the window a simulated record declares when the caller passes the cap', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(buildCurrent(3650 * DAY_MS), pair, SIGN)
    const opts = { ...pins('origin-prod-1', 1, signed.signature.sigil.thumbprint), now: after(ISSUED, 31 * DAY_MS) }
    expect((await verifyActionRunEvidence(signed, opts)).ok).toBe(true)
    const capped = await verifyActionRunEvidence(signed, { ...opts, simulatedMaxAgeCapMs: 30 * DAY_MS })
    expect(capped).toMatchObject({ ok: false, clock: 'over_cap' })
    expect(capped.dimensions).toMatchObject({ structure: true, semantics: true, signature_valid: true, fresh: false })
  })

  it('stops before the signature check on a malformed freshness field', async () => {
    const pair = await generateSigningKey()
    const signed = await signActionRunEvidence(buildCurrent(30 * DAY_MS), pair, SIGN)
    const malformed = structuredClone(signed) as typeof signed
    malformed.completeness.freshness.max_age_ms = 0
    malformed.evidence_digest = actionRunEvidenceDigest(malformed as unknown as Record<string, unknown>)
    const verdict = await verifyActionRunEvidence(malformed, { ...pins('origin-prod-1', 1, signed.signature.sigil.thumbprint), now: after(ISSUED, 60_000) })
    expect(verdict).toMatchObject({ ok: false, clock: null })
    expect(verdict.dimensions).toMatchObject({ structure: false, statement_bound: false, signature_valid: false })
    expect(verdict.failures.some((failure) => failure.startsWith('signature'))).toBe(false)
  })

  it('verifies the 1.0.0 fixture inside its 24-hour window and voids it on the clock alone after', async () => {
    expect(legacyFixture.schema_version).toBe('1.0.0')
    expect(legacyFixture.completeness.freshness.max_age_ms).toBe(DAY_MS)
    const issued = legacyFixture.issued_at
    const inside = await verifyActionRunEvidence(legacyFixture, { now: after(issued, 60_000), simulatedMaxAgeCapMs: 30 * DAY_MS })
    expect(inside).toMatchObject({ ok: false, clock: null })
    expect(inside.dimensions).toMatchObject({ structure: true, integrity: true, statement_bound: true, signature_valid: true, issuer_trusted: false, complete: true, fresh: true })

    const outside = await verifyActionRunEvidence(legacyFixture, { now: after(issued, DAY_MS + 60_000), simulatedMaxAgeCapMs: 30 * DAY_MS })
    expect(outside).toMatchObject({ ok: false, clock: 'stale' })
    expect(outside.dimensions).toMatchObject({ structure: true, semantics: true, integrity: true, statement_bound: true, signature_valid: true, fresh: false })
  })
})
