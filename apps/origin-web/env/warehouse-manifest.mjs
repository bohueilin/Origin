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
import { buildToolSchemas, toBundleTools, toolsDigest, buildPolicies, policiesDigest, registryDigest } from '@origin/evidence/env-manifest'
import { warehouseToolAuthz } from './warehouse-tools.mjs'

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

// Bundle-shaped tool entries — {name, schema_digest, version} (P1) + {scope, rate_limit}
// (P3) on the SAME entries. This one array is both the P1 tool pin and the P3 registry.
export function warehouseBundleTools() {
  return toBundleTools(warehouseToolSchemas()).map((t) => ({ ...t, ...warehouseToolAuthz(t.name) }))
}

export function warehouseToolsDigest() {
  return toolsDigest(warehouseBundleTools())
}

// The authorization-projection rollup (P3), pinned as bundle.registry_digest.
export function warehouseRegistryDigest() {
  return registryDigest(warehouseBundleTools())
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
