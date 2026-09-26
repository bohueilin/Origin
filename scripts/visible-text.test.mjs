// Unit tests for scripts/lib/visible-text.mjs (the honesty-lint text extractors).
// Run: node --test scripts/visible-text.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { visibleText, jsonLdText } from './lib/visible-text.mjs'

// The home page's required disclaimer (index.html #offer).
const DISCLAIMER = 'The public demo is a prototype, not production SaaS or compliance certification.'
const REQUIRED_HOME = /not (production|compliance)/i

test('a disclaimer inside an HTML comment is not visible text', () => {
  const html = `<main><p class="cin-small"><!-- ${DISCLAIMER} --></p></main>`
  assert.doesNotMatch(visibleText(html), REQUIRED_HOME)
})

test('the same disclaimer in the page body is visible text', () => {
  const html = `<main><p class="cin-small">${DISCLAIMER}</p></main>`
  assert.match(visibleText(html), REQUIRED_HOME)
})

test('JSON-LD string values are extracted so the ban list can see them', () => {
  const html = `<head><script type="application/ld+json">
    { "@context": "https://schema.org", "@graph": [
      { "@type": "SoftwareApplication", "description": "Verify every result without trusting us." }
    ] }
  </script></head>`
  // The same pattern scripts/honesty-lint.mjs bans.
  assert.match(jsonLdText(html), /\bwithout trusting us\b/i)
  // visibleText strips every <script>, which is why jsonLdText exists.
  assert.doesNotMatch(visibleText(html), /without trusting us/i)
})

test('a JSON-LD block that does not parse is still linted, raw', () => {
  const html = '<script type="application/ld+json">{ "description": "without trusting us", }</script>'
  assert.match(jsonLdText(html), /\bwithout trusting us\b/i)
})
