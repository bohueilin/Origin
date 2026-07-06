// Origin Training Evidence — warehouse-manifest (P1)
// =============================================================================
// The warehouse-SPECIFIC composition: which tools + policies the warehouse gym
// pins into its EnvironmentBundle. Composes the generic env-manifest.mjs helpers
// with the real warehouse vocabulary (WAREHOUSE_TOOLS/WAREHOUSE_ACTIONS) and the
// real policy source files (warehouse.ts safety gate, license.ts ladder).
//
// Single source of truth so the generator (gen-env-evidence.mjs) and the replay
// CLI (env-verify.mjs) re-derive the SAME tools/policies — the replay can then
// detect manifest-vs-code drift (bundle stale relative to the live env code).
// =============================================================================

import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WAREHOUSE_TOOLS, WAREHOUSE_ACTIONS } from '../src/warehouse.ts'
import { buildToolSchemas, toBundleTools, toolsDigest, buildPolicies, policiesDigest } from './env-manifest.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const readSrc = (rel) => readFileSync(resolve(HERE, rel), 'utf8')

// Each tool admits the concrete actions that are exactly it (e.g. 'pick') or a
// namespaced variant (e.g. 'move' → move:north/east/south/west), derived from the
// real WAREHOUSE_ACTIONS vocabulary — no hand-maintained list.
export function warehouseToolSpecs() {
  return WAREHOUSE_TOOLS.map((name) => ({
    name,
    version: '1.0.0',
    actions: WAREHOUSE_ACTIONS.filter((a) => a === name || a.startsWith(`${name}:`)),
  }))
}

// Full tool schemas (with inline schema) — written to the committed sidecar for transparency.
export function warehouseToolSchemas() {
  return buildToolSchemas(warehouseToolSpecs())
}

// Bundle-shaped tool entries (digest, not payload) — what goes into bundle.tools[].
export function warehouseBundleTools() {
  return toBundleTools(warehouseToolSchemas())
}

export function warehouseToolsDigest() {
  return toolsDigest(warehouseBundleTools())
}

export function warehousePolicies() {
  return buildPolicies({
    safetyGateSrc: readSrc('../src/warehouse.ts'),
    licenseSrc: readSrc('../src/license.ts'),
  })
}

export function warehousePoliciesDigest() {
  return policiesDigest(warehousePolicies())
}
