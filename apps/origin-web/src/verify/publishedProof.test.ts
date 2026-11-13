import { describe, expect, it } from 'vitest'
import publishedProof from '../../public/proof/tr-a002.json'
import legacyRecord from './fixtures/action-run-1.0.0.json'
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
    const evidence = await makeExample('action-run', { issuedAt: '2026-09-12T00:00:00.000Z' }) as SignedActionRunEvidence
    const thumbprint = await keyThumbprint(evidence.signature.sigil.pubkey_jwk)
    const report = await verifyArtifact(evidence, {
      expectedThumbprints: { 'origin-browser-session': { 1: thumbprint } }, now: '2026-09-12T00:01:00.000Z',
    })

    expect(report).toMatchObject({ kind: 'action_run_evidence', verdict: 'VALID', ok: true })
    expect(report.lines).toContainEqual(expect.objectContaining({ label: 'execution_verified', text: expect.stringContaining('false') }))
  })

  it('voids a signer-authentic envelope when its authorization semantics are invalid', async () => {
    const evidence = await makeExample('action-run', { issuedAt: '2026-09-12T00:00:00.000Z' }) as SignedActionRunEvidence
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

  it('does not steal a 1.1.0 twin of that legacy collision either', () => {
    expect(detectArtifact({
      schema_version: '1.1.0', evidence_id: 'rc-evidence-0001', issued_at: '2026-09-12T12:00:00.000Z',
      identity: {}, subject: {}, proposal: {}, authorization: {}, outcome_attestation: {}, provider_evidence: {}, completeness: {}, source: {},
      evaluation: {}, evidence_digest: 'a'.repeat(64), signature: null,
    })).toBe('unknown')
  })

  it('verifies a 1.0.0 record made before the format stated its result: UNTRUSTED inside its 24-hour window', async () => {
    expect(detectArtifact(legacyRecord)).toBe('action_run_evidence')
    const report = await verifyArtifact(legacyRecord, { now: '2026-11-13T07:17:46.858Z' })
    expect(report).toMatchObject({ verdict: 'UNTRUSTED', code: null, formatScope: 'signed by the key inside the record; VALID needs a published issuer key' })
    expect(report.result).toMatchObject({ status: 'absent', text: expect.stringMatching(/^Result: not stated in this record\./) })
    expect(report.scope).toMatch(/^Intact under this verifier; no result was replayed \(this record states none\)\./)
    expect(report.lines).toContainEqual({ tone: 'ok', label: 'freshness', text: "made 2026-11-13T07:16:46.858Z; the 24-hour window ends 2026-11-14T07:16:46.858Z; checked against this device's clock" })
  })

  it('voids that 1.0.0 record for freshness only once its 24-hour window has ended', async () => {
    const report = await verifyArtifact(legacyRecord, { now: '2026-11-14T07:17:46.858Z' })
    expect(report).toMatchObject({ verdict: 'VOID', code: null, formatScope: null })
    expect(report.headline).toBe('Action/Run Evidence is void: its 24-hour freshness window ended 2026-11-14T07:16:46.858Z. The digest and signature still check.')
    expect(report.lines).toContainEqual(expect.objectContaining({ tone: 'ok', label: 'digest' }))
    expect(report.lines).toContainEqual(expect.objectContaining({ tone: 'ok', label: 'signature' }))
    expect(report.lines.filter((line) => line.tone === 'bad')).toEqual([
      { tone: 'bad', label: 'freshness', text: "the 24-hour window ended 2026-11-14T07:16:46.858Z by this device's clock" },
    ])
    expect(report.result?.status).toBe('absent')
    expect(report.scope).toBe("Do not rely on this record: the 24-hour window ended 2026-11-14T07:16:46.858Z by this device's clock. A VOID result establishes nothing about the policy, the requests or any agent.")
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

  it('voids with code 2 and one chain-break line when event 1\'s refund amount moves $480 → $481', async () => {
    const tam = tamperArtifact('trace', clone())
    expect(tam.note).toBe("changed event 1's refund amount $480 → $481 without re-sealing the chain")
    const r = await verifyArtifact(tam.value)
    expect(r).toMatchObject({ verdict: 'VOID', code: 2, formatScope: null })
    expect(r.lines.filter((line) => line.tone === 'bad')).toEqual([{ tone: 'bad', label: 'code 2', text: 'chain break — event 1 event_hash' }])
  })

  it('carries the command-line checks beyond the chain, and names the top-level fields outside it', async () => {
    const r = await verifyArtifact(clone())
    expect(r.formatScope).toBe('unsigned format: VALID means the hash chain re-derives; anyone can make one')
    expect(r.lines).toContainEqual({ tone: 'ok', label: 'artifact', text: 'artifact is TR-A002; this name sits outside the chain' })
    expect(r.lines).toContainEqual({ tone: 'ok', label: 'sandbox flag', text: 'the top-level field sandbox is true; it sits outside the chain and does not mean a sandbox ran' })
    expect(r.lines).toContainEqual({
      tone: 'info', label: 'outside the chain',
      text: 'these top-level fields are outside the chain and are not checked: type, emitted_by, label, scenario, agent, policy, risk_owner, proxy_tool, hash_spec; changing them does not break it',
    })
  })

  it('voids with no code when the top-level sandbox flag is false but the chain verifies', async () => {
    const trace = clone()
    trace.sandbox = false
    const r = await verifyArtifact(trace)
    expect(r).toMatchObject({ verdict: 'VOID', code: null, ok: false })
    expect(r.headline).toBe('TR-A002 is void: the top-level field sandbox is not true. The hash chain itself verifies.')
    // One failed line, as the command-line verifier reports "1 CHECK(S) FAILED".
    expect(r.lines.filter((line) => line.tone === 'bad')).toEqual([{ tone: 'bad', label: 'sandbox flag', text: 'the top-level field sandbox is not true' }])
  })

  it('stays VALID when label, type and agent are edited, because they sit outside the chain', async () => {
    const trace = clone()
    trace.label = 'edited label'
    trace.type = 'edited type'
    trace.agent = 'edited agent'
    const r = await verifyArtifact(trace)
    expect(r).toMatchObject({ verdict: 'VALID', code: 0 })
    const outside = r.lines.find((line) => line.label === 'outside the chain')?.text ?? ''
    for (const field of ['label', 'type', 'agent']) expect(outside).toMatch(new RegExp(`\\b${field}\\b`))
  })

  it('goes VOID when the sealing event name is altered (the seal still binds every field)', async () => {
    const trace = clone()
    trace.events[trace.events.length - 1].action = 'not-really-sealed'
    const r = await verifyArtifact(trace)
    expect(r.verdict).toBe('VOID')
  })
})
