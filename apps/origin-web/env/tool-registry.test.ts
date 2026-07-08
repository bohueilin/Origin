import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { warehouseTasks, bfsOracle, oraclePolicy } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { verifyEpisode, recordedActions, recordedToolCalls } from '@origin/evidence/env-evidence'
import { registryDigest } from '@origin/evidence/env-manifest'
import { buildRegistry } from '@origin/verifier-core/tool-registry'
import { createMcpAdapter } from '@origin/verifier-core/mcp-adapter'
import { warehouseBundleTools, warehouseRegistryDigest } from './warehouse-manifest.mjs'
import { WAREHOUSE_GRANT, EXFILTRATE_TOOL, actionToCall } from './warehouse-tools.mjs'
import { scoreReward } from './reward-module.ts'

const HERE = dirname(fileURLToPath(import.meta.url))
const load = (p: string) => JSON.parse(readFileSync(resolve(HERE, '../docs/examples', p), 'utf8'))
const scoreFn = (t, a) => scoreReward(t, a, { policy: 'test' })
const licenseFn = (v) => computeLicenseFromVerdicts(v).level.id
const tools = warehouseBundleTools()

describe('MCP tool registry (P3) — scoped + rate-limited authorization', () => {
  it('listTools exposes the 8 warehouse tools with scope + rate_limit', () => {
    const adapter = createMcpAdapter(buildRegistry(tools), WAREHOUSE_GRANT)
    const listed = adapter.listTools()
    expect(listed.length).toBe(8)
    expect(listed.every((t) => t.scope && t.rate_limit)).toBe(true)
  })

  it('an in-scope tool call is allowed', () => {
    const adapter = createMcpAdapter(buildRegistry(tools), WAREHOUSE_GRANT)
    expect(adapter.callTool('move', { direction: 'east' }, { step: 0 }).verdict).toBe('allow')
  })

  it('an out-of-scope tool is denied by scope (deny_scope), never runs', () => {
    const reg = buildRegistry([...tools, EXFILTRATE_TOOL])
    const adapter = createMcpAdapter(reg, WAREHOUSE_GRANT)
    const r = adapter.callTool('exfiltrate', {}, { step: 0 })
    expect(r.allow).toBe(false)
    expect(r.verdict).toBe('deny_scope')
  })

  it('a single-shot tool denies the second call by rate (deny_rate)', () => {
    const adapter = createMcpAdapter(buildRegistry(tools), WAREHOUSE_GRANT)
    expect(adapter.callTool('scan', {}, { step: 0 }).verdict).toBe('allow')
    expect(adapter.callTool('scan', {}, { step: 1 }).verdict).toBe('deny_rate')
  })

  it('an unknown tool is denied (unknown_tool)', () => {
    const adapter = createMcpAdapter(buildRegistry(tools), WAREHOUSE_GRANT)
    expect(adapter.callTool('teleport', {}, { step: 0 }).verdict).toBe('unknown_tool')
  })

  it('driving the oracle path through callTool: allowed → applied, denied → NOT applied', () => {
    const task = warehouseTasks.find((t) => bfsOracle(t).label === 'finish')
    const adapter = createMcpAdapter(buildRegistry(tools), WAREHOUSE_GRANT)
    const applied: string[] = []
    let step = 0
    for (const action of oraclePolicy(task)) {
      const { tool, args } = actionToCall(action)
      if (adapter.callTool(tool, args, { step: step++ }).allow) applied.push(action)
    }
    // a second scan (rate-denied) must NOT enter the applied list
    expect(adapter.callTool('scan', {}, { step }).verdict).toBe('deny_rate')
    expect(applied).toEqual([...oraclePolicy(task)]) // every oracle action was allowed
  })
})

describe('P3 registry pins into the bundle + reproduces under env:verify', () => {
  it('the committed registry_digest re-derives from the live tool authorization', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    expect(bundle.registry_digest).toBe(warehouseRegistryDigest())
    expect(bundle.registry_digest).toBe(registryDigest(bundle.tools))
  })

  it('the committed TOOLED trio has tool.call/tool.result events + exactly one denial, and verifies', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-tooled.episode.json')
    const receipt = load('warehouse-tooled.score-receipt.json')
    const calls = recordedToolCalls(episode)
    const denials = episode.events.filter((e) => e.event_type === 'tool.result' && e.payload.allow === false)
    expect(calls.length).toBeGreaterThan(0)
    expect(denials.length).toBe(1) // the rate-denied second scan
    // the denied call did NOT widen the scored action trace
    const finishTask = warehouseTasks.find((t) => bfsOracle(t).label === 'finish')
    expect(recordedActions(episode)).toEqual([...oraclePolicy(finishTask)])
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(0)
  })

  it('replaying the recorded tool calls reproduces every recorded verdict', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-tooled.episode.json')
    const reg = buildRegistry(bundle.tools)
    const adapter = createMcpAdapter(reg, WAREHOUSE_GRANT)
    const calls = episode.events.filter((e) => e.event_type === 'tool.call')
    const results = episode.events.filter((e) => e.event_type === 'tool.result')
    calls.forEach((c, i) => {
      const replay = adapter.callTool(c.payload.tool, c.payload.args, { step: i })
      expect(replay.verdict, `call ${i} (${c.payload.tool})`).toBe(results[i].payload.verdict)
    })
  })

  it('tampering a recorded verdict breaks the chain (exit 2)', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-tooled.episode.json')
    const receipt = load('warehouse-tooled.score-receipt.json')
    const denied = episode.events.find((e) => e.event_type === 'tool.result' && e.payload.allow === false)
    denied.payload.verdict = 'allow' // forge the deny into an allow — the chain no longer recomputes
    denied.payload.allow = true
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(2)
  })

  it('tampering a pinned rate_limit is drift (exit 4)', () => {
    const bundle = load('warehouse.env-bundle.lock.json')
    const episode = load('warehouse-tooled.episode.json')
    const receipt = load('warehouse-tooled.score-receipt.json')
    const scan = bundle.tools.find((t) => t.name === 'scan')
    scan.rate_limit = { capacity: 99, refill_per_step: 9 } // widen the limit → registry/bundle drift
    expect(verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }).code).toBe(4)
  })
})
