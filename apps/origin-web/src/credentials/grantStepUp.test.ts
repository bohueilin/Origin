import { beforeEach, describe, expect, it } from 'vitest'
import {
  disableStepUp, enableStepUp, isStepUpConfigured, isStepUpRequired,
  lockRemainingMs, setupStepUp, stepUpLabel, verifyStepUp,
} from './grantStepUp'

// The unit env is plain Node — no DOM, so provide an in-memory localStorage shim. WebCrypto
// (crypto.subtle / getRandomValues) and btoa/atob are already global in Node 20.
beforeEach(() => {
  const store = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => { store.clear() },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  } as Storage
})

const PASS = 'correct horse battery staple'

describe('grantStepUp', () => {
  it('is a no-op gate until a passphrase is configured', async () => {
    expect(isStepUpConfigured()).toBe(false)
    expect(isStepUpRequired()).toBe(false)
    expect(await verifyStepUp('anything')).toEqual({ ok: true }) // nothing to pass
  })

  it('setup arms the gate and is required', async () => {
    await setupStepUp(PASS)
    expect(isStepUpConfigured()).toBe(true)
    expect(isStepUpRequired()).toBe(true)
    expect(stepUpLabel()).toBe('Origin · grant step-up')
  })

  it('accepts the right passphrase and rejects the wrong one', async () => {
    await setupStepUp(PASS)
    expect(await verifyStepUp(PASS)).toEqual({ ok: true })
    const r = await verifyStepUp('nope')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.remaining).toBe(4)
  })

  it('locks after 5 wrong attempts — and stays locked even for the correct passphrase', async () => {
    await setupStepUp(PASS)
    let last
    for (let i = 0; i < 5; i++) last = await verifyStepUp('wrong')
    expect(last && last.ok).toBe(false)
    if (last && !last.ok) expect(last.lockedMs).toBeGreaterThan(0)
    expect(lockRemainingMs()).toBeGreaterThan(0)
    const correctWhileLocked = await verifyStepUp(PASS)
    expect(correctWhileLocked.ok).toBe(false) // the lock applies to everyone, including the owner
  })

  it('a correct attempt resets the failure counter', async () => {
    await setupStepUp(PASS)
    await verifyStepUp('wrong')
    await verifyStepUp('wrong')
    expect((await verifyStepUp(PASS)).ok).toBe(true)
    const r = await verifyStepUp('wrong')
    if (!r.ok) expect(r.remaining).toBe(4) // back to a full budget
  })

  it('cannot be turned off without the passphrase', async () => {
    await setupStepUp(PASS)
    const bad = await disableStepUp('wrong')
    expect(bad.ok).toBe(false)
    expect(isStepUpRequired()).toBe(true) // still guarding

    const good = await disableStepUp(PASS)
    expect(good.ok).toBe(true)
    expect(isStepUpRequired()).toBe(false) // gate off
    expect(isStepUpConfigured()).toBe(true) // secret retained for easy re-arm
  })

  it('re-arms without a passphrase (adding protection is never gated)', async () => {
    await setupStepUp(PASS)
    await disableStepUp(PASS)
    expect(isStepUpRequired()).toBe(false)
    enableStepUp()
    expect(isStepUpRequired()).toBe(true)
  })

  it('keeps a custom 1Password item label', async () => {
    await setupStepUp(PASS, 'My vault · Origin step-up')
    expect(stepUpLabel()).toBe('My vault · Origin step-up')
  })
})
