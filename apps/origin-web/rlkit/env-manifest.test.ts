import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyWarehouseRollout } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { canonical, sha256, verifyEpisode } from './env-evidence.mjs'
import { buildToolSchemas, toolInputSchema, toBundleTools, toolsDigest, buildPolicies, policiesDigest } from './env-manifest.mjs'
import { warehouseToolSchemas, warehouseBundleTools, warehouseToolsDigest, warehousePolicies, warehousePoliciesDigest } from './warehouse-manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
const scoreFn = (task, actions) => verifyWarehouseRollout(task, actions, 'test')
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id

describe('env-manifest — pure sub-artifact content-addressing (P1)', () => {
  it('a tool schema_digest is sha256(canonical(schema)) and is deterministic', () => {
    const [tool] = buildToolSchemas([{ name: 'move', actions: ['move:north', 'move:east'] }])
    expect(tool.schema_digest).toBe(sha256(canonical(toolInputSchema(['move:north', 'move:east']))))
    // rebuilding is bit-identical across runs
    expect(buildToolSchemas([{ name: 'move', actions: ['move:north', 'move:east'] }])[0].schema_digest).toBe(tool.schema_digest)
  })

  it('editing a tool’s admitted actions changes its schema_digest', () => {
    const a = buildToolSchemas([{ name: 'move', actions: ['move:north'] }])[0].schema_digest
    const b = buildToolSchemas([{ name: 'move', actions: ['move:north', 'move:west'] }])[0].schema_digest
    expect(a).not.toBe(b)
  })

  it('toolsDigest is order-independent (sorted by name) and deterministic', () => {
    const t = toBundleTools(buildToolSchemas([
      { name: 'pick', actions: ['pick'] },
      { name: 'drop', actions: ['drop'] },
    ]))
    const reversed = [...t].reverse()
    expect(toolsDigest(reversed)).toBe(toolsDigest(t))
  })

  it('a policy digest binds the statement to the source sha256 → a source edit moves it', () => {
    const p1 = buildPolicies({ safetyGateSrc: 'GATE v1', licenseSrc: 'LADDER' })
    const p2 = buildPolicies({ safetyGateSrc: 'GATE v2', licenseSrc: 'LADDER' }) // safety source changed
    const gate1 = p1.find((p) => p.id === 'safety-gate')
    const gate2 = p2.find((p) => p.id === 'safety-gate')
    const ladder1 = p1.find((p) => p.id === 'license-ladder')
    const ladder2 = p2.find((p) => p.id === 'license-ladder')
    expect(gate2.digest).not.toBe(gate1.digest) // gate source moved → digest moved
    expect(ladder2.digest).toBe(ladder1.digest) // ladder source unchanged → digest stable
    expect(policiesDigest(p1)).not.toBe(policiesDigest(p2))
  })
})

describe('warehouse manifest ↔ committed lockfile (content-addressing holds)', () => {
  it('the committed bundle pins tools + policies that re-derive from the live env code', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    expect(bundle.tools_digest).toBe(warehouseToolsDigest())
    expect(bundle.policies_digest).toBe(warehousePoliciesDigest())
    expect(bundle.tools).toEqual(warehouseBundleTools())
    expect(bundle.policies).toEqual(warehousePolicies())
    expect(bundle.tools.length).toBe(8) // one per WAREHOUSE_TOOL
    expect(bundle.policies.map((p) => p.id).sort()).toEqual(['license-ladder', 'safety-gate'])
  })

  it('every committed tools[].schema_digest content-addresses the sidecar schema', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const sidecar = load('warehouse.tools.schema.json')
    const built = warehouseToolSchemas()
    for (const t of bundle.tools) {
      const full = sidecar.tools.find((s) => s.name === t.name)
      expect(full, `sidecar missing tool ${t.name}`).toBeTruthy()
      expect(sha256(canonical(full.schema))).toBe(t.schema_digest) // digest addresses the schema
      expect(built.find((b) => b.name === t.name).schema_digest).toBe(t.schema_digest) // live == committed
    }
  })

  it('the enriched committed trio still verifies (exit 0)', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-smoke.episode.json')
    const receipt = load('warehouse-smoke.score-receipt.json')
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })

  it('tampering a pinned policy digest is drift (exit 4)', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-smoke.episode.json')
    const receipt = load('warehouse-smoke.score-receipt.json')
    bundle.policies[0].digest = 'f'.repeat(64) // changes bundleDigest → env_bundle_digest drift
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(4)
  })

  it('tampering a pinned tool schema_digest is drift (exit 4)', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-smoke.episode.json')
    const receipt = load('warehouse-smoke.score-receipt.json')
    bundle.tools[0] = { ...bundle.tools[0], schema_digest: 'a'.repeat(64) } // moves env_bundle_digest
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(4)
  })
})
