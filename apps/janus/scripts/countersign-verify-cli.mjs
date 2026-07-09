#!/usr/bin/env node
// Countersign — offline bundle verifier CLI (thin wrapper over @origin/verifier-core).
// =============================================================================
// The one command a skeptical third party runs on an exported bundle:
//
//   node scripts/countersign-verify-cli.mjs <bundle.json> [--json]
//
// It reads the bundle, re-derives every earned authority claim it carries, prints a
// human PASS/FAIL report, and EXITS with the verifier's process code:
//   0  every claim re-derived from the evidence (VALID)
//   2  integrity failure — a credential was tampered / is incomplete / malformed
//   3  authority failure — bad issuer signature / level inflation / wrong issuer / stale
// A missing file or unparseable JSON is itself an integrity failure → exit 2.
//
// No network, no database, no trust in whoever produced the bundle. The only external
// input is the issuer key the bundle declares — and the verifier refuses any bundle whose
// declared issuer thumbprint does not re-derive from its own public key.
// =============================================================================

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const INTEGRITY_EXIT = 2

async function loadVerifier() {
  // Prefer the published package export (works once installed / merged); fall back to the
  // co-located source in the monorepo so the CLI runs from a fresh worktree with no install.
  try {
    return await import('@origin/verifier-core/countersign-verify')
  } catch {
    const here = dirname(fileURLToPath(import.meta.url))
    return await import(resolve(here, '../../../packages/verifier-core/countersign-verify.mjs'))
  }
}

function fail(msg) {
  console.error(`countersign-verify: ${msg}`)
  process.exit(INTEGRITY_EXIT)
}

async function main() {
  const argv = process.argv.slice(2)
  const asJson = argv.includes('--json')
  const path = argv.find((a) => !a.startsWith('--'))

  if (!path) {
    console.error('usage: node countersign-verify-cli.mjs <bundle.json> [--json]')
    process.exit(INTEGRITY_EXIT)
  }

  let raw
  try {
    raw = readFileSync(path, 'utf8')
  } catch (e) {
    fail(`cannot read bundle file "${path}" — ${e.message}`)
  }

  let bundle
  try {
    bundle = JSON.parse(raw)
  } catch (e) {
    fail(`bundle "${path}" is not valid JSON — ${e.message}`)
  }

  const { verifyBundleWithDelegations, formatReport } = await loadVerifier()
  const result = await verifyBundleWithDelegations(bundle)

  if (asJson) {
    console.log(JSON.stringify(result, null, 2))
  } else {
    console.log(formatReport(result))
  }
  process.exit(result.exitCode)
}

main().catch((e) => fail(`unexpected error — ${e && e.stack ? e.stack : e}`))
