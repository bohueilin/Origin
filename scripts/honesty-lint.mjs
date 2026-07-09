#!/usr/bin/env node
// honesty-lint — a machine tripwire for the "Honest by design" doctrine.
//
// Origin's credibility rests on scoped claims ("reproducible under this
// verifier," never "safe"/"correct"; synthetic labeled synthetic; the
// deterministic oracle is the only judge). That discipline was convention-only:
// nothing stopped new marketing copy from overclaiming. This gate enforces it
// two ways on the SERVED public pages:
//
//   1. BANNED — fail on near-always-overclaim phrasing (unhackable, 100% safe,
//      guarantees security, provably safe, zero-risk, …). These almost never
//      have an honest reading in security marketing.
//   2. REQUIRED — fail if a load-bearing DISCLAIMER is silently deleted (the
//      "reproducible under this verifier" scoping on /verify; the "not
//      production / not compliance certification" honesty line on the home).
//
// Confident framing is fine; unscoped absolutes are not. Run: node scripts/honesty-lint.mjs
// (also invoked by `make gates-all`). Exit non-zero on any violation.

import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WEB = join(ROOT, 'apps', 'origin-web')

// Served HTML entries (the vite rollup inputs) — the pages a visitor actually reaches.
const SERVED = [
  'index.html', 'app.html', 'auth.html', 'brief.html', 'capture.html', 'clip.html',
  'foundry.html', 'passport.html', 'proof.html', 'security.html', 'soc.html',
  'trust.html', 'verify.html',
]

// 1. BANNED — regex + human label. Matched case-insensitively against visible text.
const BANNED = [
  [/\bunhackable\b/i, 'claims code is unhackable'],
  [/\bbulletproof\b/i, 'claims bulletproof security'],
  [/\bprovably safe\b/i, '"provably safe" — we prove reproducibility, not safety'],
  [/\b100%\s*(safe|secure|accurate|reliable)\b/i, 'claims 100% safe/secure/accurate'],
  [/\bzero[-\s]?risk\b/i, 'claims zero risk'],
  [/\bmilitary[-\s]?grade\b/i, 'empty "military-grade" superlative'],
  [/\bcannot be (hacked|breached|fooled|bypassed)\b/i, 'absolute "cannot be X" claim'],
  [/\bguarantees?\s+(safety|security|correctness|compliance)\b/i, 'guarantees safety/security/correctness'],
  [/\bcompletely (safe|secure)\b/i, 'claims completely safe/secure'],
  [/\b(fully|totally) (safe|secure|autonomous)\b/i, 'absolute "fully/totally safe/secure/autonomous"'],
  [/\bnever fails\b/i, 'claims it never fails'],
  [/\bprevents (all|every|any|prompt injection\b)/i, 'claims to PREVENT (we contain, we do not prevent)'],
]

// 2. REQUIRED — a disclaimer that must survive on a given page. [file, regex, why].
const REQUIRED = [
  ['verify.html', /reproducible under this verifier/i,
    'the /verify scoping ("reproducible under this verifier," not "safe")'],
  ['index.html', /not (production|compliance)/i,
    'the home honesty line ("not production SaaS, and not compliance certification")'],
  ['proof.html', /honest ladder/i, 'the /proof "honest ladder" framing'],
]

// crude but effective: strip tags so we lint the visible prose, not attributes/scripts
const visibleText = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')

let violations = 0
const note = (msg) => {
  console.log(`  ✗ ${msg}`)
  violations += 1
}

for (const file of SERVED) {
  const path = join(WEB, file)
  if (!existsSync(path)) continue
  const text = visibleText(readFileSync(path, 'utf8'))
  for (const [re, label] of BANNED) {
    const m = text.match(re)
    if (m) note(`${file}: BANNED overclaim — ${label} (matched "${m[0].trim()}")`)
  }
}

for (const [file, re, why] of REQUIRED) {
  const path = join(WEB, file)
  if (!existsSync(path)) { note(`${file}: MISSING page — cannot confirm ${why}`); continue }
  if (!re.test(readFileSync(path, 'utf8'))) {
    note(`${file}: REQUIRED disclaimer removed — ${why}`)
  }
}

if (violations === 0) {
  console.log(`honesty-lint: clean — ${SERVED.length} served pages, ${BANNED.length} banned patterns, ${REQUIRED.length} required disclaimers.`)
  process.exit(0)
}
console.log(`\nhonesty-lint: ${violations} violation(s). Keep claims scoped ("reproducible under this verifier," never "safe"/"correct").`)
process.exit(1)
