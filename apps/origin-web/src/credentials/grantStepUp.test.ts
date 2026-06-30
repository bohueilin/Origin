import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  disableStepUp, enableStepUp, enrollStepUp, isStepUpConfigured, isStepUpRequired,
  isWebAuthnAvailable, stepUpLabel, verifyStepUp,
} from './grantStepUp'

// The unit env is plain Node — stub the browser globals the passkey gate relies on. crypto
// (getRandomValues) and btoa/atob are already global in Node 20.
const create = vi.fn()
const get = vi.fn()

beforeEach(() => {
  const store = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  })
  vi.stubGlobal('window', { location: { hostname: 'localhost' }, PublicKeyCredential: class {} })
  vi.stubGlobal('navigator', { credentials: { create, get } })
  create.mockReset()
  get.mockReset()
  // Default happy path: a passkey is created / asserted successfully.
  create.mockResolvedValue({ id: 'Y3JlZC1pZA', rawId: new Uint8Array([1, 2, 3, 4]).buffer, type: 'public-key' })
  get.mockResolvedValue({ id: 'Y3JlZC1pZA', type: 'public-key' })
})

afterEach(() => { vi.unstubAllGlobals() })

describe('grantStepUp (passkey)', () => {
  it('reports passkey support when the WebAuthn globals exist', () => {
    expect(isWebAuthnAvailable()).toBe(true)
  })

  it('is a no-op gate until a passkey is enrolled', async () => {
    expect(isStepUpConfigured()).toBe(false)
    expect(isStepUpRequired()).toBe(false)
    expect(await verifyStepUp()).toEqual({ ok: true }) // nothing to verify
    expect(get).not.toHaveBeenCalled()
  })

  it('enroll runs a Touch-ID ceremony and arms the gate', async () => {
    const r = await enrollStepUp()
    expect(r.ok).toBe(true)
    expect(create).toHaveBeenCalledOnce()
    // userVerification must be required so the prompt forces biometric/PIN
    expect(create.mock.calls[0][0].publicKey.authenticatorSelection.userVerification).toBe('required')
    expect(isStepUpConfigured()).toBe(true)
    expect(isStepUpRequired()).toBe(true)
    expect(stepUpLabel()).toBe('Origin · grant step-up')
  })

  it('verify asks for the enrolled credential and passes on a successful assertion', async () => {
    await enrollStepUp()
    const r = await verifyStepUp()
    expect(r.ok).toBe(true)
    expect(get).toHaveBeenCalledOnce()
    const opts = get.mock.calls[0][0].publicKey
    expect(opts.userVerification).toBe('required')
    expect(opts.allowCredentials).toHaveLength(1)
  })

  it('verify fails when the user cancels Touch ID', async () => {
    await enrollStepUp()
    get.mockRejectedValueOnce(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }))
    const r = await verifyStepUp()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/cancelled|timed out/i)
  })

  it('enroll failure leaves the gate unconfigured', async () => {
    create.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
    const r = await enrollStepUp()
    expect(r.ok).toBe(false)
    expect(isStepUpConfigured()).toBe(false)
  })

  it('cannot be turned off without a passkey check', async () => {
    await enrollStepUp()
    get.mockRejectedValueOnce(Object.assign(new Error('no'), { name: 'NotAllowedError' }))
    const bad = await disableStepUp()
    expect(bad.ok).toBe(false)
    expect(isStepUpRequired()).toBe(true) // still guarding

    const good = await disableStepUp() // default mock resolves
    expect(good.ok).toBe(true)
    expect(isStepUpRequired()).toBe(false) // gate off
    expect(isStepUpConfigured()).toBe(true) // credential retained for easy re-arm
  })

  it('re-arms without a ceremony (adding protection is never gated)', async () => {
    await enrollStepUp()
    await disableStepUp()
    expect(isStepUpRequired()).toBe(false)
    enableStepUp()
    expect(isStepUpRequired()).toBe(true)
  })

  it('keeps a custom passkey/1Password item label', async () => {
    await enrollStepUp('My vault · Origin step-up')
    expect(stepUpLabel()).toBe('My vault · Origin step-up')
  })
})
