// Contract for the security-overview summary.
//
// WHY THIS FILE EXISTS. The Overview tab computed its headline and counters straight from
// five reads that each returned [] on failure. A total load failure was therefore
// indistinguishable from a brand-new account, and the panel confidently announced "No
// agent can act on your behalf yet" over 0/0/0 counters — the worst possible lie for a
// security console, because the reassuring reading is the one a failure produces.
//
// The rule these tests pin: a number is only shown when it was actually read. Anything
// unknown is `null` (rendered as "—"), and no reassuring headline may appear while any
// read is unanswered.

import { describe, expect, test } from 'vitest'
import { summarizePosture, auditTone, type PostureReads } from './accountPosture'
import { readFail, readOk } from '../readResult'
import type { CredentialGrant } from '../credentials/types'
import type { ApprovalRequest, AuditRow, SessionKey, WalletConnection } from '../credentials/store'

const NOW = Date.parse('2026-08-03T12:00:00Z')
const HOUR = 3_600_000

const grant = (over: Partial<CredentialGrant> = {}): CredentialGrant => ({
  id: 'g1', userId: 'u1', orgId: null, agentId: 'bot', runId: null, provider: 'onepassword',
  targetService: 'Acme', targetDomain: 'api.acme.com', vaultRef: null, itemRef: null,
  scope: 'api_read', approvalPolicy: 'auto_low_risk', expiresAt: NOW + 24 * HOUR,
  usageLimit: 0, usageCount: 0, status: 'active', createdAt: NOW - HOUR, revokedAt: null,
  trifectaPrivateData: false, trifectaUntrustedContent: false, trifectaExternalComms: false, ...over,
})
const approval = (over: Partial<ApprovalRequest> = {}): ApprovalRequest => ({
  id: 'ap1', grantId: null, agentId: 'bot', scope: 'website_login', targetDomain: 'acme.com',
  action: 'log in', reason: null, status: 'pending', createdAt: NOW - HOUR, expiresAt: NOW + HOUR, ...over,
})
const wallet = (over: Partial<WalletConnection> = {}): WalletConnection => ({
  id: 'w1', address: '0xabc', network: 'base', provider: 'manual', status: 'active',
  verifiedAt: NOW - HOUR, chainId: 8453, createdAt: NOW - HOUR, revokedAt: null, ...over,
})
const key = (over: Partial<SessionKey> = {}): SessionKey => ({
  id: 'sk1', walletConnectionId: 'w1', agentId: 'bot', chainId: 8453, asset: 'ETH', decimals: 18,
  maxPerTx: '0.1', maxPerWindow: '0.25', windowSeconds: 86_400, allowlist: [],
  expiresAt: NOW + 24 * HOUR, status: 'active', createdAt: NOW - HOUR, ...over,
})
const audit = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: 'a1', actorType: 'agent', actorId: 'bot', eventType: 'credential_request_denied',
  targetType: null, targetId: null, metadata: {}, createdAt: NOW - HOUR, ...over,
})

/** Every read answered, with whatever rows the case needs. */
function loaded(over: Partial<PostureReads> = {}): PostureReads {
  return {
    grants: readOk([]), approvals: readOk([]), wallets: readOk([]), keys: readOk([]), audit: readOk([]),
    ...over,
  }
}

const PENDING = 'Loading'
const REASSURING = ['No agent can act on your behalf yet', 'Your agents are operating within the limits you set']

describe('summarizePosture', () => {
  test('is loading until the reads answer', () => {
    const p = summarizePosture({ grants: null, approvals: null, wallets: null, keys: null, audit: null }, NOW)
    expect(p.loading).toBe(true)
    expect(p.error).toBeNull()
    expect(p.activeGrants).toBeNull()
    expect(p.pending).toBeNull()
    expect(p.refused24).toBeNull()
    expect(REASSURING).not.toContain(p.headline)
  })

  test('an account that really is empty says so', () => {
    const p = summarizePosture(loaded(), NOW)
    expect(p.loading).toBe(false)
    expect(p.error).toBeNull()
    expect(p.headline).toBe('No agent can act on your behalf yet')
    expect(p.tone).toBe('flat')
    expect([p.activeGrants, p.pending, p.verifiedWallets, p.activeKeys, p.refused24]).toEqual([0, 0, 0, 0, 0])
  })

  test('A FAILED LOAD IS NEVER REPORTED AS AN EMPTY ACCOUNT', () => {
    // The regression this whole change exists for. Every read fails; the panel must say
    // it could not read, show "—" (null) for every counter, and never claim the account
    // has no agent authority.
    const failure = readFail<never>('Couldn’t load agent permissions — JWT expired')
    const p = summarizePosture({ grants: failure, approvals: failure, wallets: failure, keys: failure, audit: failure }, NOW)
    expect(p.loading).toBe(false)
    expect(p.error).toContain('JWT expired')
    expect(p.tone).toBe('stop')
    expect(REASSURING).not.toContain(p.headline)
    expect(p.headline).not.toContain(PENDING)
    expect([p.activeGrants, p.pending, p.verifiedWallets, p.activeKeys, p.refused24]).toEqual([null, null, null, null, null])
  })

  test('a partial failure keeps the numbers it did read and blanks the ones it did not', () => {
    const p = summarizePosture(loaded({
      grants: readOk([grant()]),
      audit: readFail('Couldn’t load the audit log — timeout'),
    }), NOW)
    expect(p.activeGrants).toBe(1)
    expect(p.refused24).toBeNull()
    expect(p.error).toContain('audit log')
    // One unread section is enough to disqualify "everything is fine".
    expect(REASSURING).not.toContain(p.headline)
    expect(p.tone).toBe('stop')
  })

  test('reports live agent authority when every read answered', () => {
    const p = summarizePosture(loaded({ grants: readOk([grant(), grant({ id: 'g2' })]) }), NOW)
    expect(p.activeGrants).toBe(2)
    expect(p.headline).toBe('Your agents are operating within the limits you set')
    expect(p.tone).toBe('go')
  })

  test('pending approvals lead the headline, counted and pluralized', () => {
    const one = summarizePosture(loaded({ grants: readOk([grant()]), approvals: readOk([approval()]) }), NOW)
    expect(one.pending).toBe(1)
    expect(one.headline).toBe('1 action needs your approval')
    expect(one.tone).toBe('wait')

    const two = summarizePosture(loaded({ approvals: readOk([approval(), approval({ id: 'ap2' })]) }), NOW)
    expect(two.headline).toBe('2 actions need your approval')
  })

  test('decided and expired approvals are not pending', () => {
    const p = summarizePosture(loaded({
      approvals: readOk([approval({ id: 'a', status: 'approved' }), approval({ id: 'b', expiresAt: NOW - 1 })]),
    }), NOW)
    expect(p.pending).toBe(0)
  })

  test('a revoked or expired grant is not active authority', () => {
    const p = summarizePosture(loaded({
      grants: readOk([grant({ id: 'a', status: 'revoked' }), grant({ id: 'b', expiresAt: NOW - 1 }), grant({ id: 'c' })]),
    }), NOW)
    expect(p.activeGrants).toBe(1)
  })

  test('only proven-owned, unrevoked wallets count as verified', () => {
    const p = summarizePosture(loaded({
      wallets: readOk([wallet(), wallet({ id: 'b', verifiedAt: null }), wallet({ id: 'c', status: 'revoked' })]),
    }), NOW)
    expect(p.verifiedWallets).toBe(1)
  })

  test('only unexpired, unrevoked session keys count', () => {
    const p = summarizePosture(loaded({
      keys: readOk([key(), key({ id: 'b', status: 'revoked' }), key({ id: 'c', expiresAt: NOW - 1 })]),
    }), NOW)
    expect(p.activeKeys).toBe(1)
  })

  test('refusals are counted over the last 24 hours only', () => {
    const p = summarizePosture(loaded({
      audit: readOk([
        audit({ id: 'a' }),
        audit({ id: 'b', eventType: 'grant_revoked', createdAt: NOW - 2 * HOUR }),
        audit({ id: 'c', eventType: 'credential_request_denied', createdAt: NOW - 30 * HOUR }),
        audit({ id: 'd', eventType: 'grant_created' }),
      ]),
    }), NOW)
    expect(p.refused24).toBe(2)
  })
})

describe('auditTone', () => {
  test('maps events onto the finish / escalate / refuse triad', () => {
    expect(auditTone('credential_request_denied')).toBe('stop')
    expect(auditTone('wallet_action_refused_by_policy')).toBe('stop')
    expect(auditTone('grant_revoked')).toBe('stop')
    expect(auditTone('credential_request_approval_required')).toBe('wait')
    expect(auditTone('grant_created')).toBe('go')
    expect(auditTone('something_else')).toBe('flat')
  })
})
