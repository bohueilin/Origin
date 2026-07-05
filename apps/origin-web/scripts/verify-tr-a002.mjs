// Verify TR-A002 — independently re-derive the hash chain of the published
// artifact and confirm nothing has been tampered with. This is the honest
// backbone of the "tamper-evident" claim: it recomputes every event_hash from
// the event's own bytes + the previous hash, checks the links, and confirms the
// sealed final_digest. Any edit to any event fails the check.
//
//   node scripts/verify-tr-a002.mjs
//   node scripts/verify-tr-a002.mjs path/to/tr-a002.json
//
// Exits non-zero on any mismatch.

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const FILE = process.argv[2] || resolve(HERE, '../public/proof/tr-a002.json')
const GENESIS = '0'.repeat(64)

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  }
  return JSON.stringify(value)
}
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

let failures = 0
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

const trace = JSON.parse(readFileSync(FILE, 'utf8'))
check('artifact is TR-A002', trace.artifact === 'TR-A002')
check('event_count matches events.length', trace.event_count === trace.events.length)
check('sandbox flag set at trace level', trace.sandbox === true)

let prev = GENESIS
let ok = true
for (const e of trace.events) {
  // strip the stored event_hash, recompute over the remaining canonical bytes.
  const { event_hash, ...payload } = e
  if (payload.prev_hash !== prev) {
    console.log(`FAIL  event ${e.seq} prev_hash link (${payload.prev_hash} != ${prev})`)
    failures++
    ok = false
  }
  const recomputed = sha256(canonical(payload))
  if (recomputed !== event_hash) {
    console.log(`FAIL  event ${e.seq} event_hash (${recomputed} != ${event_hash})`)
    failures++
    ok = false
  }
  prev = event_hash
}
check('every event hash + prev_hash link verifies', ok)

const last = trace.events[trace.events.length - 1]
check('sealing event is evidence.digest_sealed', last.action === 'evidence.digest_sealed')
check('final_digest == sealing event hash', trace.final_digest === last.event_hash)
check(
  'log_digest recomputes',
  trace.log_digest === sha256(canonical(trace.events.map((e) => e.event_hash))),
)
check('every event carries sandbox:true', trace.events.every((e) => e.sandbox === true))
check('no side effect claims live money', trace.events.every((e) => !e.side_effect || e.side_effect.live_money !== true))

console.log(
  failures === 0
    ? `\nALL CHECKS PASSED — TR-A002 hash chain verified (${trace.events.length} events, digest ${trace.final_digest.slice(0, 12)}…)`
    : `\n${failures} CHECK(S) FAILED`,
)
process.exit(failures === 0 ? 0 : 1)
