#!/usr/bin/env node
// Two-implementation conformance — the SQL metrics must agree with the JavaScript analyzer.
//
// The JS analyzer in overGrant.mjs is the AUTHORITY (it is what the gated bench publishes). This
// script exists to keep the SQL honest: same seeded corpus, loaded into a relational store, five
// metrics recomputed as pure aggregates, compared field by field. A metric that disagrees between
// two independent implementations is a metric nobody should quote.
//
// DELIBERATELY OUTSIDE `npm run gates`. It needs `node:sqlite` (Node ≥ 22.5) and CI runs Node 20;
// wiring it into the gate would make the build fail on the runner for a reason unrelated to the
// code. It is a local/developer check, and it says so when it cannot run.
//
//   node sql/over-grant/conformance.mjs            # run it
//   node sql/over-grant/conformance.mjs --verbose  # print both implementations' numbers

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateCorpus, analyzeOverGrant, parseScope } from '../../overGrant.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const sql = (name) => readFileSync(join(HERE, name), 'utf8')

let DatabaseSync
try {
  ;({ DatabaseSync } = await import('node:sqlite'))
} catch {
  console.log(
    `over-grant SQL conformance: SKIPPED — node:sqlite is unavailable on ${process.version} (needs ≥ 22.5).\n` +
      '  The SQL under sql/over-grant/ is unverified in this environment. The JS analyzer is the authority\n' +
      '  and its own gate (`npm run bench:overgrant:check` in apps/origin-web) is unaffected.',
  )
  process.exit(0)
}

const SEED = 20260818
const ROOTS = 2000
const DEPTH = 4
const VERBOSE = process.argv.includes('--verbose')

const corpus = generateCorpus({ seed: SEED, roots: ROOTS, depth: DEPTH })
const js = analyzeOverGrant(corpus).metrics

// ── Load ─────────────────────────────────────────────────────────────────────
const db = new DatabaseSync(':memory:')
db.exec(sql('schema.sql'))

const insResource = db.prepare('INSERT INTO resources (id, classification, egress) VALUES (?, ?, ?)')
for (const r of corpus.resources) insResource.run(r.id, r.classification, r.egress ? 1 : 0)

// Parents are inserted before children: the generator emits depth-first from each root, so the
// natural order already satisfies the self-reference. Asserting it beats assuming it.
const insIdentity = db.prepare('INSERT INTO identities (id, parent, owner, tainted, granted_day, ttl_days) VALUES (?, ?, ?, ?, ?, ?)')
const insGrant = db.prepare('INSERT INTO grants (identity, scope, resource, capability) VALUES (?, ?, ?, ?)')
db.exec('BEGIN')
for (const i of corpus.identities) {
  insIdentity.run(i.id, i.parent, i.owner, i.tainted ? 1 : 0, i.granted_day, i.ttl_days)
  for (const s of i.granted) {
    const { resource, capability } = parseScope(s)
    insGrant.run(i.id, s, resource, capability)
  }
}
const insEvent = db.prepare('INSERT INTO events (day, identity, scope, decision) VALUES (?, ?, ?, ?)')
for (const e of corpus.events) insEvent.run(e.day, e.identity, e.scope, e.decision)
db.exec('COMMIT')

// ── Run ──────────────────────────────────────────────────────────────────────
const EFFECTIVE = sql('effective.sql').trimEnd()
const gur = db.prepare(sql('01-gur.sql')).get()
const bri = db.prepare(`${EFFECTIVE}\n${sql('02-bri.sql')}`).get()
const amv = db.prepare(sql('03-amv.sql')).get()
const trp = db.prepare(`${EFFECTIVE}\n${sql('04-trp.sql')}`).get()
const sahStmt = db.prepare(sql('05-sah.sql'))
sahStmt.setAllowBareNamedParameters(true)
const sah = sahStmt.get({ window: corpus.windowDays })

// ── Compare ──────────────────────────────────────────────────────────────────
const EPS = 1e-12
const checks = [
  ['GUR  scopes_granted', gur.scopes_granted, js.gur.scopesGranted],
  ['GUR  scopes_exercised', gur.scopes_exercised, js.gur.scopesExercised],
  ['GUR  fleet_gur', gur.fleet_gur, js.gur.fleetGur],
  ['BRI  sensitive_resources', bri.sensitive_resources, js.bri.sensitiveResources],
  ['BRI  mean_bri', bri.mean_bri, js.bri.meanBri],
  ['BRI  p95_bri', bri.p95_bri, js.bri.p95Bri],
  ['BRI  max_bri', bri.max_bri, js.bri.maxBri],
  ['AMV  delegation_edges', amv.delegation_edges, js.amv.delegationEdges],
  ['AMV  violating_edge_count', amv.violating_edge_count, js.amv.violatingEdgeCount],
  ['AMV  violating_scopes', amv.violating_scopes, js.amv.violatingScopes],
  ['AMV  violation_rate', amv.violation_rate, js.amv.violationRate],
  ['TRP  tainted_identities', trp.tainted_identities, js.trp.taintedIdentities],
  ['TRP  exposed_identities', trp.exposed_identities, js.trp.exposedIdentities],
  ['TRP  exposure_rate', trp.exposure_rate, js.trp.exposureRate],
  ['TRP  paths', trp.paths, js.trp.paths],
  ['SAH  scopes', sah.scopes, js.sah.scopes],
  ['SAH  exercised_scopes', sah.exercised_scopes, js.sah.exercisedScopes],
  ['SAH  median_staleness_ratio', sah.median_staleness_ratio, js.sah.medianStalenessRatio],
  ['SAH  median_span_to_ttl', sah.median_span_to_ttl, js.sah.medianSpanToTtl],
  ['SAH  dormant_scopes', sah.dormant_scopes, js.sah.dormantScopes],
]

let failed = 0
for (const [label, sqlValue, jsValue] of checks) {
  const agree = typeof jsValue === 'number' && typeof sqlValue === 'number' ? Math.abs(sqlValue - jsValue) <= EPS : sqlValue === jsValue
  if (!agree) {
    failed++
    console.error(`  MISMATCH  ${label}\n            sql = ${sqlValue}\n            js  = ${jsValue}`)
  } else if (VERBOSE) {
    console.log(`  ok  ${label.padEnd(28)} ${jsValue}`)
  }
}

const fleet = `${corpus.identities.length} identities / ${corpus.events.length} events (synthetic, seed ${SEED})`
if (failed > 0) {
  console.error(`over-grant SQL conformance: FAIL — ${failed}/${checks.length} fields disagree on ${fleet}.`)
  process.exit(1)
}
console.log(`over-grant SQL conformance: PASS — all ${checks.length} fields agree between SQL and JS on ${fleet}.`)
