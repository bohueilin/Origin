#!/usr/bin/env node
// floor-verify — independently verify an Origin floor-parse evidence file.
//
// A reviewer downloads the evidence JSON from /foundry ("Download parse
// evidence") and runs:
//
//   node floor-verify.mjs evidence.json
//
// Zero dependencies (Node ≥ 18, built-in crypto only) — the same discipline as
// origin-verify: this file is meant to be read in one sitting and trusted on
// its own.
//
// WHAT IT PROVES (and what it does not — stated plainly, at the verdict line):
//   1. RECEIPT INTEGRITY: receipt_digest recomputes over the receipt body, so
//      the verdict/code/digests were not edited after issuance.
//   2. INPUT BINDING: input_digest recomputes over raw_proposal — the verdict
//      was issued about EXACTLY this model output.
//   3. MAP BINDING: map_digest recomputes over site_map — the floor shown to a
//      human is exactly the floor the gate emitted (null for VOID).
//   4. NOT covered by any digest: the oracle text, per-check details, and the
//      repair log are display-only. And this tool does not re-derive the
//      verdict from the proposal — the gate that does that is open source
//      (apps/origin-web/src/foundry/parseGate.ts, pinned by parseGate.test.ts).
//   5. Integrity ≠ authenticity: digests prove the file is self-consistent,
//      not WHO issued it. Anyone can mint a self-consistent receipt offline.
//
// Exit codes: 0 all present checks pass · 1 mismatch (tampered/corrupt/forged)
// · 2 usage error.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

// Canonical JSON — sorted keys, undefined dropped — MUST match parseGate.ts.
export const canonical = (v) => {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null'
  if (Array.isArray(v)) return `[${v.map((x) => canonical(x === undefined ? null : x)).join(',')}]`
  const keys = Object.keys(v).filter((k) => v[k] !== undefined).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`
}
export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

const HEX64 = /^[0-9a-f]{64}$/
const VERDICTS = new Set(['VALID', 'ESCALATE', 'VOID'])

/** Verify an evidence object. Returns { ok, bound, checks, summary }. */
export function verifyEvidence(evidence) {
  const checks = []
  const add = (name, pass, detail) => {
    checks.push({ name, pass, detail })
    return pass
  }
  const fail = (summary) => ({ ok: false, bound: false, checks, summary })

  const receipt = evidence?.receipt
  // Strict shape FIRST: an invented receipt with a hollow body must die here,
  // not survive on a self-consistent digest over nothing.
  const shapeOk =
    receipt &&
    typeof receipt === 'object' &&
    receipt.kind === 'floor-parse-receipt' &&
    typeof receipt.verifier === 'string' &&
    VERDICTS.has(receipt.verdict) &&
    Number.isInteger(receipt.code) &&
    HEX64.test(String(receipt.input_digest)) &&
    HEX64.test(String(receipt.map_digest)) &&
    HEX64.test(String(receipt.receipt_digest))
  if (
    !add(
      'shape',
      Boolean(shapeOk),
      shapeOk
        ? `receipt kind=${receipt.kind} verifier=${receipt.verifier} verdict=${receipt.verdict}`
        : 'not a well-formed floor-parse receipt (requires kind, verifier, verdict, code, input_digest, map_digest, receipt_digest)',
    )
  ) {
    return fail('FAIL — this is not a well-formed floor-parse evidence file.')
  }

  const { receipt_digest, ...body } = receipt
  const recomputed = sha256(canonical(body))
  add(
    'receipt_integrity',
    recomputed === receipt_digest,
    recomputed === receipt_digest
      ? `receipt_digest recomputes: ${receipt_digest.slice(0, 16)}…`
      : `receipt_digest MISMATCH: file says ${String(receipt_digest).slice(0, 16)}…, recomputed ${recomputed.slice(0, 16)}… — the receipt was altered after issuance`,
  )

  const hasProposal = evidence && typeof evidence === 'object' && 'raw_proposal' in evidence
  if (hasProposal) {
    const inputRecomputed = sha256(canonical(evidence.raw_proposal ?? null))
    add(
      'input_binding',
      inputRecomputed === receipt.input_digest,
      inputRecomputed === receipt.input_digest
        ? 'input_digest recomputes over raw_proposal — the verdict is about exactly this model output'
        : `input_digest MISMATCH — the raw_proposal in this file is NOT what the verdict was issued about (recomputed ${inputRecomputed.slice(0, 16)}…, receipt says ${receipt.input_digest.slice(0, 16)}…)`,
    )
  } else {
    add('input_binding', true, 'no raw_proposal in the file — input binding NOT checked')
  }

  const hasMap = evidence && typeof evidence === 'object' && 'site_map' in evidence
  if (hasMap) {
    const mapRecomputed = sha256(canonical(evidence.site_map ?? null))
    add(
      'map_binding',
      mapRecomputed === receipt.map_digest,
      mapRecomputed === receipt.map_digest
        ? 'map_digest recomputes over site_map — the displayed floor is exactly what the gate emitted'
        : `map_digest MISMATCH — the site_map in this file was EDITED after issuance (recomputed ${mapRecomputed.slice(0, 16)}…, receipt says ${receipt.map_digest.slice(0, 16)}…)`,
    )
  } else {
    add('map_binding', true, 'no site_map in the file — map binding NOT checked')
  }

  const ok = checks.every((c) => c.pass)
  const bound = ok && hasProposal && hasMap
  let summary
  if (!ok) {
    summary = 'FAIL — a digest did not recompute. Do not trust this evidence file.'
  } else if (bound) {
    summary =
      'VERIFIED — receipt intact, bound to the included raw proposal and cleaned map. ' +
      'Not covered by any digest: the oracle text, check details, and repair log are display-only. ' +
      'Digests prove self-consistency, not who issued the file; the verdict logic is open source (src/foundry/parseGate.ts).'
  } else {
    summary =
      'RECEIPT INTACT — integrity verified only. raw_proposal and/or site_map are missing, so those bindings were NOT checked; ' +
      'this does not verify what the verdict was about. Ask for the full evidence file.'
  }
  return { ok, bound, checks, summary }
}

// ---- CLI --------------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())
if (isMain) {
  const file = process.argv[2]
  if (!file) {
    console.error('usage: node floor-verify.mjs <evidence.json>')
    process.exit(2)
  }
  let evidence
  try {
    evidence = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`cannot read/parse ${file}: ${e.message}`)
    process.exit(2)
  }
  const { ok, checks, summary } = verifyEvidence(evidence)
  for (const c of checks) console.log(` ${c.pass ? '✓' : '✗'} ${c.name}: ${c.detail}`)
  console.log(`\n${summary}`)
  process.exit(ok ? 0 : 1)
}
