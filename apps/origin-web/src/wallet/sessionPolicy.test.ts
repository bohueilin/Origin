import { describe, expect, it } from 'vitest'
import { describePolicy, evaluatePolicy, toSmallestUnit, type SessionKeyPolicy, type TxDraft } from './sessionPolicy'

const NOW = 1_900_000_000_000

function policy(over: Partial<SessionKeyPolicy> = {}): SessionKeyPolicy {
  return {
    status: 'active', agentId: 'travel-concierge', chainId: 8453, asset: 'ETH', decimals: 18,
    maxPerTx: '0.1', maxPerWindow: '0.25', windowSeconds: 86_400,
    allowlist: ['0xA11ce0000000000000000000000000000000C0de'], expiresAt: NOW + 86_400_000, ...over,
  }
}
function draft(over: Partial<TxDraft> = {}): TxDraft {
  return { to: '0xA11ce0000000000000000000000000000000C0de', amount: '0.05', asset: 'ETH', chainId: 8453, ...over }
}

describe('toSmallestUnit', () => {
  it('converts decimal strings to smallest units', () => {
    expect(toSmallestUnit('0.05', 18)).toBe(50_000_000_000_000_000n)
    expect(toSmallestUnit('1', 6)).toBe(1_000_000n)
    expect(toSmallestUnit('0', 18)).toBe(0n)
  })
  it('throws on garbage', () => {
    expect(() => toSmallestUnit('0x1', 18)).toThrow()
  })
})

describe('evaluatePolicy', () => {
  it('allows a compliant draft', () => {
    expect(evaluatePolicy(policy(), draft(), { now: NOW }).allowed).toBe(true)
  })
  it('denies over the per-tx cap', () => {
    const v = evaluatePolicy(policy(), draft({ amount: '0.2' }), { now: NOW })
    expect(v.allowed).toBe(false)
    expect(v.violations.join()).toMatch(/per-transaction/)
  })
  it('denies over the rolling-window cap counting prior spend', () => {
    const v = evaluatePolicy(policy(), draft({ amount: '0.1' }), { now: NOW, priorWindowSpend: '0.2' })
    expect(v.allowed).toBe(false)
    expect(v.violations.join()).toMatch(/rolling-window/)
  })
  it('denies a non-allowlisted destination', () => {
    const v = evaluatePolicy(policy(), draft({ to: '0xBADc0de00000000000000000000000000000beef' }), { now: NOW })
    expect(v.allowed).toBe(false)
    expect(v.violations.join()).toMatch(/allowlist/)
  })
  it('denies everything when the allowlist is empty (secure default)', () => {
    expect(evaluatePolicy(policy({ allowlist: [] }), draft(), { now: NOW }).allowed).toBe(false)
  })
  it('allows any destination with a wildcard allowlist', () => {
    expect(evaluatePolicy(policy({ allowlist: ['*'] }), draft({ to: '0xanything000000000000000000000000000000ff' }), { now: NOW }).allowed).toBe(true)
  })
  it('denies the wrong chain', () => {
    expect(evaluatePolicy(policy(), draft({ chainId: 1 }), { now: NOW }).allowed).toBe(false)
  })
  it('denies a disallowed asset', () => {
    expect(evaluatePolicy(policy(), draft({ asset: 'USDC' }), { now: NOW }).allowed).toBe(false)
  })
  it('denies an expired or revoked key', () => {
    expect(evaluatePolicy(policy({ expiresAt: NOW - 1 }), draft(), { now: NOW }).allowed).toBe(false)
    expect(evaluatePolicy(policy({ status: 'revoked' }), draft(), { now: NOW }).allowed).toBe(false)
  })
  it('denies a zero/negative amount', () => {
    expect(evaluatePolicy(policy(), draft({ amount: '0' }), { now: NOW }).allowed).toBe(false)
  })
  it('fails closed on an unparseable amount', () => {
    expect(evaluatePolicy(policy(), draft({ amount: 'lots' }), { now: NOW }).allowed).toBe(false)
  })
})

describe('describePolicy', () => {
  it('summarizes a policy', () => {
    expect(describePolicy(policy())).toMatch(/0\.1 ETH\/tx.*0\.25 ETH per 24h.*1 allowlisted/)
  })
})
