#!/usr/bin/env node
/**
 * css-version-lint — the cache-busting version must track home.css's CONTENT.
 *
 * WHY THIS EXISTS. `public/home.css` is served with
 * `cache-control: public, max-age=31536000, immutable` — a one-year, never-
 * revalidate cache keyed on the URL. The only thing that makes a returning
 * visitor fetch new CSS is a change to the `?v=` query in the <link>.
 *
 * On 2026-08-03 home.css changed and `?v=23` did not. Result: every returning
 * visitor received NEW HTML (which contains a mobile-only CTA) against OLD CSS
 * (which lacks the rule that hides it on desktop) and saw TWO "Run reference
 * check" buttons in the header. The server was correct; the browsers were not.
 *
 * Rather than trusting a human to remember, the version IS the content hash:
 * change the CSS and this fails until every <link> is updated. Run with --fix
 * to rewrite them.
 *
 *   node scripts/css-version-lint.mjs         # check (CI gate)
 *   node scripts/css-version-lint.mjs --fix   # rewrite every reference
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname, resolve } from 'node:path'

const WEB = resolve(dirname(new URL(import.meta.url).pathname), '..')
const CSS = join(WEB, 'public', 'home.css')
const FIX = process.argv.includes('--fix')

const expected = createHash('sha256').update(readFileSync(CSS)).digest('hex').slice(0, 8)

// Every HTML file that can link the stylesheet: app roots + anything under public/.
const files = [
  ...readdirSync(WEB).filter((f) => f.endsWith('.html')).map((f) => join(WEB, f)),
  ...(existsSync(join(WEB, 'public'))
    ? readdirSync(join(WEB, 'public'), { recursive: true })
        .filter((f) => String(f).endsWith('.html'))
        .map((f) => join(WEB, 'public', String(f)))
    : []),
]

const RE = /home\.css\?v=([A-Za-z0-9]+)/g
let stale = []
let fixed = 0

for (const path of files) {
  const before = readFileSync(path, 'utf8')
  if (!before.includes('home.css?v=')) continue
  const versions = [...before.matchAll(RE)].map((m) => m[1])
  const bad = versions.filter((v) => v !== expected)
  if (!bad.length) continue
  if (FIX) {
    writeFileSync(path, before.replace(RE, `home.css?v=${expected}`))
    fixed += 1
  } else {
    stale.push(`${path.replace(WEB + '/', '')} → ?v=${[...new Set(bad)].join(',')}`)
  }
}

if (FIX) {
  console.log(`css-version-lint: rewrote ${fixed} file(s) to ?v=${expected}`)
  process.exit(0)
}
if (stale.length) {
  console.error(`css-version-lint: FAIL — home.css hashes to ${expected}, but these still point elsewhere:`)
  for (const s of stale) console.error(`  ✗ ${s}`)
  console.error('\nReturning visitors would keep the OLD cached CSS against your NEW HTML.')
  console.error('Fix: node scripts/css-version-lint.mjs --fix')
  process.exit(1)
}
console.log(`css-version-lint: clean — every home.css reference is ?v=${expected} (content hash).`)
