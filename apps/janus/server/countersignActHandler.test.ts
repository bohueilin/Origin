import { describe, it, expect, beforeEach } from 'vitest'
import { createApp } from './app.ts'
import { loadConfig } from './config.ts'
import { _resetIssuer, getIssuer } from './countersignIssuer.ts'
import { buildActPop } from './countersignActHandler.ts'
import { verifyWarrant } from '@origin/verifier-core/warrant'
import { verifyPayload } from '@origin/verifier-core/countersign-identity'

// A same-origin header set so the walletOriginOk CSRF guard admits the request.
const ORIGIN = 'http://localhost:5173'
function post(app: ReturnType<typeof createApp>, path: string, body: unknown) {
  return app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN }, body: JSON.stringify(body) })
}

describe('Countersign act handler — the enforcement route (flaw #1: useLease is now on a real path)', () => {
  let app: ReturnType<typeof createApp>
  beforeEach(() => {
    _resetIssuer()
    app = createApp(loadConfig(process.cwd()))
  })

  async function enroll(): Promise<{ thumbprint: string; publicJwk: unknown; privateJwk: unknown }> {
    const res = await post(app, '/api/janus/countersign/enroll', { demo: true })
    const j = (await res.json()) as { thumbprint: string; public_jwk: unknown; private_jwk: unknown }
    return { thumbprint: j.thumbprint, publicJwk: j.public_jwk, privateJwk: j.private_jwk }
  }

  it('manifest exposes the issuer key + scope-policy digest for pinning', async () => {
    const res = await app.request('/api/janus/countersign/manifest')
    const j = (await res.json()) as { ok: boolean; issuer: { thumbprint: string }; capability_manifest_digest: string }
    expect(j.ok).toBe(true)
    expect(j.issuer.thumbprint).toHaveLength(64)
    expect(j.capability_manifest_digest).toHaveLength(64)
  })

  it('enroll → earn L4: the minted Warrant re-derives to L4 under the pinned issuer key', async () => {
    const agent = await enroll()
    const earn = await post(app, '/api/janus/countersign/earn', { thumbprint: agent.thumbprint, battery: 'l4' })
    const { warrant, level } = (await earn.json()) as { warrant: Parameters<typeof verifyWarrant>[0]; level: string }
    expect(level).toBe('L4')
    const issuer = getIssuer()
    const v = verifyWarrant(warrant, { issuerPublicJwk: issuer.publicJwk, expectedIssuerThumbprint: issuer.thumbprint })
    expect(v.ok).toBe(true)
    expect(v.level).toBe('L4')
  })

  it('ALLOW path: gate passes, secret is brokered (never in agent context), receipt is issuer-signed', async () => {
    const agent = await enroll()
    const earn = await post(app, '/api/janus/countersign/earn', { thumbprint: agent.thumbprint, battery: 'l4' })
    const { warrant } = (await earn.json()) as { warrant: { warrant_digest: string } }
    const { challenge, signature } = buildActPop({
      agentThumbprint: agent.thumbprint,
      capability: 'calendar.read',
      itemRef: 'op://Personal/luma-account',
      warrantDigest: warrant.warrant_digest,
      nonce: 'nonce-allow-1',
      iat: Date.now(),
      privateJwk: agent.privateJwk as never,
    })
    const res = await post(app, '/api/janus/countersign/act', {
      agent_public_jwk: agent.publicJwk,
      pop_challenge: challenge,
      pop_signature: signature,
      warrant,
      capability: 'calendar.read',
      item_ref: 'op://Personal/luma-account',
    })
    const j = (await res.json()) as { ok: boolean; decision: string; secret_in_agent_context: boolean; receipt: Record<string, unknown> }
    expect(j.ok).toBe(true)
    expect(j.decision).toBe('allow')
    expect(j.secret_in_agent_context).toBe(false)
    // the receipt is signed by the ISSUER (the gate), not the agent — independently checkable
    const issuer = getIssuer()
    expect(verifyPayload({ payload_digest: j.receipt.payload_digest }, j.receipt.signature as string, issuer.publicJwk)).toBe(true)
  })

  it('DENY (WRONG_HOLDER): a stolen Warrant presented by another key is refused, secret never fetched', async () => {
    const owner = await enroll()
    const earn = await post(app, '/api/janus/countersign/earn', { thumbprint: owner.thumbprint, battery: 'l4' })
    const { warrant } = (await earn.json()) as { warrant: { warrant_digest: string } }
    const thief = await enroll()
    // thief signs a valid PoP with ITS key but presents the owner's warrant
    const { challenge, signature } = buildActPop({
      agentThumbprint: thief.thumbprint,
      capability: 'calendar.read',
      itemRef: 'op://Personal/luma-account',
      warrantDigest: warrant.warrant_digest,
      nonce: 'nonce-thief-1',
      iat: Date.now(),
      privateJwk: thief.privateJwk as never,
    })
    const res = await post(app, '/api/janus/countersign/act', {
      agent_public_jwk: thief.publicJwk,
      pop_challenge: challenge,
      pop_signature: signature,
      warrant,
      capability: 'calendar.read',
      item_ref: 'op://Personal/luma-account',
    })
    const j = (await res.json()) as { ok: boolean; decision: string; code: string; secret_fetched: boolean }
    expect(j.ok).toBe(false)
    expect(j.decision).toBe('deny')
    expect(j.code).toBe('WRONG_HOLDER')
    expect(j.secret_fetched).toBe(false)
  })

  it('DENY (NONCE_REPLAY): the same PoP replayed is refused the second time', async () => {
    const agent = await enroll()
    const earn = await post(app, '/api/janus/countersign/earn', { thumbprint: agent.thumbprint, battery: 'l4' })
    const { warrant } = (await earn.json()) as { warrant: { warrant_digest: string } }
    const pop = buildActPop({
      agentThumbprint: agent.thumbprint,
      capability: 'calendar.read',
      itemRef: 'op://Personal/luma-account',
      warrantDigest: warrant.warrant_digest,
      nonce: 'replay-me',
      iat: Date.now(),
      privateJwk: agent.privateJwk as never,
    })
    const payload = {
      agent_public_jwk: agent.publicJwk,
      pop_challenge: pop.challenge,
      pop_signature: pop.signature,
      warrant,
      capability: 'calendar.read',
      item_ref: 'op://Personal/luma-account',
    }
    const first = await (await post(app, '/api/janus/countersign/act', payload)).json()
    const second = await (await post(app, '/api/janus/countersign/act', payload)).json()
    expect((first as { decision: string }).decision).toBe('allow')
    expect((second as { code: string }).code).toBe('NONCE_REPLAY')
  })

  it('DENY (QUARANTINED): a tainted agent is refused before the broker is touched', async () => {
    const agent = await enroll()
    const earn = await post(app, '/api/janus/countersign/earn', { thumbprint: agent.thumbprint, battery: 'l4' })
    const { warrant } = (await earn.json()) as { warrant: { warrant_digest: string } }
    await post(app, '/api/janus/countersign/taint', { thumbprint: agent.thumbprint })
    const { challenge, signature } = buildActPop({
      agentThumbprint: agent.thumbprint,
      capability: 'calendar.read',
      itemRef: 'op://Personal/luma-account',
      warrantDigest: warrant.warrant_digest,
      nonce: 'nonce-taint-1',
      iat: Date.now(),
      privateJwk: agent.privateJwk as never,
    })
    const res = await post(app, '/api/janus/countersign/act', {
      agent_public_jwk: agent.publicJwk,
      pop_challenge: challenge,
      pop_signature: signature,
      warrant,
      capability: 'calendar.read',
      item_ref: 'op://Personal/luma-account',
    })
    const j = (await res.json()) as { code: string; secret_fetched: boolean }
    expect(j.code).toBe('QUARANTINED')
    expect(j.secret_fetched).toBe(false)
  })

  it('DENY (catastrophic earn caps at L1): a capped agent cannot unlock an L3 capability', async () => {
    const agent = await enroll()
    const earn = await post(app, '/api/janus/countersign/earn', { thumbprint: agent.thumbprint, battery: 'catastrophic' })
    const { warrant, level } = (await earn.json()) as { warrant: { warrant_digest: string }; level: string }
    expect(level).toBe('L1')
    const { challenge, signature } = buildActPop({
      agentThumbprint: agent.thumbprint,
      capability: 'credential.scoped_request',
      itemRef: 'op://Personal/luma-account',
      warrantDigest: warrant.warrant_digest,
      nonce: 'nonce-cat-1',
      iat: Date.now(),
      privateJwk: agent.privateJwk as never,
    })
    const res = await post(app, '/api/janus/countersign/act', {
      agent_public_jwk: agent.publicJwk,
      pop_challenge: challenge,
      pop_signature: signature,
      warrant,
      capability: 'credential.scoped_request',
      item_ref: 'op://Personal/luma-account',
    })
    const j = (await res.json()) as { decision: string; code: string }
    expect(j.decision).toBe('deny')
    expect(j.code).toBe('OUT_OF_SCOPE')
  })
})
