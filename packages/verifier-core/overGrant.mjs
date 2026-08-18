// Over-grant analyzer — deterministic authorization-risk metrics over an agent RPC / tool-call log.
// =============================================================================
// Sibling of iamGym.mjs, pointed the other way round. The IAM gym scores a POLICY against a fixed
// battery of decisions ("would this agent decide correctly?"). The over-grant analyzer scores
// OBSERVED AUTHORITY against what was actually exercised ("how much authority is this fleet holding
// that it never uses — and what could it reach if one identity were hijacked?").
//
// Everything here is a pure function of a SEEDED SYNTHETIC corpus: no clock, no RNG, no network,
// no I/O. The corpus is synthetic and is labeled synthetic in every artifact it produces. This is
// a measurement instrument demonstrated on generated data — never a claim about a real fleet.
//
// Five metrics. Each carries an explicit denominator, because the denominator is the whole craft:
// a utilization number without one is a vibe, and a fleet that reports mean-of-ratios can hide a
// thousand dormant scopes behind one busy agent.
//
//   GUR  Grant-Utilization Ratio    distinct scopes exercised ÷ scopes granted AT WINDOW START
//   BRI  Blast-Radius Index         sensitive resources reachable ÷ sensitive resources in scope
//   AMV  Attenuation-Monotonicity   delegation edges where the child's scope set ⊄ the parent's
//   TRP  Taint-Reachability         tainted identities holding BOTH sensitive read and egress
//   SAH  Standing-Authority Half-Life  of the authority in USE, age-of-last-use ÷ TTL and span ÷ TTL
//
// The coupling that makes this more than a dashboard: effective authority is an identity's own
// grants UNION its delegation descendants'. Under a correct attenuating capability token the union
// is a no-op (a child can only narrow). So a single monotonicity violation three hops down widens
// the blast radius measured AT THE ROOT — AMV is not a hygiene metric, it is the integrity
// precondition that makes BRI and TRP mean anything.
// =============================================================================

import { canonical, sha256 } from '@origin/evidence/env-evidence'

export const OVER_GRANT_VERSION = 'over-grant-v1'
export const OVER_GRANT_VERSIONS = { analyzer_version: 'over-grant-analyzer-v1', corpus_version: 'over-grant-corpus-v1' }

export const CAPABILITIES = ['read', 'write', 'execute', 'export', 'delete']

// The resource catalogue. `egress` marks a resource that can move bytes OUT of the trust boundary —
// the third leg of the lethal trifecta, and the only reason a sensitive read is an exfiltration risk
// rather than a private one.
//                     id                      classification  egress
const RESOURCE_SPECS = [
  ['dashboards', 'low', false],
  ['docs-public', 'low', false],
  ['ticket', 'medium', false],
  ['billing', 'medium', false],
  ['refund', 'medium', false],
  ['inventory', 'medium', false],
  ['crm', 'medium', false],
  ['build-logs', 'low', false],
  ['payroll', 'high', false],
  ['customer-pii', 'high', false],
  ['ledger', 'high', false],
  ['wire-transfer', 'high', false],
  ['source-secrets', 'high', false],
  ['hr-records', 'high', false],
  ['prod-db', 'forbidden', false],
  ['audit-log', 'forbidden', false],
  ['email-send', 'medium', true],
  ['webhook-out', 'medium', true],
  ['slack-post', 'medium', true],
  ['object-store-public', 'high', true],
]

export const resources = RESOURCE_SPECS.map(([id, classification, egress]) => ({ id, classification, egress }))
const RESOURCE_BY_ID = new Map(resources.map((r) => [r.id, r]))

export const isSensitive = (resource) => resource.classification === 'high' || resource.classification === 'forbidden'
const SENSITIVE_IDS = resources.filter(isSensitive).map((r) => r.id)
const EGRESS_IDS = resources.filter((r) => r.egress).map((r) => r.id)

export const scopeOf = (resourceId, capability) => `${resourceId}:${capability}`
export const parseScope = (scope) => {
  const i = scope.indexOf(':')
  return { resource: scope.slice(0, i), capability: scope.slice(i + 1) }
}

// ── Deterministic PRNG ───────────────────────────────────────────────────────
// mulberry32. Seeded, no Math.random, no clock — the whole corpus is a pure function of the seed,
// which is what lets the bench re-derive byte-identically (`free-bit` tier, EVALUATION-CONVENTIONS §5).
function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length]
const chance = (rng, p) => rng() < p

// ── Corpus generation ────────────────────────────────────────────────────────
/**
 * Generate a synthetic agent fleet + its RPC/tool-call log.
 *
 * The generator plants a KNOWN ground truth so the analyzer can be scored rather than merely run:
 *   · `planted.violationEdges` — delegation edges deliberately widened (the AMV detection target)
 *   · `planted.dormantScopes`  — scopes granted and, by construction, never exercised (the GUR target)
 * A metric you cannot score against ground truth is a dashboard, not a verifier.
 *
 * @param seed          integer seed — the corpus is a pure function of it
 * @param roots         number of root identities (no parent)
 * @param depth         maximum delegation depth below a root
 * @param windowDays    length of the observation window
 * @param violationRate fraction of delegation edges deliberately widened
 */
export function generateCorpus({ seed = 20260818, roots = 40, depth = 3, windowDays = 30, violationRate = 0.06 } = {}) {
  const rng = mulberry32(seed)
  const identities = []
  const planted = { violationEdges: [], dormantScopes: [] }

  const mintScopeSet = (rng_, size, pool) => {
    const out = new Set()
    let guard = 0
    while (out.size < size && guard++ < size * 12) out.add(pick(rng_, pool))
    return [...out].sort()
  }

  const ALL_SCOPES = resources.flatMap((r) => CAPABILITIES.map((c) => scopeOf(r.id, c)))

  const build = (parent, level, index) => {
    const id = parent ? `${parent.id}.${index}` : `agent-${String(index).padStart(3, '0')}`
    // Roots hold a broad grant; children attenuate to a subset of the parent — except on a planted
    // violation edge, where the child receives a scope the parent never held.
    let granted
    let violates = false
    if (!parent) {
      granted = mintScopeSet(rng, 6 + Math.floor(rng() * 10), ALL_SCOPES)
    } else {
      const keep = Math.max(1, Math.floor(parent.granted.length * (0.35 + rng() * 0.45)))
      granted = mintScopeSet(rng, keep, parent.granted)
      if (chance(rng, violationRate)) {
        const outside = ALL_SCOPES.filter((s) => !parent.granted.includes(s))
        if (outside.length > 0) {
          granted = [...new Set([...granted, pick(rng, outside)])].sort()
          violates = true
        }
      }
    }

    const identity = {
      id,
      parent: parent ? parent.id : null,
      owner: `human-${String((index % 17) + 1).padStart(2, '0')}`,
      // "tainted" = this identity processed untrusted content in the window. It is a property of the
      // identity tracked OUTSIDE the model's context, exactly as Cordon does it.
      tainted: chance(rng, 0.18),
      granted,
      granted_day: 0, // the whole fleet is granted at window start; no mid-window grant to exclude
      ttl_days: pick(rng, [7, 30, 90, 365]),
    }
    identities.push(identity)
    if (violates) planted.violationEdges.push(id)

    if (level < depth) {
      const children = Math.floor(rng() * 3)
      for (let i = 0; i < children; i++) build(identity, level + 1, i)
    }
    return identity
  }

  for (let i = 0; i < roots; i++) build(null, 0, i)

  // The log. Each identity exercises a fraction of its grant; the remainder is dormant by
  // construction and is recorded as planted ground truth for GUR.
  const events = []
  for (const identity of identities) {
    const useRate = 0.12 + rng() * 0.5
    for (const scope of identity.granted) {
      if (chance(rng, useRate)) {
        const uses = 1 + Math.floor(rng() * 6)
        for (let u = 0; u < uses; u++) {
          events.push({ day: Math.floor(rng() * windowDays), identity: identity.id, scope, decision: 'allow' })
        }
      } else {
        planted.dormantScopes.push(`${identity.id}|${scope}`)
      }
    }
    // A few attempts OUTSIDE the grant — the gate refuses them. They must never count as
    // utilization: an identity does not "use" authority it was denied.
    if (chance(rng, 0.3)) {
      const outside = ALL_SCOPES.filter((s) => !identity.granted.includes(s))
      if (outside.length > 0) {
        events.push({ day: Math.floor(rng() * windowDays), identity: identity.id, scope: pick(rng, outside), decision: 'deny' })
      }
    }
  }

  events.sort((a, b) => a.day - b.day || a.identity.localeCompare(b.identity) || a.scope.localeCompare(b.scope))
  planted.violationEdges.sort()
  planted.dormantScopes.sort()

  return { seed, windowDays, resources, identities, events, planted }
}

// ── Delegation graph ─────────────────────────────────────────────────────────
function childrenIndex(identities) {
  const kids = new Map()
  for (const i of identities) {
    if (!i.parent) continue
    if (!kids.has(i.parent)) kids.set(i.parent, [])
    kids.get(i.parent).push(i.id)
  }
  return kids
}

/**
 * Effective authority = own grants ∪ every descendant's grants, transitively.
 *
 * Under a correct attenuating capability token the union is a no-op. It is NOT a no-op exactly when
 * an attenuation-monotonicity violation exists somewhere below — which is why BRI and TRP are
 * computed over effective authority rather than direct grants, and why AMV gates their meaning.
 */
export function effectiveScopes(corpus) {
  const byId = new Map(corpus.identities.map((i) => [i.id, i]))
  const kids = childrenIndex(corpus.identities)
  const memo = new Map()
  const walk = (id) => {
    if (memo.has(id)) return memo.get(id)
    const self = byId.get(id)
    const out = new Set(self.granted)
    memo.set(id, out) // set before recursing: the forest is acyclic, this just bounds re-entry
    for (const child of kids.get(id) ?? []) for (const s of walk(child)) out.add(s)
    return out
  }
  const result = new Map()
  for (const i of corpus.identities) result.set(i.id, walk(i.id))
  return result
}

// ── The five metrics ─────────────────────────────────────────────────────────

/**
 * GUR — Grant-Utilization Ratio.
 *
 * Numerator: distinct scopes the identity exercised with an ALLOW in the window. A DENY is not use.
 * Denominator: scopes granted at or before window start. Grants minted mid-window are excluded so a
 * fresh grant is not scored as waste before it has had a chance to be used. (This corpus grants the
 * whole fleet at day 0, so nothing is excluded here — the rule exists for when real logs arrive.)
 *
 * The FLEET number is Σnumerator ÷ Σdenominator, deliberately NOT the mean of per-identity ratios:
 * mean-of-ratios lets one busy 3-scope agent cancel out a dormant 60-scope one.
 */
export function grantUtilization(corpus) {
  const used = new Map()
  for (const e of corpus.events) {
    if (e.decision !== 'allow') continue
    if (!used.has(e.identity)) used.set(e.identity, new Set())
    used.get(e.identity).add(e.scope)
  }
  let grantedTotal = 0
  let usedTotal = 0
  const perIdentity = []
  for (const i of corpus.identities) {
    const denom = i.granted.filter(() => i.granted_day <= 0).length
    const num = [...(used.get(i.id) ?? [])].filter((s) => i.granted.includes(s)).length
    grantedTotal += denom
    usedTotal += num
    perIdentity.push({ id: i.id, granted: denom, used: num, gur: denom === 0 ? 1 : num / denom })
  }
  perIdentity.sort((a, b) => a.id.localeCompare(b.id))
  const fleetGur = grantedTotal === 0 ? 1 : usedTotal / grantedTotal
  return {
    scopesGranted: grantedTotal,
    scopesExercised: usedTotal,
    fleetGur,
    overGrantSurface: 1 - fleetGur, // the headline: the share of granted authority never exercised
    perIdentity,
  }
}

/**
 * BRI — Blast-Radius Index.
 *
 * Numerator: distinct SENSITIVE resources (high | forbidden) touchable under effective authority.
 * Denominator: sensitive resources in the catalogue. Normalized so a fleet of 20 and a fleet of
 * 20,000 resources are comparable — an absolute count is not a rate and cannot carry an SLO.
 */
export function blastRadius(corpus, eff = effectiveScopes(corpus)) {
  const per = []
  for (const i of corpus.identities) {
    const reach = new Set()
    for (const s of eff.get(i.id)) {
      const { resource } = parseScope(s)
      const r = RESOURCE_BY_ID.get(resource)
      if (r && isSensitive(r)) reach.add(resource)
    }
    per.push({ id: i.id, reachable: reach.size, bri: SENSITIVE_IDS.length === 0 ? 0 : reach.size / SENSITIVE_IDS.length })
  }
  per.sort((a, b) => a.id.localeCompare(b.id))
  const sorted = [...per].map((p) => p.bri).sort((a, b) => a - b)
  const at = (q) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))])
  return {
    sensitiveResources: SENSITIVE_IDS.length,
    meanBri: sorted.length === 0 ? 0 : sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p95Bri: at(0.95),
    maxBri: at(1),
    perIdentity: per,
  }
}

/**
 * AMV — Attenuation-Monotonicity Violations.
 *
 * A delegation edge is sound iff child.granted ⊆ parent.granted. Under a macaroon/biscuit-style
 * attenuating token this holds BY CONSTRUCTION and this metric reads a structural zero. Measuring it
 * anyway is the point: it is the difference between "our design makes escalation impossible" and
 * "our design makes escalation impossible, and here is the number that says it held in production."
 */
export function attenuationViolations(corpus) {
  const byId = new Map(corpus.identities.map((i) => [i.id, i]))
  const violatingEdges = []
  let violatingScopes = 0
  let edges = 0
  for (const i of corpus.identities) {
    if (!i.parent) continue
    edges++
    const parent = byId.get(i.parent)
    const widened = i.granted.filter((s) => !parent.granted.includes(s))
    if (widened.length > 0) {
      violatingEdges.push({ child: i.id, parent: parent.id, widened: widened.sort() })
      violatingScopes += widened.length
    }
  }
  violatingEdges.sort((a, b) => a.child.localeCompare(b.child))
  return {
    delegationEdges: edges,
    violatingEdges,
    violatingEdgeCount: violatingEdges.length,
    violatingScopes,
    violationRate: edges === 0 ? 0 : violatingEdges.length / edges,
  }
}

/**
 * TRP — Taint-Reachability.
 *
 * An identity is exfiltration-exposed when all three legs of the lethal trifecta meet on it:
 * it processed untrusted content (tainted), it can READ a sensitive resource, and it holds a
 * capability on an egress-capable resource. Computed over EFFECTIVE authority, so a delegation
 * descendant's egress grant counts against its ancestor — which is how real exfil paths are built.
 *
 * `paths` is the product (sensitive readable × egress writable) per exposed identity: the count of
 * distinct source→sink pairs, i.e. the surface, not merely the headcount.
 */
export function taintReachability(corpus, eff = effectiveScopes(corpus)) {
  const exposed = []
  let paths = 0
  for (const i of corpus.identities) {
    if (!i.tainted) continue
    const sensitiveReads = new Set()
    const egressWrites = new Set()
    for (const s of eff.get(i.id)) {
      const { resource, capability } = parseScope(s)
      const r = RESOURCE_BY_ID.get(resource)
      if (!r) continue
      if (isSensitive(r) && (capability === 'read' || capability === 'export')) sensitiveReads.add(resource)
      if (r.egress && capability !== 'read') egressWrites.add(resource)
    }
    if (sensitiveReads.size > 0 && egressWrites.size > 0) {
      const p = sensitiveReads.size * egressWrites.size
      paths += p
      exposed.push({ id: i.id, sensitiveReads: [...sensitiveReads].sort(), egressWrites: [...egressWrites].sort(), paths: p })
    }
  }
  exposed.sort((a, b) => a.id.localeCompare(b.id))
  const taintedCount = corpus.identities.filter((i) => i.tainted).length
  return {
    taintedIdentities: taintedCount,
    exposedIdentities: exposed.length,
    exposureRate: taintedCount === 0 ? 0 : exposed.length / taintedCount,
    paths,
    exposed,
  }
}

/**
 * SAH — Standing-Authority Half-Life.
 *
 * Scoped deliberately to the scopes that WERE exercised. A never-used scope is already GUR's
 * subject; counting it here too would make SAH's headline algebraically identical to (1 − GUR) and
 * cost us a metric. Two numbers that are the same number are one number wearing a hat.
 *
 * So SAH asks the question GUR cannot: of the authority that IS legitimately in use, how much
 * longer does the credential live than the work needs?
 *   · `medianStalenessRatio` — age-of-last-use ÷ TTL. High = the grant outlives its usefulness.
 *   · `medianSpanToTtl`      — (last use − first use) ÷ TTL. This is the just-in-time conversion
 *      signal: a scope whose entire working life is 2 days behind a 365-day TTL is standing
 *      authority that could be minted on demand with zero developer impact.
 *
 * `dormantScopes` is carried as a labeled CROSS-REFERENCE, not a sixth metric: it is GUR's
 * complement by construction, and it is what the ground-truth check asserts exactness against.
 */
export function standingAuthority(corpus) {
  const firstUse = new Map()
  const lastUse = new Map()
  for (const e of corpus.events) {
    if (e.decision !== 'allow') continue
    const k = `${e.identity}|${e.scope}`
    if (!lastUse.has(k) || e.day > lastUse.get(k)) lastUse.set(k, e.day)
    if (!firstUse.has(k) || e.day < firstUse.get(k)) firstUse.set(k, e.day)
  }
  const staleness = []
  const spans = []
  let dormant = 0
  let total = 0
  for (const i of corpus.identities) {
    for (const s of i.granted) {
      total++
      const k = `${i.id}|${s}`
      const seen = lastUse.get(k)
      if (seen === undefined) {
        dormant++
        continue // never used → GUR's subject, not SAH's
      }
      staleness.push((corpus.windowDays - seen) / i.ttl_days)
      spans.push((seen - firstUse.get(k)) / i.ttl_days)
    }
  }
  const median = (arr) => {
    if (arr.length === 0) return 0
    const s = [...arr].sort((a, b) => a - b)
    return s[Math.floor((s.length - 1) / 2)]
  }
  return {
    scopes: total,
    exercisedScopes: staleness.length,
    medianStalenessRatio: median(staleness),
    medianSpanToTtl: median(spans),
    // cross-reference only — equals GUR's complement by construction (see the doc comment)
    dormantScopes: dormant,
  }
}

// ── The analyzer + its ground-truth score ────────────────────────────────────

export function corpusDigest(corpus) {
  return sha256(
    canonical({
      version: OVER_GRANT_VERSIONS.corpus_version,
      seed: corpus.seed,
      windowDays: corpus.windowDays,
      identities: corpus.identities,
      events: corpus.events,
    }),
  )
}

/** Run every metric over a corpus. Pure; the digest content-addresses the whole report. */
export function analyzeOverGrant(corpus) {
  const eff = effectiveScopes(corpus)
  const gur = grantUtilization(corpus)
  const bri = blastRadius(corpus, eff)
  const amv = attenuationViolations(corpus)
  const trp = taintReachability(corpus, eff)
  const sah = standingAuthority(corpus)
  const metrics = { gur, bri, amv, trp, sah }
  return { version: OVER_GRANT_VERSION, versions: OVER_GRANT_VERSIONS, corpusDigest: corpusDigest(corpus), metrics }
}

/**
 * Score the DETECTION-shaped metrics against the corpus's planted ground truth.
 *
 * AMV and the dormant-scope population are plantable, so they get a catch rate and a false-positive
 * rate — the same shape as the floor-gate and fleet-verify benches. GUR/BRI/SAH are measurements,
 * not detections: their verifiable property is byte-identical recompute (`free-bit`), asserted by
 * the bench's `--check` and by the hand-computed fixture in the test suite. Saying which is which
 * is the honest part.
 */
export function scoreAgainstGroundTruth(report, planted) {
  const foundEdges = new Set(report.metrics.amv.violatingEdges.map((v) => v.child))
  const plantedEdges = new Set(planted.violationEdges)
  const caught = [...plantedEdges].filter((id) => foundEdges.has(id)).length
  const falsePositives = [...foundEdges].filter((id) => !plantedEdges.has(id)).length
  const plantedDormant = planted.dormantScopes.length
  return {
    amv: {
      planted: plantedEdges.size,
      caught,
      catchRate: plantedEdges.size === 0 ? 1 : caught / plantedEdges.size,
      falsePositives,
      falsePositiveRate: foundEdges.size === 0 ? 0 : falsePositives / foundEdges.size,
    },
    dormant: {
      planted: plantedDormant,
      measured: report.metrics.sah.dormantScopes,
      exact: plantedDormant === report.metrics.sah.dormantScopes,
    },
  }
}

/**
 * The bench entry point — corpus → metrics → ground-truth score → digest, all from one seed.
 * Consumed by `scripts/overgrant-bench.mjs` (which writes the dated public artifact) and by the
 * in-browser panel on /security. Synthetic by construction; the `scope` string says so.
 */
export function runOverGrantBench({ seed = 20260818, roots = 2000, depth = 4, windowDays = 30, violationRate = 0.06 } = {}) {
  const corpus = generateCorpus({ seed, roots, depth, windowDays, violationRate })
  const report = analyzeOverGrant(corpus)
  const groundTruth = scoreAgainstGroundTruth(report, corpus.planted)
  const body = {
    analyzer: OVER_GRANT_VERSIONS.analyzer_version,
    corpus: OVER_GRANT_VERSIONS.corpus_version,
    scope:
      'SYNTHETIC agent fleet and tool-call log generated from the seed — not a real fleet and not customer data. ' +
      'Measures the deterministic over-grant analyzer only. Byte-identical recompute from the seed (free-bit).',
    seed,
    windowDays,
    fleet: {
      identities: corpus.identities.length,
      delegationEdges: report.metrics.amv.delegationEdges,
      events: corpus.events.length,
      resources: resources.length,
      sensitiveResources: SENSITIVE_IDS.length,
      egressResources: EGRESS_IDS.length,
    },
    metrics: {
      gur: {
        scopesGranted: report.metrics.gur.scopesGranted,
        scopesExercised: report.metrics.gur.scopesExercised,
        fleetGur: report.metrics.gur.fleetGur,
        overGrantSurface: report.metrics.gur.overGrantSurface,
      },
      bri: { sensitiveResources: report.metrics.bri.sensitiveResources, meanBri: report.metrics.bri.meanBri, p95Bri: report.metrics.bri.p95Bri, maxBri: report.metrics.bri.maxBri },
      amv: { delegationEdges: report.metrics.amv.delegationEdges, violatingEdgeCount: report.metrics.amv.violatingEdgeCount, violatingScopes: report.metrics.amv.violatingScopes, violationRate: report.metrics.amv.violationRate },
      trp: { taintedIdentities: report.metrics.trp.taintedIdentities, exposedIdentities: report.metrics.trp.exposedIdentities, exposureRate: report.metrics.trp.exposureRate, paths: report.metrics.trp.paths },
      sah: report.metrics.sah,
    },
    groundTruth,
    corpusDigest: report.corpusDigest,
  }
  return { ...body, digest: sha256(canonical(body)) }
}
