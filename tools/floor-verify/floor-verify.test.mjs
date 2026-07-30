// Self-tests for floor-verify — `node --test` in this directory, zero install.
//
// Updated after the adversarial review confirmed three defects in v1:
//   * "VERIFIED — bound to the included proposal" printed with NO proposal in
//     the file (binding never checked);
//   * an invented receipt whose body was effectively empty passed shape;
//   * site_map (the floor a human actually reads) was bound by no digest, so
//     verdict-flipping edits still said VERIFIED.
// These tests pin the fixes: strict shape, map_digest binding, and summaries
// that claim exactly what ran.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonical, sha256, verifyEvidence } from './floor-verify.mjs'

const rawProposal = { width: 8, height: 8, start: { x: 4, y: 7 }, item: { x: 1, y: 3 }, drop: { x: 6, y: 3 }, obstacles: [{ x: 2, y: 2 }], hazards: [{ x: 3, y: 4 }], humanOnly: [] }
const siteMap = { ...rawProposal, robots: [] }

function makeEvidence() {
  const input_digest = sha256(canonical(rawProposal))
  const map_digest = sha256(canonical(siteMap))
  const body = { kind: 'floor-parse-receipt', schema_version: '1.1.0', verifier: 'parseGate@1', verdict: 'VALID', code: 0, input_digest, map_digest }
  return { receipt: { ...body, receipt_digest: sha256(canonical(body)) }, raw_proposal: rawProposal, site_map: siteMap }
}

test('canonical JSON sorts keys and drops undefined (parity with parseGate)', () => {
  assert.equal(canonical({ b: 1, a: 2 }), '{"a":2,"b":1}')
  assert.equal(canonical({ a: undefined, b: 1 }), '{"b":1}')
  assert.equal(canonical([1, undefined, 'x']), '[1,null,"x"]')
  assert.equal(canonical(null), 'null')
})

test('a well-formed evidence file verifies fully: integrity + input binding + map binding', () => {
  const { ok, bound, checks } = verifyEvidence(makeEvidence())
  assert.equal(ok, true)
  assert.equal(bound, true)
  assert.equal(checks.every((c) => c.pass), true)
})

test('an edited verdict fails receipt_integrity', () => {
  const ev = makeEvidence()
  ev.receipt.verdict = 'VOID'
  const { ok, checks } = verifyEvidence(ev)
  assert.equal(ok, false)
  assert.equal(checks.find((c) => c.name === 'receipt_integrity').pass, false)
})

test('a swapped proposal fails input_binding', () => {
  const ev = makeEvidence()
  ev.raw_proposal = { ...rawProposal, start: { x: 0, y: 0 } }
  const { ok, checks } = verifyEvidence(ev)
  assert.equal(ok, false)
  assert.equal(checks.find((c) => c.name === 'input_binding').pass, false)
})

test('THE REVIEW ATTACK: an edited site_map (deleted hazards) now fails map_binding', () => {
  const ev = makeEvidence()
  ev.site_map = { ...siteMap, hazards: [] } // the tamper that previously still said VERIFIED
  const { ok, checks } = verifyEvidence(ev)
  assert.equal(ok, false)
  assert.equal(checks.find((c) => c.name === 'map_binding').pass, false)
})

test('an invented receipt with an empty body fails SHAPE, not just integrity', () => {
  // sha256(canonical({})) — self-consistent digest over nothing. v1 accepted this.
  const forged = { receipt: { receipt_digest: sha256(canonical({})) } }
  const { ok, checks } = verifyEvidence(forged)
  assert.equal(ok, false)
  assert.equal(checks.find((c) => c.name === 'shape').pass, false)
})

test('missing receipt is a shape failure, not a crash', () => {
  assert.equal(verifyEvidence({}).ok, false)
  assert.equal(verifyEvidence(null).ok, false)
})

test('a file without raw_proposal/site_map is integrity-only: ok but NOT bound, and says so', () => {
  const ev = makeEvidence()
  delete ev.raw_proposal
  delete ev.site_map
  const { ok, bound, summary } = verifyEvidence(ev)
  assert.equal(ok, true)
  assert.equal(bound, false)
  assert.match(summary, /integrity/i)
  assert.match(summary, /NOT checked/i)
  assert.doesNotMatch(summary, /VERIFIED — receipt intact, bound/)
})

test('the fully-verified summary states exactly what is and is not covered', () => {
  const { summary } = verifyEvidence(makeEvidence())
  assert.match(summary, /VERIFIED/)
  assert.match(summary, /raw proposal/i)
  assert.match(summary, /map/i)
  assert.match(summary, /oracle text|display-only/i) // names the unbound remainder
})
