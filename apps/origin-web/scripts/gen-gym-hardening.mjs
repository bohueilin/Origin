// Reproducible evidence of the self-hardening environment (the moat's network effect).
// Emits public/rsi/gym-hardening.json: a young gym starts blind to over-granting agents,
// then every reference check that surfaces an over-grant adds an ORACLE-LABELED case,
// versioned into the battery — robustness climbs, the library grows, old certs stay
// reproducible under their pinned battery version. Run: node scripts/gen-gym-hardening.mjs
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { iamTasks } from '@origin/verifier-core/iamGym'
import { hardenToFixedPoint, gymRobustness, batteryDigest, overGrantFamily } from '@origin/verifier-core/gymHardening'

const HERE = dirname(fileURLToPath(import.meta.url))
const OUT = resolve(HERE, '../public/rsi/gym-hardening.json')

const seed = iamTasks.slice(0, 1) // a young gym: one benign allow-case
const family = overGrantFamily()
// Incremental: 1 hole/round models one customer surfacing one over-grant at a time.
const res = hardenToFixedPoint(seed, undefined, family, 40, 1)

const artifact = {
  what: 'Self-hardening IAM gym — the compounding moat. The deterministic oracle is the only label authority.',
  scope: 'Reproducible under this verifier; synthetic adversarial battery. Not a safety claim.',
  adversarial_family: family.map((f) => f.name),
  seed: { size: seed.length, digest: batteryDigest(seed), robustness: gymRobustness(seed, family).robustness },
  final: {
    size: res.battery.length,
    version: res.version,
    digest: res.final_digest,
    robustness: res.final_robustness,
    cases_added: res.ledger.length,
  },
  curve: res.curve,
  ledger: res.ledger,
  reproduce: 'node apps/origin-web/scripts/gen-gym-hardening.mjs',
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify(artifact, null, 2) + '\n')
console.log(
  `gym-hardening: robustness ${artifact.seed.robustness.toFixed(2)} -> ${artifact.final.robustness.toFixed(2)} ` +
    `over ${res.curve.length} rounds, +${artifact.final.cases_added} oracle-labeled cases (battery ${seed.length} -> ${res.battery.length}). ` +
    `digest ${artifact.seed.digest.slice(0, 8)} -> ${artifact.final.digest.slice(0, 8)}. wrote public/rsi/gym-hardening.json`,
)
