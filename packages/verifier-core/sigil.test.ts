import { describe, it, expect } from 'vitest'
import { generateSigningKey, signSigil, verifySigil, keyThumbprint } from './sigil.mjs'

// A stand-in for any Origin evidence artifact a page would want to sign + share.
const RECEIPT = {
  kind: 'score_receipt',
  task_id: 'wh-007',
  reward: 1,
  passed: true,
  env_bundle_digest: 'a'.repeat(64),
  verifier_version: 'warehouse-v3',
}

describe('Sigil — shareable, browser-signed receipt (ECDSA P-256 / ES256)', () => {
  it('a freshly signed Sigil verifies (integrity + authenticity)', async () => {
    const key = await generateSigningKey()
    const sigil = await signSigil(RECEIPT, key, { issuer: 'origin', kind: 'score_receipt', signed_at: 1_700_000_000_000 })

    expect(sigil.alg).toBe('ES256')
    expect(sigil.pubkey_jwk.crv).toBe('P-256')
    expect(sigil.signature.length).toBeGreaterThan(0)

    const v = await verifySigil(sigil)
    expect(v).toMatchObject({ ok: true, code: 0 })
  })

  it('flipping one byte of the payload voids the Sigil (content-bound signature)', async () => {
    const key = await generateSigningKey()
    const sigil = await signSigil(RECEIPT, key)

    // A verifier who tampers with the shared payload but keeps the old signature.
    const forged = { ...sigil, payload: { ...sigil.payload, reward: 999 } }
    const v = await verifySigil(forged)
    expect(v).toMatchObject({ ok: false, code: 1 })
    expect(v.reason).toMatch(/altered/)
  })

  it('a corrupted signature is rejected', async () => {
    const key = await generateSigningKey()
    const sigil = await signSigil(RECEIPT, key)
    // Corrupt a byte of the base64 signature (keep length so it still decodes).
    const chars = sigil.signature.split('')
    chars[2] = chars[2] === 'A' ? 'B' : 'A'
    const v = await verifySigil({ ...sigil, signature: chars.join('') })
    expect(v.ok).toBe(false)
    expect([1, 2]).toContain(v.code) // digest still matches → signature check fails (code 2)
  })

  it('issuer pinning rejects a valid signature from an UNEXPECTED signer', async () => {
    const good = await generateSigningKey()
    const attacker = await generateSigningKey()
    const trusted = await keyThumbprint(await crypto.subtle.exportKey('jwk', good.publicKey))

    // The attacker signs the same payload with their OWN key — signature is internally valid...
    const rogue = await signSigil(RECEIPT, attacker)
    expect(await verifySigil(rogue)).toMatchObject({ ok: true, code: 0 }) // valid on its own

    // ...but pinning the trusted issuer rejects it.
    const v = await verifySigil(rogue, { expectedThumbprint: trusted })
    expect(v).toMatchObject({ ok: false, code: 3 })
  })

  it('a Sigil survives a JSON round-trip — it is portable and self-verifying offline', async () => {
    const key = await generateSigningKey()
    const sigil = await signSigil(RECEIPT, key, { issuer: 'origin' })

    // Serialize (share it) → parse it back on a machine that never saw the private key.
    const shared = JSON.parse(JSON.stringify(sigil))
    const v = await verifySigil(shared)
    expect(v).toMatchObject({ ok: true, code: 0 })
    // The verifier only needed the Sigil — the public key travels inside it.
    expect(shared.pubkey_jwk).toBeTruthy()
  })

  it('rejects a malformed Sigil without throwing', async () => {
    expect(await verifySigil(null)).toMatchObject({ ok: false, code: 4 })
    expect(await verifySigil({ payload: {}, signature: 'x' })).toMatchObject({ ok: false, code: 4 })
  })
})
