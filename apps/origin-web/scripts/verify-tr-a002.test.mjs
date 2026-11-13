// Tamper test for scripts/verify-tr-a002.mjs. The published TR-A002 file passes; a copy with
// one event field edited fails; a copy with the top-level label edited still passes, because
// the file's top-level description (type, label, policy text and other descriptive fields)
// is outside the hash chain, as /proof states. Edited copies go to the OS temp folder only:
// nothing under public/proof/ is ever written.
//
//   node --test scripts/verify-tr-a002.test.mjs   (npm run proof:verify:test)
import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const VERIFY = join(HERE, 'verify-tr-a002.mjs')
const PUBLISHED = resolve(HERE, '../public/proof/tr-a002.json')
const TMP = mkdtempSync(join(tmpdir(), 'tr-a002-test-'))

const verify = (...args) => spawnSync(process.execPath, [VERIFY, ...args], { encoding: 'utf8' })
const editedCopy = (name, edit) => {
  const trace = JSON.parse(readFileSync(PUBLISHED, 'utf8'))
  edit(trace)
  const file = join(TMP, name)
  writeFileSync(file, JSON.stringify(trace, null, 2))
  return file
}

// gates-all.sh reads the last "N passed" line as the suite's detail; node --test alone ends
// on a duration line.
const TOTAL = 3
let passed = 0
after(() => {
  rmSync(TMP, { recursive: true, force: true })
  console.log(passed === TOTAL ? `${passed} passed` : `${passed} passed, ${TOTAL - passed} failed`)
})

test('the published TR-A002 file verifies', () => {
  const r = verify()
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /ALL CHECKS PASSED/)
  passed += 1
})

test('an edited event field fails the chain (exit 1)', () => {
  const file = editedCopy('edited-event.json', (trace) => {
    assert.equal(trace.events[0].side_effect.amount_usd, 480)
    trace.events[0].side_effect.amount_usd = 481
  })
  const r = verify(file)
  assert.equal(r.status, 1, r.stdout + r.stderr)
  assert.match(r.stdout, /^FAIL {2}event 1 event_hash/m)
  assert.match(r.stdout, /^2 CHECK\(S\) FAILED$/m)
  assert.doesNotMatch(r.stdout, /ALL CHECKS PASSED/)
  passed += 1
})

test('an edited top-level label still verifies: the description is outside the chain', () => {
  const file = editedCopy('edited-label.json', (trace) => {
    assert.equal(typeof trace.label, 'string')
    trace.label = 'Edited outside the chain.'
  })
  const r = verify(file)
  assert.equal(r.status, 0, r.stdout + r.stderr)
  assert.match(r.stdout, /ALL CHECKS PASSED/)
  passed += 1
})
