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
  'trust.html', 'verify.html', 'reference-check.html',
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
  [/\bguaranteed safe\b/i, '"guaranteed safe" — we say "reproducible under this verifier," never "safe"'],
  [/\bcan['’]?t (cheat|reward[-\s]?hack|be tricked|be gamed)\b/i, 'absolute "can\'t cheat/reward-hack/be tricked" (cheating scores zero — it is not impossible)'],
  [/\bbrain that can['’]?t\b/i, 'absolute "a brain that can\'t X" claim'],
  [/\bprovably (means )?safer\b/i, '"provably safer" — the oracle proves reproducibility of a score, not safety'],
  [/\bcan never reward[-\s]?hack\b/i, 'absolute "can never reward-hack" (the verifier itself is the attack surface Cobra/Chronos harden)'],
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

// og/twitter/description meta content + <title> — the text that spreads on a social share,
// invisible to visibleText() (it strips tags). This is where overclaims used to hide.
const metaAndTitleText = (html) => {
  const chunks = []
  for (const m of html.matchAll(/<meta[^>]*\b(?:name|property)=["'](?:description|og:title|og:description|twitter:title|twitter:description)["'][^>]*\bcontent=["']([^"']*)["']/gi)) chunks.push(m[1])
  for (const m of html.matchAll(/<meta[^>]*\bcontent=["']([^"']*)["'][^>]*\b(?:name|property)=["'](?:description|og:title|og:description|twitter:title|twitter:description)["']/gi)) chunks.push(m[1])
  for (const m of html.matchAll(/<title>([\s\S]*?)<\/title>/gi)) chunks.push(m[1])
  return chunks.join('  ·  ')
}

// React marketing copy the served pages render at runtime (invisible to a static HTML scan).
// Targeted to the demo surfaces where overclaims recur; JSX/strings scanned as-is.
const REACT_COPY_GLOBS = [
  'src/foundry/ui/FoundryApp.tsx', 'src/foundry/soc/SocConsole.tsx', 'src/foundry/clip/ClipView.tsx',
  'src/factorydad/components/RsiPrimer.tsx',
]

let violations = 0
const note = (msg) => {
  console.log(`  ✗ ${msg}`)
  violations += 1
}

for (const file of SERVED) {
  const path = join(WEB, file)
  if (!existsSync(path)) continue
  const raw = readFileSync(path, 'utf8')
  const text = visibleText(raw)
  const meta = metaAndTitleText(raw)
  for (const [re, label] of BANNED) {
    const m = text.match(re)
    if (m) note(`${file}: BANNED overclaim — ${label} (matched "${m[0].trim()}")`)
    const mm = meta.match(re)
    if (mm) note(`${file} <meta/title>: BANNED overclaim — ${label} (matched "${mm[0].trim()}")`)
  }
}

// React-rendered marketing copy (a curated set of demo-surface components).
for (const rel of REACT_COPY_GLOBS) {
  const path = join(WEB, rel)
  if (!existsSync(path)) continue
  const src = readFileSync(path, 'utf8')
  for (const [re, label] of BANNED) {
    const m = src.match(re)
    if (m) note(`${rel} (React copy): BANNED overclaim — ${label} (matched "${m[0].trim()}")`)
  }
}

for (const [file, re, why] of REQUIRED) {
  const path = join(WEB, file)
  if (!existsSync(path)) { note(`${file}: MISSING page — cannot confirm ${why}`); continue }
  if (!re.test(readFileSync(path, 'utf8'))) {
    note(`${file}: REQUIRED disclaimer removed — ${why}`)
  }
}

// Privacy invariant: any served page that loads Google Analytics MUST also set
// Consent Mode with analytics_storage denied by default — otherwise it sets
// cookies with no consent, contradicting the published privacy policy.
for (const file of SERVED) {
  const path = join(WEB, file)
  if (!existsSync(path)) continue
  const raw = readFileSync(path, 'utf8')
  if (!/googletagmanager\.com\/gtag/i.test(raw)) continue
  const hasConsentDefault = /gtag\(\s*['"]consent['"]\s*,\s*['"]default['"]/i.test(raw) && /analytics_storage\s*:\s*['"]denied['"]/i.test(raw)
  if (!hasConsentDefault) note(`${file}: loads Google Analytics WITHOUT Consent Mode default-deny (analytics_storage: 'denied') — the privacy policy says non-essential cookies are off by default`)
}

if (violations === 0) {
  console.log(`honesty-lint: clean — ${SERVED.length} served pages (prose + meta/title) + ${REACT_COPY_GLOBS.length} React copy files, ${BANNED.length} banned patterns, ${REQUIRED.length} required disclaimers.`)
  process.exit(0)
}
console.log(`\nhonesty-lint: ${violations} violation(s). Keep claims scoped ("reproducible under this verifier," never "safe"/"correct").`)
process.exit(1)
