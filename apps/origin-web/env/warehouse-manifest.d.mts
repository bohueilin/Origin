// Type surface for warehouse-manifest.mjs — the warehouse-SPECIFIC composition of
// the generic @origin/evidence/env-manifest helpers with the real warehouse
// vocabulary + policy source files (reads src/warehouse.ts + src/license.ts from
// disk — Node-only, app-coupled by design; the future home is packages/oracle).
// Hand-written declarations; keep in lockstep with warehouse-manifest.mjs.

import type { ToolSchemaEntry, BundleToolEntry, PolicyEntry } from '@origin/evidence/env-manifest'

export function warehouseToolSpecs(): Array<{ name: string; version: string; actions: string[] }>
/** Full tool schemas (inline schema) — written to the committed sidecar for transparency. */
export function warehouseToolSchemas(): ToolSchemaEntry[]
/** One array = both the P1 tool pin and the P3 registry ({scope, rate_limit} folded on). */
export function warehouseBundleTools(): BundleToolEntry[]
export function warehouseToolsDigest(): string
/** The authorization-projection rollup (P3), pinned as bundle.registry_digest. */
export function warehouseRegistryDigest(): string
export function warehousePolicies(): PolicyEntry[]
export function warehousePoliciesDigest(): string
