import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { verifyEpisode, adjudicate } from './env-evidence.mjs'
import { buildCostLedger, rateDigest } from './cost-ledger.mjs'
import { scoreReward } from './reward-module.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
const scoreFn = (t, a) => scoreReward(t, a, { policy: 'test' })
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id
const fresh = () => ({ bundle: load('warehouse.env-bundle.lock.json'), episode: load('warehouse-smoke.episode.json'), receipt: load('warehouse-smoke.score-receipt.json') })

describe('CostLedger (P6) — deterministic cost-per-rollout attribution', () => {
  const costModel = { token_in_per_m: 0.5, token_out_per_m: 1.5, sandbox_usd_per_second: 0.0001, verifier_usd_per_ms: 0, storage_usd_per_byte: 5e-10 }

  it('total_usd = token + sandbox + verifier + storage; reward_per_dollar is deterministic', () => {
    const a = buildCostLedger({ sandbox_seconds: 14, storage_bytes: 1000, reward: 1, costModel })
    const b = buildCostLedger({ sandbox_seconds: 14, storage_bytes: 1000, reward: 1, costModel })
    expect(a).toEqual(b) // bit-identical across runs
    expect(a.total_usd).toBeCloseTo(a.token_cost_usd + a.sandbox_cost_usd + a.verifier_cost_usd + a.storage_cost_usd, 9)
    expect(a.reward_per_dollar).toBeCloseTo(1 / a.total_usd, 3)
  })

  it('the committed gold receipt carries a cost ledger that reproduces (verify exit 0)', () => {
    const { bundle, episode, receipt } = fresh()
    expect(receipt.cost.sandbox_seconds).toBe(14)
    expect(receipt.cost.reward_per_dollar).toBeGreaterThan(0)
    expect(receipt.cost.rate_digest).toBe(rateDigest(bundle.cost_model))
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })

  it('a tampered cost is caught (exit 3) and never changes the license', () => {
    const { bundle, episode, receipt } = fresh()
    const licBefore = receipt.license_level
    receipt.cost.total_usd = 0.00000001 // forge a cheaper rollout to inflate reward_per_dollar
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(3)
    expect(receipt.license_level).toBe(licBefore) // cost is attribution-only, never a gate
  })

  it('a pinned rate change is drift (exit 4) — a governance event, not a silent edit', () => {
    const { bundle, episode, receipt } = fresh()
    bundle.cost_model.sandbox_usd_per_second = 999 // repricing without re-rolling rate_digest
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(4)
  })
})

describe('dispute adjudication (P6) — settles the Computation class only', () => {
  it('a clean receipt → RESOLVED_FOR (exit 0)', () => {
    const { bundle, episode, receipt } = fresh()
    const { code } = verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn })
    const adj = adjudicate({ code, bundle, receipt })
    expect(code).toBe(0)
    expect(adj.outcome).toBe('RESOLVED_FOR')
    expect(adj.dispute_class).toBe('Computation')
  })

  it('a reward-tampered receipt → RESOLVED_AGAINST (exit 3)', () => {
    const { bundle, episode, receipt } = fresh()
    receipt.reward = 0.5
    const { code } = verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn })
    const adj = adjudicate({ code, bundle, receipt })
    expect(code).toBe(3)
    expect(adj.outcome).toBe('RESOLVED_AGAINST')
  })

  it('a chain-tampered episode → UNRESOLVED (exit 2)', () => {
    const { bundle, episode, receipt } = fresh()
    const ev = episode.events.find((e) => e.event_type === 'action.applied')
    ev.payload.action = 'refuse'
    const { code } = verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn })
    const adj = adjudicate({ code, bundle, receipt })
    expect(code).toBe(2)
    expect(adj.outcome).toBe('UNRESOLVED')
  })

  it('the committed adjudication example is digest-valid + RESOLVED_FOR', () => {
    const adj = load('warehouse-smoke.adjudication.json')
    expect(adj.outcome).toBe('RESOLVED_FOR')
    expect(adj.settles).toBe('Computation only')
    const rebuilt = adjudicate({ code: adj.exit_code, bundle: { env_bundle_digest: adj.env_bundle_digest }, receipt: { receipt_digest: adj.receipt_digest, verifier_version: adj.verifier_version } })
    expect(rebuilt.adjudication_digest).toBe(adj.adjudication_digest)
  })
})
