import { describe, expect, it } from 'vitest'
import { signEpisode, verifyEpisode, type EpisodePayload } from './episodeToken.ts'

const SECRET = 'test-secret'

function payload(): EpisodePayload {
  return {
    runId: 'run_1',
    agentId: 'agent_1',
    scenarioId: 'com-1',
    policySource: 'external',
    iat: 1750000000000,
    nonce: 'fixed-nonce',
  }
}

describe('episode token', () => {
  it('round-trips a payload through sign + verify', () => {
    const token = signEpisode(payload(), SECRET)
    expect(verifyEpisode(token, SECRET)).toEqual(payload())
  })

  it('round-trips a trusted reference policySource', () => {
    const trusted: EpisodePayload = { ...payload(), agentId: 'nebius-reference', policySource: 'nebius' }
    expect(verifyEpisode(signEpisode(trusted, SECRET), SECRET)).toEqual(trusted)
  })

  it('defaults a pre-provenance token (missing policySource) to external', () => {
    // Older signed payload without policySource: still a valid signature, but it
    // must never carry trusted reference attribution.
    const legacy = { runId: 'run_1', agentId: 'x', scenarioId: 'com-1', iat: 1, nonce: 'n' }
    const token = signEpisode(legacy as EpisodePayload, SECRET)
    expect(verifyEpisode(token, SECRET)?.policySource).toBe('external')
  })

  it('rejects a token whose body was tampered with', () => {
    const token = signEpisode(payload(), SECRET)
    const [body, sig] = token.split('.')
    const tamperedBody = (body[0] === 'A' ? 'B' : 'A') + body.slice(1)
    expect(verifyEpisode(`${tamperedBody}.${sig}`, SECRET)).toBeNull()
  })

  it('rejects a token whose signature was tampered with', () => {
    const token = signEpisode(payload(), SECRET)
    const [body, sig] = token.split('.')
    const tamperedSig = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1)
    expect(verifyEpisode(`${body}.${tamperedSig}`, SECRET)).toBeNull()
  })

  it('rejects the wrong secret', () => {
    const token = signEpisode(payload(), SECRET)
    expect(verifyEpisode(token, 'other-secret')).toBeNull()
  })

  it('rejects malformed tokens', () => {
    expect(verifyEpisode('', SECRET)).toBeNull()
    expect(verifyEpisode('no-dot-here', SECRET)).toBeNull()
    expect(verifyEpisode('.onlysig', SECRET)).toBeNull()
  })
})
