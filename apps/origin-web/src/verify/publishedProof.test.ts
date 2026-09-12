import { describe, expect, it } from 'vitest'
import publishedProof from '../../public/proof/tr-a002.json'
// detect.mjs is plain ESM without colocated types; treated as `any` here.
import { detectArtifact, verifyArtifact, tamperArtifact } from './detect.mjs'
import { makeExample } from './examples.mjs'
import { generateSigningKey, keyThumbprint, signSigil } from '@origin/verifier-core/sigil'
import type { SignedActionRunEvidence } from '@origin/verifier-core/action-run-evidence'
import { actionRunEvidenceDigest } from '@origin/evidence/action-run-evidence'

// Regression guard for the flagship published proof. The /proof page invites
// visitors to download public/proof/tr-a002.json and re-verify it on /verify;
// proof.html offers it as "the ONLY real downloadable artifact". This test runs
// the EXACT /verify logic (detect.mjs) against the SHIPPED file — not a
// freshly-minted example — so the page can never again declare the company's own
// evidence VOID. (It shipped that way once: verifyChain only accepted the
// EpisodeTrace sealing name 'episode.sealed', but TR-A002 seals with
// action 'evidence.digest_sealed'.)
const clone = () => JSON.parse(JSON.stringify(publishedProof))

describe('published TR-A002 proof through the real /verify path', () => {
  it('does not steal a legacy collision that lacks execution mode and a signed envelope', () => {
    expect(detectArtifact({
      schema_version: '1.0.0', evidence_id: 'rc-evidence-0001', issued_at: '2026-09-12T12:00:00.000Z',
      identity: {}, subject: {}, proposal: {}, authorization: {}, outcome_attestation: {}, provider_evidence: {}, completeness: {}, source: {},
      evidence_digest: 'a'.repeat(64), signature: null,
    })).toBe('unknown')
  })

  it('calls a correctly pinned not_attempted envelope VALID while exposing no execution effect', async () => {
    const evidence = await makeExample('action-run') as SignedActionRunEvidence
    const thumbprint = await keyThumbprint(evidence.signature.sigil.pubkey_jwk)
    const report = await verifyArtifact(evidence, {
      expectedThumbprints: { 'origin-browser-session': { 1: thumbprint } }, now: '2026-09-12T00:01:00.000Z',
    })

    expect(report).toMatchObject({ kind: 'action_run_evidence', verdict: 'VALID', ok: true })
    expect(report.lines).toContainEqual(expect.objectContaining({ label: 'execution_verified', text: expect.stringContaining('false') }))
  })

  it('voids a signer-authentic envelope when its authorization semantics are invalid', async () => {
    const evidence = await makeExample('action-run') as SignedActionRunEvidence
    evidence.authorization.approved_by = 'reviewer-1'
    evidence.evidence_digest = actionRunEvidenceDigest({ ...evidence })
    const pair = await generateSigningKey()
    const keyId = 'semantic-test-key'
    evidence.signature = {
      key_id: keyId,
      key_epoch: 1,
      sigil: await signSigil({
        artifact_type: 'origin.action-run-evidence', schema_version: evidence.schema_version,
        evidence_digest: evidence.evidence_digest, key_id: keyId, key_epoch: 1,
      }, pair, { issuer: 'semantic-test', kind: 'origin.action-run-evidence', signed_at: evidence.issued_at }),
    }
    const thumbprint = await keyThumbprint(evidence.signature.sigil.pubkey_jwk)
    const report = await verifyArtifact(evidence, { expectedThumbprints: { [keyId]: { 1: thumbprint } }, now: '2026-09-12T00:01:00.000Z' })

    expect(report).toMatchObject({ verdict: 'VOID', ok: false })
    expect(report.lines).toContainEqual(expect.objectContaining({ label: 'verifier note', text: expect.stringContaining('authorization: deny') }))
  })

  it('is detected as an EpisodeTrace', () => {
    expect(detectArtifact(clone())).toBe('trace')
  })

  it('verifies VALID (code 0) — the log is not tampered', async () => {
    const r = await verifyArtifact(clone())
    expect(r.verdict).toBe('VALID')
    expect(r.code).toBe(0)
    expect(r.ok).toBe(true)
  })

  it('goes VOID when any field is tampered', async () => {
    const tam = tamperArtifact('trace', clone())
    const r = await verifyArtifact(tam.value)
    expect(r.verdict).toBe('VOID')
    expect(r.ok).toBe(false)
  })

  it('goes VOID when the sealing event name is altered (the seal still binds every field)', async () => {
    const trace = clone()
    trace.events[trace.events.length - 1].action = 'not-really-sealed'
    const r = await verifyArtifact(trace)
    expect(r.verdict).toBe('VOID')
  })
})
