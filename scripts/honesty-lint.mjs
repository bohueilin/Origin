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

// Served HTML entries — DERIVED from disk, not hand-listed. The old hardcoded
// 18-name list silently missed reference-check-vs-runtime.html (19 pages
// shipped), and a gate whose population is a stale list reports clean on pages
// it never read. Every root-level .html in the app is scanned; scanning a page
// vite happens not to build is harmless, missing a served one is not.
import { readdirSync } from 'node:fs'
const SERVED = readdirSync(join(ROOT, 'apps', 'origin-web')).filter((f) => f.endsWith('.html')).sort()

// Prose surfaces OUTSIDE the HTML entry set that still speak for Origin in
// public — found ungated by the 2026-08-01 external audit:
//   * public/llms.txt is advertised in robots.txt as THE summary for AI agents
//     — the copy most likely to be ingested verbatim by LLM-assisted diligence.
//   * public/rsi/rsi_dashboard.html is 50KB of claim-laden prose linked from
//     /foundry, and it was carrying four affirmative "is safe" claims when
//     first scanned.
const EXTRA_PROSE = ['public/llms.txt', 'public/rsi/rsi_dashboard.html']

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
  // "certification" is legally reserved for accredited bodies (TÜV, UL, SGS, exida, CertX —
  // all now NVIDIA Halos partners). Said in a robotics/safety context it ends the
  // conversation, and Origin issues no certificates: the customer's gate decides.
  // Use: release gate, admission control, evidence, independently verifiable record.
  // Scoped deliberately to AFFIRMATIVE equations only. Negated disclaimers ("not a
  // regulatory certification", "not reviewer-accepted or certified") and scoped
  // definitions ('"Certified" here means …') are the APPROVED phrasings and must keep
  // passing — flagging them would train people to delete the disclaimer, which is worse
  // than the word. So match the shape that actually overclaims: asserting that some
  // artifact IS a certificate.
  [/\bsafety certificate\b/i, '"safety certificate" — a trace is evidence, not a certificate'],
  // Bare assurance adverbs. The banned-word list has always included safe/secure, but
  // the gate had NO rule for them — so "Approve it safely" and "We send this securely
  // to our team" both shipped through a green lint. A gate that reports clean while
  // the words it exists to catch are on the page is worse than no gate: it gives the
  // person relying on it false assurance, which for this company is the worst possible
  // category of bug.
  //
  // Scoped to the ADVERBS and to copular assertions. The approved phrasings — the
  // negated form (never "safe" or "correct"), quoted prior-work descriptions, and
  // hyphenated domain compounds like frontier-safety — must keep passing, or people
  // learn to delete the disclaimer instead of the claim.
  [/\b(safely|securely)\b/i, 'bare "safely"/"securely" — we say "reproducible under this verifier," never an assurance adverb'],
  [/\b(is|are|keeps?|makes?)\s+(it\s+|you\s+|your\s+\w+\s+)?(safe|secure)\b/i, 'asserts something IS safe/secure — scope the claim to the verifier instead'],

  [/\b(is|are|as)\s+(the\s+|a\s+|your\s+)?(safety\s+|compliance\s+)?certificates?\b/i, 'asserts an artifact IS a certificate — Origin issues none; say evidence / independently verifiable record'],
  [/\bwe\s+certify\b/i, '"we certify" — Origin does not certify; the customer\'s gate decides'],
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
//
// DERIVED, not hand-listed — for exactly the reason SERVED is derived above. The previous
// hardcoded list never opened the trees that render /passport, /simulation, /operations or
// /capture, whose HTML entries are near-empty shells (passport.html ships
// `<main id="main"><div id="passport-root"></div></main>`) with every claim-bearing string
// in .tsx. A gate whose population is a stale list reports clean on pages it never read;
// that is how "Live demo · secrets never exposed" and a fabricated "~1,284 tok/s" shipped.
//
// Walk each served entry's <script type="module" src=…> and follow relative imports
// transitively, so a new claim-bearing module is covered the moment it is reachable.
const MODULE_SRC = /<script[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/gi
const IMPORT_FROM = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s*['"]([^'"]+)['"]/g
const CODE_EXT = ['', '.ts', '.tsx', '/index.ts', '/index.tsx']

const resolveModule = (spec, fromFile) => {
  if (!spec.startsWith('.') && !spec.startsWith('/')) return null // bare package specifier
  const base = spec.startsWith('/')
    ? join(WEB, spec.replace(/^\//, ''))
    : join(dirname(fromFile), spec)
  for (const ext of CODE_EXT) {
    const cand = base + ext
    if (existsSync(cand) && !cand.endsWith('/')) {
      try { if (readFileSync(cand, 'utf8') !== undefined) return cand } catch { /* dir */ }
    }
  }
  return null
}

const collectReactCopy = () => {
  const seen = new Set()
  const queue = []
  for (const page of SERVED) {
    const path = join(WEB, page)
    if (!existsSync(path)) continue
    for (const m of readFileSync(path, 'utf8').matchAll(MODULE_SRC)) {
      const entry = resolveModule(m[1], path)
      if (entry) queue.push(entry)
    }
  }
  while (queue.length) {
    const file = queue.pop()
    if (seen.has(file)) continue
    seen.add(file)
    let src
    try { src = readFileSync(file, 'utf8') } catch { continue }
    for (const m of src.matchAll(IMPORT_FROM)) {
      const next = resolveModule(m[1], file)
      if (next && !seen.has(next)) queue.push(next)
    }
  }
  // Repo-relative, sorted, and test files excluded (their strings are assertions, not copy).
  return [...seen]
    .filter((f) => !/\.(test|spec)\.[jt]sx?$/.test(f))
    .map((f) => f.slice(WEB.length + 1))
    .sort()
}

const REACT_COPY_GLOBS = collectReactCopy()
if (REACT_COPY_GLOBS.length === 0) {
  console.log('  ✗ honesty-lint: resolved ZERO React copy modules — the walk is broken, not the code')
  process.exit(1)
}

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

// Extra public prose surfaces (llms.txt is plain text; the RSI dashboard is HTML).
for (const rel of EXTRA_PROSE) {
  const path = join(WEB, rel)
  if (!existsSync(path)) { note(`${rel}: MISSING — listed as a public prose surface but not on disk`); continue }
  const raw = readFileSync(path, 'utf8')
  const text = rel.endsWith('.html') ? visibleText(raw) : raw
  for (const [re, label] of BANNED) {
    const m = text.match(re)
    if (m) note(`${rel}: BANNED overclaim — ${label} (matched "${m[0].trim()}")`)
  }
}

// React-rendered marketing copy (a curated set of demo-surface components).
// Comments are not shipped copy. Widening the population from a hand-list to a derived
// walk brought engineering prose into scope ("halt safely", "the anon key is safe to
// expose", "the bulletproof path"), and a gate that cries wolf on comments gets muted —
// which is how a stale population survives in the first place. Strip comments, keep
// strings and JSX text, so what is linted is what a visitor can actually read.
const codeCopy = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => {
      // Drop // comments, but not the // inside a string or a URL (https://…).
      let q = null
      for (let i = 0; i < line.length; i += 1) {
        const c = line[i]
        if (q) { if (c === '\\') i += 1; else if (c === q) q = null; continue }
        if (c === '"' || c === "'" || c === '`') { q = c; continue }
        if (c === '/' && line[i + 1] === '/') return line.slice(0, i)
      }
      return line
    })
    .join('\n')

// String-level exemptions, not file-level: a file-wide skip would blind the gate to every
// FUTURE overclaim in that file, which is the failure mode this whole change exists to fix.
// Each entry names the exact string and why it is not an Origin claim.
const EXEMPT = [
  // A scenario brief about a tote in the simulated warehouse — in-world object state, not
  // an assertion about Origin. It is also content-addressed into
  // docs/examples/warehouse.env-bundle.lock.json (env/env-manifest.test.ts pins the
  // policies digest), so rewording it would re-seal a signed evidence bundle to satisfy a
  // regex, with no semantic change to the policy.
  ['src/warehouse.ts', 'The item is safe, but the requested drop square is locked down for humans only.'],
]

for (const rel of REACT_COPY_GLOBS) {
  const path = join(WEB, rel)
  if (!existsSync(path)) continue
  let src = codeCopy(readFileSync(path, 'utf8'))
  for (const [file, phrase] of EXEMPT) if (file === rel) src = src.split(phrase).join(' ')
  for (const [re, label] of BANNED) {
    const m = src.match(re)
    if (m) note(`${rel} (React copy): BANNED overclaim — ${label} (matched "${m[0].trim()}")`)
  }
}

// An exemption that no longer matches is a silent hole — fail loudly so the list stays true.
for (const [file, phrase] of EXEMPT) {
  const path = join(WEB, file)
  if (!existsSync(path) || !readFileSync(path, 'utf8').includes(phrase)) {
    note(`${file}: STALE honesty-lint exemption — "${phrase.slice(0, 48)}…" no longer present; remove it`)
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
