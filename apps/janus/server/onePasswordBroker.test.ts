import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the 1Password SDK so useLease can resolve a fake secret without a real service account.
vi.mock('@1password/sdk', () => ({
  default: {
    createClient: vi.fn(async () => ({
      secrets: { resolve: vi.fn(async (ref: string) => `RESOLVED_SECRET_for_${ref}`) },
    })),
  },
}))

import { isAvailable, leaseScopedSecret, listLeases, revokeLease, useLease, _resetLeases } from './onePasswordBroker.ts'
import type { OnePasswordConfig } from './config.ts'

// 'Passport' here = the real external 1Password vault + integration name (op://Passport/…) — deliberately NOT renamed with the app.
const cfg: OnePasswordConfig = { serviceAccountToken: 'ops_test', vault: 'Passport', integrationName: 'Passport', integrationVersion: 'v1' }
const noToken: OnePasswordConfig = { integrationName: 'Passport', integrationVersion: 'v1' }

beforeEach(() => _resetLeases())

describe('1Password access broker', () => {
  it('isAvailable reflects the service-account token', () => {
    expect(isAvailable(cfg)).toBe(true)
    expect(isAvailable(noToken)).toBe(false)
  })

  it('lease returns an opaque handle + redacted metadata — never the ref or a value', () => {
    const r = leaseScopedSecret(
      { item_ref: 'op://Passport/discord-webhook/url', capability: 'credential.scoped_request', intent_id: 'i1', grant_id: 'g1', agent_id: 'concierge' },
      cfg,
    )
    expect(r.ok).toBe(true)
    expect(r.lease!.handle).toMatch(/^jns_/)
    expect(r.lease!.item_title).toBe('discord-webhook')
    expect(r.lease!.field_labels).toEqual(['url'])
    const json = JSON.stringify(r.lease)
    expect(json).not.toContain('op://') // the ref never crosses back
    expect(json).not.toContain('RESOLVED_SECRET')
  })

  it('rejects a malformed ref and a ref outside the brokered vault', () => {
    expect(leaseScopedSecret({ item_ref: 'not-a-ref' }, cfg).code).toBe('bad_ref')
    expect(leaseScopedSecret({ item_ref: 'op://OtherVault/x/y' }, cfg).code).toBe('scope_escalation')
  })

  it('useLease resolves the secret JIT, runs the action, and never returns the value', async () => {
    const lease = leaseScopedSecret({ item_ref: 'op://Passport/discord-webhook/url', intent_id: 'i1', grant_id: 'g1' }, cfg).lease!
    let seen = ''
    const r = await useLease(lease.handle, 'op://Passport/discord-webhook/url', cfg, async (secret) => {
      seen = secret
      return { posted: true }
    })
    expect(r.ok).toBe(true)
    expect(r.result).toEqual({ posted: true })
    expect(seen).toContain('RESOLVED_SECRET') // the action boundary sees it
    expect(JSON.stringify(r)).not.toContain('RESOLVED_SECRET') // the caller never does
  })

  it('useLease rejects a wrong ref, an unknown handle, and a revoked lease (fail closed)', async () => {
    const lease = leaseScopedSecret({ item_ref: 'op://Passport/a/b', intent_id: 'i', grant_id: 'g' }, cfg).lease!
    expect((await useLease(lease.handle, 'op://Passport/other/x', cfg, async () => 1)).code).toBe('ref_mismatch')
    expect((await useLease('jns_nope', 'op://Passport/a/b', cfg, async () => 1)).code).toBe('no_lease')
    revokeLease(lease.handle)
    expect((await useLease(lease.handle, 'op://Passport/a/b', cfg, async () => 1)).code).toBe('revoked')
  })

  it('useLease fails closed with no service account (no client)', async () => {
    const lease = leaseScopedSecret({ item_ref: 'op://Passport/a/b', intent_id: 'i', grant_id: 'g' }, cfg).lease!
    expect((await useLease(lease.handle, 'op://Passport/a/b', noToken, async () => 1)).code).toBe('no_client')
  })

  it('bounded delegation: a child lease cannot exceed the parent vault / fields / TTL', () => {
    const parent = leaseScopedSecret({ item_ref: 'op://Passport/item/url', fields: ['url'], intent_id: 'i', grant_id: 'g', ttl_ms: 60_000 }, cfg).lease!
    // a field outside the parent scope is refused
    expect(
      leaseScopedSecret({ item_ref: 'op://Passport/item/password', fields: ['password'], parent_handle: parent.handle, intent_id: 'i', grant_id: 'g' }, cfg).code,
    ).toBe('scope_escalation')
    // a valid in-scope child is granted, with TTL clamped to the parent's remaining lifetime
    const child = leaseScopedSecret({ item_ref: 'op://Passport/item/url', fields: ['url'], parent_handle: parent.handle, intent_id: 'i', grant_id: 'g', ttl_ms: 999_999 }, cfg)
    expect(child.ok).toBe(true)
    expect(child.lease!.expires_at).toBeLessThanOrEqual(parent.expires_at)
  })

  it('listLeases returns redacted views (no ref/value), filtered by intent', () => {
    leaseScopedSecret({ item_ref: 'op://Passport/a/b', intent_id: 'iX', grant_id: 'g' }, cfg)
    const list = listLeases('iX')
    expect(list.length).toBe(1)
    expect(JSON.stringify(list)).not.toContain('op://')
  })
})
