import { describe, expect, it } from 'vitest'
import publishedProof from '../../public/proof/tr-a002.json'
// detect.mjs is plain ESM without colocated types; treated as `any` here.
import { detectArtifact, verifyArtifact, tamperArtifact } from './detect.mjs'

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
