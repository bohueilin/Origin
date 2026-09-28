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
import { visibleText, jsonLdText } from './lib/visible-text.mjs'
import { BANNED, checkText } from './lib/banned.mjs'
import { checkMediaCopy } from './lib/media-copy.mjs'
import { CARDS } from '../apps/origin-web/scripts/og-cards.mjs'

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

// 2. REQUIRED — a disclaimer that must survive on a given page. [file, regex, why].
const REQUIRED = [
  ['verify.html', /reproducible under this verifier/i,
    'the /verify scoping ("reproducible under this verifier," not "safe")'],
  ['index.html', /not (production|compliance)/i,
    'the home honesty line ("not production SaaS, and not compliance certification")'],
  ['proof.html', /honest ladder/i, 'the /proof "honest ladder" framing'],
]

// visibleText() (comments, scripts, styles and tags stripped) and jsonLdText() live in
// scripts/lib/visible-text.mjs, unit-tested by scripts/visible-text.test.mjs.

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
  const ld = jsonLdText(raw)
  for (const [surface, copy] of [[file, text], [`${file} <meta/title>`, meta], [`${file} <JSON-LD>`, ld]]) {
    for (const { label, match } of checkText(copy)) note(`${surface}: BANNED overclaim — ${label} (matched "${match}")`)
  }
}

// Extra public prose surfaces (llms.txt is plain text; the RSI dashboard is HTML).
for (const rel of EXTRA_PROSE) {
  const path = join(WEB, rel)
  if (!existsSync(path)) { note(`${rel}: MISSING — listed as a public prose surface but not on disk`); continue }
  const raw = readFileSync(path, 'utf8')
  const text = rel.endsWith('.html') ? visibleText(raw) : raw
  for (const { label, match } of checkText(text)) note(`${rel}: BANNED overclaim — ${label} (matched "${match}")`)
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
  for (const { label, match } of checkText(src)) note(`${rel} (React copy): BANNED overclaim — ${label} (matched "${match}")`)
}

// Text that will be rasterized is linted from its reproducible source.
const captionsDir = join(WEB, 'scripts/captions')
const captions = existsSync(captionsDir) ? readdirSync(captionsDir).filter(file => file.endsWith('.json')).sort().map(file => ({
  file: `scripts/captions/${file}`, data: JSON.parse(readFileSync(join(captionsDir, file), 'utf8')),
})) : []
for (const { surface, label, match } of checkMediaCopy({ cards: CARDS, cover: readFileSync(join(WEB, 'scripts/og-cover.html'), 'utf8'), captions })) {
  note(`${surface} (media copy): BANNED overclaim — ${label} (matched "${match}")`)
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
  // Visible text, not the raw file: a disclaimer kept alive only in a comment,
  // attribute or script is not on the page.
  if (!re.test(visibleText(readFileSync(path, 'utf8')))) {
    note(`${file}: REQUIRED disclaimer removed — ${why}`)
  }
}

// Launch-boundary contracts. These are deliberately file-specific instead of
// another bag of global banned words: phrases such as "Git integration" and
// "Origin-issued" are honest inside a negated explanation, but become release
// blockers when they advertise authority the public build does not have.
//
// Keep this population explicit. Unlike served entrypoints, these files have
// different roles (operator runbook, proposed API design, product disclosure),
// so adding a file is a conscious claim-boundary decision rather than a glob.
const launchSourceText = (rel) => {
  const raw = readFileSync(join(ROOT, rel), 'utf8')
  if (rel.endsWith('.html')) return `${visibleText(raw)}\n${metaAndTitleText(raw)}`
  if (/\.[jt]sx?$/.test(rel)) return codeCopy(raw)
  return raw
}

const LAUNCH_CONTRACTS = [
  {
    file: 'docs/CUTOVER.md',
    forbid: [
      [/\b11\s+Pages Functions\b/i, 'the retired eleven-function discovery claim'],
      [/\bPages\s+auto-detects?\b[\s\S]{0,100}\bFunctions?\b/i, 'automatic Pages Function discovery'],
      [/\bdeploys?\s+happen\s+via\s+the\s+Git integration\b/i, 'Git-triggered deployment'],
      [/\btrigger\s+a\s+deploy\s+from\s+main\b/i, 'automatic/Git cutover instructions'],
    ],
    require: [
      [/workflow_dispatch/i, 'the manual workflow entrypoint'],
      [/allowlist/i, 'the exact Pages Function allowlist boundary'],
      [/No\s+source change deploys automatically/i, 'the no-auto-deploy authority statement'],
    ],
  },
  {
    file: 'docs/DEPLOY.md',
    forbid: [
      [/\bPages\s+auto-detects?\b[\s\S]{0,100}\bFunctions?\b/i, 'automatic Pages Function discovery'],
      [/\bdeploys?\s+happen\s+via\s+the\s+Git integration\b/i, 'Git-triggered deployment'],
      [/\bConnected repo:\s*`?bohueilin\/Origin/i, 'a dashboard Git-source deployment path'],
    ],
    require: [
      [/workflow_dispatch/i, 'the manual workflow entrypoint'],
      [/allowlist/i, 'the Pages Function allowlist boundary'],
      [/refs\/heads\/main/i, 'the production-ref gate'],
    ],
  },
  {
    file: 'docs/api/origin-certify.openapi.yaml',
    forbid: [
      [/^servers:/m, 'a live server for the proposed API'],
      [/^\s{2}\/v1\/(?:certify|verify):/m, 'an advertised hosted operation'],
      [/certifyApi\.ts/i, 'the nonexistent implementation reference'],
    ],
    require: [
      [/^x-origin-status:\s*proposed-not-deployed\s*$/m, 'the proposed-not-deployed status'],
      [/^paths:\s*\{\}\s*$/m, 'an empty hosted path surface'],
    ],
  },
  {
    file: 'apps/origin-web/src/foundry/ui/FoundryApp.tsx',
    forbid: [
      [/VITE_FOUNDRY_UPLOADS_ENABLED\s*(?:\?\?|\|\|)\s*['"]true['"]/i, 'upload enabled by fallback default'],
      [/VITE_FOUNDRY_UPLOADS_ENABLED[\s\S]{0,40}!==\s*['"]false['"]/i, 'upload enabled unless explicitly disabled'],
    ],
    require: [
      [/VITE_FOUNDRY_UPLOADS_ENABLED\s*===\s*['"]true['"]/i, 'an explicit default-false upload UX opt-in'],
      [/leave (?:this|your) browser[\s\S]{0,100}Cerebras/i, 'the external-processing disclosure'],
      [/does not intentionally persist/i, 'the Origin handler non-persistence boundary'],
      [/personal[\s\S]{0,80}confidential[\s\S]{0,80}regulated[\s\S]{0,80}customer data/i, 'the sensitive-data prohibition'],
      [/local\/backend demo only/i, 'the disabled public-operation label'],
      [/legal\/privacy-policy\.html/i, 'the privacy-policy link'],
    ],
  },
  {
    file: 'apps/origin-web/foundry.html',
    require: [
      [/deterministic simulated evaluation/i, 'the simulated-evaluation boundary'],
      [/not robot training, deployment, or execution/i, 'the no-physical-execution boundary'],
    ],
  },
  {
    file: 'apps/origin-web/README.md',
    require: [
      [/browser-local sample/i, 'the public local-sample boundary'],
      [/(?:Cerebras[\s\S]{0,200}affirmative\s+(?:user\s+)?consent|affirmative\s+(?:user\s+)?consent[\s\S]{0,200}Cerebras)/i, 'the provider-and-consent disclosure'],
      [/does not intentionally persist/i, 'the Origin handler non-persistence boundary'],
      [/provider\s+terms and retention apply/i, 'the provider-retention boundary'],
      [/personal[\s\S]{0,80}confidential[\s\S]{0,80}regulated[\s\S]{0,80}customer\s+data/i, 'the sensitive-data prohibition'],
      [/not robot\s+training, deployment, or\s+execution/i, 'the simulated-evaluation boundary'],
    ],
  },
  {
    file: 'apps/origin-web/public/legal/privacy-policy.html',
    require: [
      [/Foundry image processing/i, 'the Foundry processing section'],
      [/Cerebras[\s\S]{0,160}affirmative consent/i, 'the provider-and-consent disclosure'],
      [/does not intentionally persist/i, 'the Origin handler non-persistence boundary'],
      [/provider terms and retention apply/i, 'the provider-retention boundary'],
      [/personal[\s\S]{0,80}confidential[\s\S]{0,80}regulated[\s\S]{0,80}customer data/i, 'the sensitive-data prohibition'],
    ],
  },
  {
    // The home page's boundaries: what the demo does not do, how its evidence verifies,
    // its maturity, and what the recorded VALID does not establish.
    file: 'apps/origin-web/index.html',
    require: [
      [/does not contact or execute/i, 'the no-contact / no-execution boundary'],
      [/untrusted by default/i, 'the untrusted-by-default browser-evidence boundary'],
      [/not (production|compliance)/i, 'the maturity line (not production SaaS or compliance certification)'],
      [/not signer identity/i, 'the recording caption scope (VALID is not signer identity)'],
    ],
  },
  {
    file: 'apps/origin-web/reference-check.html',
    forbid: [
      [/browser(?:-generated)?[^.]{0,100}\bis\s+(?:an?\s+)?Origin-issued/i, 'trusted Origin issuance for a browser-session signature'],
    ],
    require: [
      [/session-signed/i, 'session-signature provenance before the run'],
      [/synthetic/i, 'the synthetic evidence lane'],
      [/unpinned/i, 'the unpinned signer boundary'],
    ],
  },
]

for (const contract of LAUNCH_CONTRACTS) {
  const path = join(ROOT, contract.file)
  if (!existsSync(path)) {
    note(`${contract.file}: MISSING launch claim surface`)
    continue
  }
  const text = launchSourceText(contract.file)
  for (const [re, why] of contract.forbid ?? []) {
    const match = text.match(re)
    if (match) note(`${contract.file}: PROHIBITED launch claim — ${why} (matched "${match[0].trim()}")`)
  }
  for (const [re, why] of contract.require ?? []) {
    if (!re.test(text)) note(`${contract.file}: REQUIRED launch disclosure removed — ${why}`)
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
  console.log(`honesty-lint: clean — ${SERVED.length} served pages (prose + meta/title) + ${REACT_COPY_GLOBS.length} React copy files, ${CARDS.length} social cards + ${captions.length} caption files + cover template, ${BANNED.length} banned patterns, ${REQUIRED.length} required disclaimers, ${LAUNCH_CONTRACTS.length} launch contracts.`)
  process.exit(0)
}
console.log(`\nhonesty-lint: ${violations} violation(s). Keep claims scoped ("reproducible under this verifier," never "safe"/"correct").`)
process.exit(1)
