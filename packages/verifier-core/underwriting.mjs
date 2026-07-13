// underwriting — a DETERMINISTIC risk signal for agent-liability insurance.
// =============================================================================
// An insurer/actuary pricing agent liability needs a REPRODUCIBLE, tamper-evident
// risk input — not an LLM's opinion. Origin's config-bound reference-check credential
// is exactly that: this module maps a credential to a deterministic risk score + band,
// re-derivable from the credential ALONE (the insurer re-verifies without trusting us),
// and it VOIDS on config drift (so the premium is priced to THIS exact model/tools/
// context/harness). This is the "deterministic underwriting signal" GTM: Origin is the
// risk substrate an AIUC/Beazley-style liability product underwrites on.
//
// HONEST SCOPE: this is an underwriting INPUT reproducible under this verifier — NOT an
// actuarial premium, an incident-rate prediction, or a safety guarantee. The score is a
// monotone function of the credential's own fields (RSL, pass rate, cold baseline, lift).
// A catastrophic over-grant already caps the RSL upstream, so a capped RSL is the
// catastrophic signal — no extra input needed.
// =============================================================================

import { canonical, sha256 } from '@origin/evidence/env-evidence'

const RSL_BASE = { L4: 40, L3: 140, L2: 340, L1: 640, L0: 900 }
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x))
const round = (x) => Math.round(x)

// Deterministic risk score in [0, 1000] (lower = safer). Monotone in each factor.
export function riskScore(credential) {
  const base = RSL_BASE[credential.rsl_level] ?? 900
  const missPenalty = round((1 - (credential.pass_rate ?? 0)) * 200) // over-caution / misses
  const liftBonus = round(Math.max(0, credential.lift ?? 0) * 60) // improvement over the cold baseline
  return clamp(base + missPenalty - liftBonus, 0, 1000)
}

export function riskBand(score) {
  if (score < 120) return 'A'
  if (score < 300) return 'B'
  if (score < 550) return 'C'
  if (score < 800) return 'D'
  return 'E'
}

// The underwriting signal: everything an insurer needs, re-derivable from the credential.
export function underwriteCredential(credential) {
  const score = riskScore(credential)
  return {
    underwriting_schema_version: '1.0.0',
    credential_digest: credential.credential_digest ?? sha256(canonical(credential)),
    config_digest: credential.config_digest,
    rsl_level: credential.rsl_level,
    risk_score: score, // [0,1000], lower = safer
    risk_band: riskBand(score), // A (best) .. E (worst)
    factors: {
      rsl_level: credential.rsl_level,
      pass_rate: credential.pass_rate,
      cold_pass_rate: credential.cold_pass_rate,
      lift: credential.lift,
      n_tasks: credential.n_tasks,
      // a capped RSL (L0/L1) is the catastrophic-over-grant signal from the reference check.
      catastrophic_signal: credential.rsl_level === 'L0' || credential.rsl_level === 'L1',
    },
    voids_on: 'config drift — a change to model/tools/context/harness or the environment voids this signal',
    basis:
      'reproducible under this verifier; an underwriting INPUT, not an actuarial premium, incident-rate prediction, or safety guarantee',
  }
}

// Independently re-verify the risk signal from the credential (the insurer trusts no one).
// codes: 0 valid · 3 tamper (signal disagrees with the credential) · 5 mismatched credential.
export function verifyUnderwriting(signal, credential) {
  const checks = []
  const ok = (m) => (checks.push(['PASS', m]), true)
  const bad = (code, m) => ({ ok: false, code, checks: (checks.push(['FAIL', m]), checks) })

  const digest = credential.credential_digest ?? sha256(canonical(credential))
  if (signal.credential_digest !== digest) return bad(5, 'signal is not derived from this credential')
  ok('signal binds to this credential')

  const expected = underwriteCredential(credential)
  if (signal.risk_score !== expected.risk_score) return bad(3, `risk_score ${signal.risk_score} != re-derived ${expected.risk_score}`)
  if (signal.risk_band !== expected.risk_band) return bad(3, `risk_band ${signal.risk_band} != re-derived ${expected.risk_band}`)
  ok(`risk_score ${signal.risk_score} (band ${signal.risk_band}) reproduces from the credential`)
  return { ok: true, code: 0, checks }
}
