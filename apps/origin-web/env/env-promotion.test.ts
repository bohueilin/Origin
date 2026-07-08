import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { warehouseTasks, oraclePolicy } from '../src/warehouse.ts'
import { VERIFIER_VERSION } from '../server/evalVersions.ts'
import { scoreReward } from './reward-module.ts'
import { goldSuite, exploitSuite } from './exploit-suite.ts'
import { promoteEnvironment, verifyEnvPromotionReceipt, allowedTransition, EnvStatus } from '@origin/verifier-core/env-promotion'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
const schema = JSON.parse(readFileSync(resolve(HERE, '../docs/schemas/env-bundle.schema.json'), 'utf8'))
const APPROVAL = { approver: 'origin-ops', capability: 'env.promote', valid: true }

function baseOpts(overrides = {}) {
  return {
    bundle: load('warehouse.env-bundle.lock.json'),
    from: EnvStatus.VALIDATION,
    to: EnvStatus.PRODUCTION,
    tasks: [...warehouseTasks],
    scoreFn: (t, a) => scoreReward(t, a, { policy: 'test' }),
    oracleFn: (t) => oraclePolicy(t),
    goldSuite: goldSuite(),
    exploitSuite: exploitSuite(),
    schema,
    approval: APPROVAL,
    versions: { verifier_version: VERIFIER_VERSION },
    rollbackTarget: null,
    ...overrides,
  }
}

describe('environment promotion lifecycle (P9)', () => {
  it('allowedTransition only permits adjacent forward steps', () => {
    expect(allowedTransition('authoring', 'validation')).toBe(true)
    expect(allowedTransition('validation', 'production')).toBe(true)
    expect(allowedTransition('authoring', 'production')).toBe(false) // skip
    expect(allowedTransition('production', 'validation')).toBe(false) // backward
  })

  it('all gates green + approval → promoted (exit 0), receipt reproduces', () => {
    const { code, receipt } = promoteEnvironment(baseOpts())
    expect(code).toBe(0)
    expect(receipt.gate_results.every((g) => g.ok)).toBe(true)
    expect(receipt.frozen).toBe(true)
    expect(verifyEnvPromotionReceipt(receipt, baseOpts()).ok).toBe(true)
  })

  it('EnvStatus never changes the env content identity (digest stable across promotion)', () => {
    const opts = baseOpts()
    const before = opts.bundle.env_bundle_digest
    const { receipt } = promoteEnvironment(opts)
    expect(receipt.env_bundle_digest).toBe(before) // promoting did NOT change the bundle digest
    expect(receipt.from_status).toBe('validation') // status lives on the receipt only
  })

  it('a tampered env_bundle_digest blocks promotion (exit 5, no receipt)', () => {
    const opts = baseOpts()
    opts.bundle.env_bundle_digest = 'f'.repeat(64)
    const { code, receipt } = promoteEnvironment(opts)
    expect(code).toBe(5)
    expect(receipt).toBeNull()
  })

  it('an illegal transition is rejected (exit 6)', () => {
    const { code } = promoteEnvironment(baseOpts({ from: 'authoring', to: 'production' }))
    expect(code).toBe(6)
  })

  it('missing/expired approval blocks promotion (exit 7) even when all else is green', () => {
    expect(promoteEnvironment(baseOpts({ approval: null })).code).toBe(7)
    expect(promoteEnvironment(baseOpts({ approval: { approver: 'x', capability: 'env.promote', expires_at: 10, now: 20 } })).code).toBe(7)
  })

  it('an uncaught exploit blocks exploit-suite-green (a gate fails → exit 5)', () => {
    // a verifier that fails to gate a reward hack (patched_reward stays > 0) must not promote.
    const brokenScore = (t, a) => {
      const r = scoreReward(t, a, { policy: 'broken' })
      return { ...r, patched_reward: 1, reward: 1, is_hack: false } // pretend the exploit paid out
    }
    const { code, gate_results } = promoteEnvironment(baseOpts({ scoreFn: brokenScore }))
    expect(code).toBe(5)
    expect(gate_results.find((g) => g.id === 'exploit_suite_green').ok).toBe(false)
  })

  it('the committed EnvironmentPromotionReceipt reproduces + is schema-shaped', () => {
    const receipt = load('warehouse.env-promotion-receipt.json')
    const promSchema = JSON.parse(readFileSync(resolve(HERE, '../docs/schemas/env-promotion-receipt.schema.json'), 'utf8'))
    for (const k of promSchema.required) expect(receipt, `missing ${k}`).toHaveProperty(k)
    expect(receipt.to_status).toBe('production')
    expect(verifyEnvPromotionReceipt(receipt, baseOpts()).ok).toBe(true)
    // tampering a gate result breaks reproduction
    const tampered = { ...receipt, gate_results: receipt.gate_results.map((g, i) => (i === 0 ? { ...g, ok: false } : g)) }
    expect(verifyEnvPromotionReceipt(tampered, baseOpts()).ok).toBe(false)
  })
})
