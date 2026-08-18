import { describe, it, expect } from 'vitest'
import {
  generateCorpus,
  analyzeOverGrant,
  scoreAgainstGroundTruth,
  runOverGrantBench,
  grantUtilization,
  blastRadius,
  attenuationViolations,
  taintReachability,
  standingAuthority,
  effectiveScopes,
  corpusDigest,
} from './overGrant.mjs'

// ── The hand-computed fixture ────────────────────────────────────────────────
// Three identities, one delegation chain, eleven grants, six events. Every metric below is worked
// out by hand in the assertion's comment. Counts are cheap to fake and expensive to trust; a
// fixture you can recompute on paper is the only test that catches a plausible-but-wrong formula.
//
//   root      granted: payroll:read, customer-pii:read, email-send:write, dashboards:read,
//                      prod-db:delete            (5)   ttl 30   tainted:false
//   child     granted: payroll:read, email-send:write                      (2)   ttl 10  tainted:TRUE
//   rogue     granted: ledger:read  ← NOT in child's grant → attenuation violation (1) ttl 10
//
//   window = 10 days
const FIXTURE = {
  seed: 1,
  windowDays: 10,
  resources: [],
  identities: [
    {
      id: 'root',
      parent: null,
      owner: 'human-01',
      tainted: false,
      granted: ['customer-pii:read', 'dashboards:read', 'email-send:write', 'payroll:read', 'prod-db:delete'],
      granted_day: 0,
      ttl_days: 30,
    },
    { id: 'child', parent: 'root', owner: 'human-01', tainted: true, granted: ['email-send:write', 'payroll:read'], granted_day: 0, ttl_days: 10 },
    { id: 'rogue', parent: 'child', owner: 'human-01', tainted: false, granted: ['ledger:read'], granted_day: 0, ttl_days: 10 },
  ],
  events: [
    { day: 1, identity: 'root', scope: 'payroll:read', decision: 'allow' },
    { day: 4, identity: 'root', scope: 'payroll:read', decision: 'allow' },
    { day: 2, identity: 'root', scope: 'dashboards:read', decision: 'allow' },
    { day: 3, identity: 'child', scope: 'email-send:write', decision: 'allow' },
    // a DENY must never count as utilization — an identity does not "use" authority it was refused
    { day: 5, identity: 'child', scope: 'wire-transfer:execute', decision: 'deny' },
    // an ALLOW on a scope outside the grant must not inflate the numerator either
    { day: 6, identity: 'rogue', scope: 'payroll:read', decision: 'allow' },
  ],
  planted: { violationEdges: ['rogue'], dormantScopes: [] },
} as never

describe('over-grant analyzer — hand-computed fixture', () => {
  it('GUR counts distinct ALLOWED scopes inside the grant, over scopes granted at window start', () => {
    const gur = grantUtilization(FIXTURE)
    // granted: 5 + 2 + 1 = 8
    expect(gur.scopesGranted).toBe(8)
    // exercised: root {payroll:read, dashboards:read} = 2; child {email-send:write} = 1
    //   · child's wire-transfer:execute was DENIED  → not counted
    //   · rogue's payroll:read was ALLOWED but is OUTSIDE rogue's grant → not counted
    expect(gur.scopesExercised).toBe(3)
    expect(gur.fleetGur).toBeCloseTo(3 / 8, 12)
    expect(gur.overGrantSurface).toBeCloseTo(5 / 8, 12)
  })

  it('fleet GUR is Σnum ÷ Σdenom, not the mean of per-identity ratios', () => {
    const gur = grantUtilization(FIXTURE)
    const meanOfRatios = gur.perIdentity.reduce((s, p) => s + p.gur, 0) / gur.perIdentity.length
    // per-identity: root 2/5 = 0.4, child 1/2 = 0.5, rogue 0/1 = 0 → mean 0.3
    expect(meanOfRatios).toBeCloseTo(0.3, 12)
    // the weighted fleet number is 0.375 — the two differ, which is the entire reason to pick one
    expect(gur.fleetGur).toBeCloseTo(0.375, 12)
    expect(gur.fleetGur).not.toBeCloseTo(meanOfRatios, 6)
  })

  it('AMV finds exactly the widened edge and names the scope that widened it', () => {
    const amv = attenuationViolations(FIXTURE)
    expect(amv.delegationEdges).toBe(2) // root→child, child→rogue
    expect(amv.violatingEdgeCount).toBe(1)
    expect(amv.violatingEdges[0]).toEqual({ child: 'rogue', parent: 'child', widened: ['ledger:read'] })
    expect(amv.violationRate).toBeCloseTo(0.5, 12)
  })

  it('effective authority unions descendants — so the violation widens the blast radius at the ROOT', () => {
    const eff = effectiveScopes(FIXTURE)
    // root's own grant has no ledger:read; it arrives from rogue, two hops down
    expect(FIXTURE.identities[0].granted).not.toContain('ledger:read')
    expect(eff.get('root')!.has('ledger:read')).toBe(true)

    const bri = blastRadius(FIXTURE, eff)
    const root = bri.perIdentity.find((p) => p.id === 'root')!
    // sensitive (high|forbidden) reachable from root: payroll, customer-pii, prod-db, ledger = 4
    expect(root.reachable).toBe(4)
    // the catalogue has 9 sensitive resources
    expect(bri.sensitiveResources).toBe(9)
    expect(root.bri).toBeCloseTo(4 / 9, 12)
  })

  it('TRP fires only when all three legs of the trifecta meet on one identity', () => {
    const trp = taintReachability(FIXTURE)
    expect(trp.taintedIdentities).toBe(1) // only `child`
    // child: tainted ✓ · sensitive read (payroll:read) ✓ · egress write (email-send:write) ✓
    expect(trp.exposedIdentities).toBe(1)
    // child's effective set also pulls ledger:read up from rogue → 2 sensitive reads × 1 egress = 2
    expect(trp.exposed[0].sensitiveReads).toEqual(['ledger', 'payroll'])
    expect(trp.exposed[0].egressWrites).toEqual(['email-send'])
    expect(trp.paths).toBe(2)
  })

  it('TRP does not fire on an untainted identity holding the same authority', () => {
    // root holds strictly MORE than child and is not tainted — exposure is a property of the
    // trifecta, not of privilege alone.
    const trp = taintReachability(FIXTURE)
    expect(trp.exposed.map((e) => e.id)).toEqual(['child'])
  })

  it('SAH measures only the authority in USE, so it is not GUR wearing a hat', () => {
    const sah = standingAuthority(FIXTURE)
    expect(sah.scopes).toBe(8)
    expect(sah.exercisedScopes).toBe(3)
    expect(sah.dormantScopes).toBe(5)
    // staleness = (window − lastUse) ÷ ttl, over the three exercised scopes:
    //   root/payroll:read     last day 4  → (10−4)/30 = 0.2
    //   root/dashboards:read  last day 2  → (10−2)/30 ≈ 0.2667
    //   child/email-send      last day 3  → (10−3)/10 = 0.7
    // sorted [0.2, 0.2667, 0.7] → median 0.2667
    expect(sah.medianStalenessRatio).toBeCloseTo(8 / 30, 12)
    // span = (last − first) ÷ ttl: root/payroll (4−1)/30 = 0.1; the other two are single-use → 0
    // sorted [0, 0, 0.1] → median 0
    expect(sah.medianSpanToTtl).toBeCloseTo(0, 12)
  })

  it('the dormant cross-reference is exactly GUR complement — stated, not double-counted', () => {
    const gur = grantUtilization(FIXTURE)
    const sah = standingAuthority(FIXTURE)
    expect(sah.dormantScopes / sah.scopes).toBeCloseTo(gur.overGrantSurface, 12)
  })
})

// ── Properties over the generated corpus ─────────────────────────────────────
describe('over-grant analyzer — generated corpus', () => {
  it('is a pure function of the seed (byte-identical recompute — the free-bit tier)', () => {
    const a = runOverGrantBench({ seed: 4242, roots: 60, depth: 3 })
    const b = runOverGrantBench({ seed: 4242, roots: 60, depth: 3 })
    expect(a.digest).toBe(b.digest)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })

  it('a different seed gives a different corpus (the generator is not degenerate)', () => {
    expect(runOverGrantBench({ seed: 1, roots: 60 }).corpusDigest).not.toBe(runOverGrantBench({ seed: 2, roots: 60 }).corpusDigest)
  })

  it('recovers the planted attenuation violations exactly — no misses, no false positives', () => {
    const corpus = generateCorpus({ seed: 20260818, roots: 300, depth: 4 })
    const score = scoreAgainstGroundTruth(analyzeOverGrant(corpus), corpus.planted)
    expect(score.amv.planted).toBeGreaterThan(0) // a catch rate over an empty set proves nothing
    expect(score.amv.catchRate).toBe(1)
    expect(score.amv.falsePositives).toBe(0)
  })

  it('recovers the planted dormant-scope population exactly', () => {
    const corpus = generateCorpus({ seed: 20260818, roots: 300, depth: 4 })
    const score = scoreAgainstGroundTruth(analyzeOverGrant(corpus), corpus.planted)
    expect(score.dormant.planted).toBeGreaterThan(0)
    expect(score.dormant.exact).toBe(true)
  })

  it('with violations disabled, AMV reads a STRUCTURAL zero — the property an attenuating token guarantees', () => {
    const clean = generateCorpus({ seed: 20260818, roots: 300, depth: 4, violationRate: 0 })
    const amv = attenuationViolations(clean)
    expect(clean.planted.violationEdges).toEqual([])
    expect(amv.delegationEdges).toBeGreaterThan(100) // the zero must be earned over real edges
    expect(amv.violatingEdgeCount).toBe(0)
    expect(amv.violationRate).toBe(0)
  })

  it('a clean corpus makes effective authority a NO-OP — the union adds nothing', () => {
    // This is the whole argument for attenuating capability tokens, expressed as a test: when every
    // child narrows, an ancestor's reachable set is exactly its own grant. Enable violations and it
    // stops being true — which is why AMV gates the meaning of BRI and TRP.
    const clean = generateCorpus({ seed: 7, roots: 120, depth: 4, violationRate: 0 })
    const eff = effectiveScopes(clean)
    for (const i of clean.identities) {
      expect([...eff.get(i.id)!].sort()).toEqual([...i.granted].sort())
    }
    const dirty = generateCorpus({ seed: 7, roots: 120, depth: 4, violationRate: 0.5 })
    const dirtyEff = effectiveScopes(dirty)
    const widened = dirty.identities.filter((i) => dirtyEff.get(i.id)!.size > i.granted.length)
    expect(widened.length).toBeGreaterThan(0)
  })

  it('every metric stays inside its declared range', () => {
    const r = analyzeOverGrant(generateCorpus({ seed: 99, roots: 200, depth: 4 }))
    for (const v of [r.metrics.gur.fleetGur, r.metrics.gur.overGrantSurface, r.metrics.bri.meanBri, r.metrics.bri.p95Bri, r.metrics.bri.maxBri, r.metrics.amv.violationRate, r.metrics.trp.exposureRate]) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(r.metrics.bri.p95Bri).toBeLessThanOrEqual(r.metrics.bri.maxBri)
    expect(r.metrics.gur.scopesExercised).toBeLessThanOrEqual(r.metrics.gur.scopesGranted)
  })

  it('the corpus digest covers the log — tampering one event changes it', () => {
    const corpus = generateCorpus({ seed: 5, roots: 40, depth: 3 })
    const before = corpusDigest(corpus)
    const tampered = { ...corpus, events: corpus.events.map((e, i) => (i === 0 ? { ...e, decision: 'deny' as const } : e)) }
    expect(corpusDigest(tampered)).not.toBe(before)
  })

  it('flipping one denied event to allowed moves GUR — the log is load-bearing, not decorative', () => {
    const corpus = generateCorpus({ seed: 11, roots: 80, depth: 3 })
    const denied = corpus.events.findIndex((e) => e.decision === 'deny')
    expect(denied).toBeGreaterThanOrEqual(0)
    const before = grantUtilization(corpus).scopesExercised
    // grant the identity the scope it was refused, and let the event through
    const target = corpus.events[denied]
    const patched = {
      ...corpus,
      identities: corpus.identities.map((i) => (i.id === target.identity ? { ...i, granted: [...i.granted, target.scope].sort() } : i)),
      events: corpus.events.map((e, i) => (i === denied ? { ...e, decision: 'allow' as const } : e)),
    }
    expect(grantUtilization(patched).scopesExercised).toBe(before + 1)
  })
})
