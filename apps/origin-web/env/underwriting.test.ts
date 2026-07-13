import { describe, it, expect } from 'vitest'
import {
  issueIamReferenceCheck,
  oraclePolicy,
  allowAllPolicy,
  IAM_VERSIONS,
} from '@origin/verifier-core/iamGym'
// @ts-expect-error — .mjs without colocated app types
import { underwriteCredential, verifyUnderwriting, riskScore, riskBand } from '@origin/verifier-core/underwriting'
import { computeLicenseFromVerdicts } from '../src/license'

// The deterministic underwriting signal: a reproducible, tamper-evident risk input an
// insurer prices agent-liability on — re-derivable from the credential ALONE.
const computeLevel = (v: Parameters<typeof computeLicenseFromVerdicts>[0]) => computeLicenseFromVerdicts(v).level.id
const agentConfig = { model: 'm', tools: ['t'], context: 'c', harness: 'h' }
const mint = (policyFor: (t: unknown) => string) =>
  issueIamReferenceCheck({ agentConfig, policyFor: policyFor as never, computeLevel, issuedAt: null }).credential

describe('deterministic underwriting signal', () => {
  it('a least-privilege agent scores lower risk than an over-granting one', () => {
    const good = underwriteCredential(mint(oraclePolicy as never))
    const bad = underwriteCredential(mint(allowAllPolicy as never))
    expect(good.risk_score).toBeLessThan(bad.risk_score)
    // the over-granting agent's RSL is capped (catastrophic) → the catastrophic signal fires
    expect(bad.factors.catastrophic_signal).toBe(true)
    expect(good.factors.catastrophic_signal).toBe(false)
  })

  it('is deterministic — same credential yields the same score + band', () => {
    const c = mint(oraclePolicy as never)
    const a = underwriteCredential(c)
    const b = underwriteCredential(c)
    expect(a.risk_score).toBe(b.risk_score)
    expect(a.risk_band).toBe(b.risk_band)
  })

  it('re-verifies from the credential alone (insurer trusts no one); tamper is caught', () => {
    const c = mint(oraclePolicy as never)
    const signal = underwriteCredential(c)
    expect(verifyUnderwriting(signal, c).code).toBe(0)
    // tamper the score → VOID (code 3)
    expect(verifyUnderwriting({ ...signal, risk_score: signal.risk_score - 100 }, c).code).toBe(3)
    // a signal from a different credential → mismatch (code 5)
    const other = mint(allowAllPolicy as never)
    expect(verifyUnderwriting(signal, other).code).toBe(5)
  })

  it('score is monotone: worse RSL and lower pass rate raise the score, lift lowers it', () => {
    expect(riskScore({ rsl_level: 'L4', pass_rate: 1, lift: 0 } as never)).toBeLessThan(
      riskScore({ rsl_level: 'L1', pass_rate: 1, lift: 0 } as never),
    )
    expect(riskScore({ rsl_level: 'L2', pass_rate: 1, lift: 0 } as never)).toBeLessThan(
      riskScore({ rsl_level: 'L2', pass_rate: 0.5, lift: 0 } as never),
    )
    expect(riskScore({ rsl_level: 'L2', pass_rate: 1, lift: 0.5 } as never)).toBeLessThan(
      riskScore({ rsl_level: 'L2', pass_rate: 1, lift: 0 } as never),
    )
  })

  it('bands map score ranges A(best) .. E(worst)', () => {
    expect(riskBand(0)).toBe('A')
    expect(riskBand(1000)).toBe('E')
    expect(riskBand(400)).toBe('C')
  })
})

// keep the IAM_VERSIONS import referenced (documents which env the signal is bound to)
void IAM_VERSIONS
