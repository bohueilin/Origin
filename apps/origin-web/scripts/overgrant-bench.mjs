#!/usr/bin/env node
// over-grant bench — publishes the authorization-risk metric suite as a re-derivable artifact.
//
// Same contract as floor-gate-bench and fleet-bench: the committed JSON is a pure function of the
// seed, `--check` fails the build when the artifact drifts from the analyzer in source, and the diff
// IS the review artifact. Tier `free-bit` (EVALUATION-CONVENTIONS §5) — a third party recomputes it
// byte-for-byte with no key and no spend.
//
// The corpus is SYNTHETIC and says so in its own `scope` string. This measures the analyzer, not a
// fleet: nobody's real authorization data is described by this file.
//
//   node scripts/overgrant-bench.mjs           # write the artifact
//   node scripts/overgrant-bench.mjs --check   # fail if the committed artifact is stale

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runOverGrantBench } from '@origin/verifier-core/overGrant'

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(WEB, 'public', 'trust', 'over-grant-bench.json')

const SEED = 20260818
const ROOTS = 2000
const DEPTH = 4

const report = runOverGrantBench({ seed: SEED, roots: ROOTS, depth: DEPTH })
const serialized = `${JSON.stringify(report, null, 2)}\n`
const pct = (n) => `${(n * 100).toFixed(1)}%`

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : ''
  if (current !== serialized) {
    console.error('overgrant-bench: STALE — public/trust/over-grant-bench.json does not match the analyzer in source.')
    console.error('Run `node scripts/overgrant-bench.mjs` and commit the diff (the diff IS the review artifact).')
    process.exit(1)
  }
  console.log(`overgrant-bench: artifact matches source (digest ${report.digest.slice(0, 16)}…).`)
} else {
  // Regression gates run BEFORE the write. A metric suite that cannot recover its own planted
  // ground truth is not a measurement, and publishing it would be the exact failure this repo
  // exists to make impossible.
  const gt = report.groundTruth
  if (gt.amv.planted === 0) {
    console.error('overgrant-bench: FAIL — no attenuation violations were planted. A catch rate over an empty set proves nothing.')
    process.exit(1)
  }
  if (gt.amv.catchRate !== 1 || gt.amv.falsePositives !== 0) {
    console.error(
      `overgrant-bench: FAIL — AMV detection regressed (catch ${gt.amv.catchRate}, false positives ${gt.amv.falsePositives}). Refusing to publish.`,
    )
    process.exit(1)
  }
  if (!gt.dormant.exact) {
    console.error(
      `overgrant-bench: FAIL — dormant-scope count ${gt.dormant.measured} ≠ planted ${gt.dormant.planted}. The GUR denominator is wrong. Refusing to publish.`,
    )
    process.exit(1)
  }
  writeFileSync(OUT, serialized)
  const m = report.metrics
  console.log(
    `overgrant-bench: ${report.fleet.identities} identities / ${report.fleet.delegationEdges} delegation edges / ` +
      `${report.fleet.events} events (synthetic, seed ${SEED}) — ` +
      `over-grant surface ${pct(m.gur.overGrantSurface)}, mean blast radius ${pct(m.bri.meanBri)}, ` +
      `attenuation violations ${m.amv.violatingEdgeCount}/${m.amv.delegationEdges}, ` +
      `taint-exposed ${m.trp.exposedIdentities}/${m.trp.taintedIdentities} (${m.trp.paths} paths) — ` +
      `digest ${report.digest.slice(0, 16)}… → ${OUT}`,
  )
}
