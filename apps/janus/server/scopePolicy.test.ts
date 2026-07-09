import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { stableStringify } from './evidence/digest.ts'
import manifestJson from './capabilityManifest.json' with { type: 'json' }
import {
  LICENSE_ORDER,
  MANIFEST_VERSION,
  allowedCapabilities,
  computeManifestDigest,
  isCapabilityInScope,
  isForbidden,
  manifestDigest,
  requiresHumanApproval,
  scopeDecision,
  type LicenseLevelId,
} from './scopePolicy.ts'

// Representative caps pulled from the real catalog (apps/janus/src/janus/capabilities.ts).
const READ = 'calendar.read' // low-risk read → L1+
const PREPARE = 'messages.draft' // *.draft staging → L2+, never a side-effect
const LOW_COMMIT = 'reminders.write.commit' // only low-risk side-effecting commit → L3+
const MED_COMMIT = 'calendar.write.commit' // medium-risk commit → L4 only
const CRED_REQUEST = 'credential.scoped_request' // brokered scoped credential → L3+
// High/critical commits — human-approval-gated at EVERY level:
const HIGH_CRIT_COMMITS = [
  'messages.send',
  'delivery.order.submit',
  'ride.booking.submit',
  'events.registration.submit',
] as const
const FORBIDDEN_CAP = 'payment.spend' // GLOBAL_FORBIDDEN → deny even with approval

describe('L0 Observe unlocks nothing', () => {
  it('has an empty allowed set', () => {
    expect(allowedCapabilities('L0').size).toBe(0)
  })
  it('denies even a low-risk read', () => {
    expect(scopeDecision('L0', READ).decision).toBe('deny')
    expect(isCapabilityInScope('L0', READ)).toBe(false)
  })
})

describe('L1 Ask unlocks reads only — no prepares, no commits', () => {
  it('unlocks low-risk reads', () => {
    expect(isCapabilityInScope('L1', READ)).toBe(true)
    expect(scopeDecision('L1', READ).decision).toBe('allow')
  })
  it('does NOT unlock prepare/draft/proposed caps', () => {
    expect(isCapabilityInScope('L1', PREPARE)).toBe(false)
    expect(scopeDecision('L1', PREPARE).decision).toBe('deny')
  })
  it('does NOT unlock any side-effecting commit', () => {
    expect(scopeDecision('L1', LOW_COMMIT).decision).toBe('deny')
    expect(scopeDecision('L1', MED_COMMIT).decision).toBe('deny')
  })
})

describe('L2 Recommend adds prepares but still zero commits', () => {
  it('adds prepare/draft/proposed staging caps', () => {
    expect(isCapabilityInScope('L2', PREPARE)).toBe(true)
    expect(scopeDecision('L2', PREPARE).decision).toBe('allow')
    // A high-risk PREPARE cap still only prepares (non-side-effecting) → in scope at L2.
    expect(isCapabilityInScope('L2', 'ride.booking.prepare')).toBe(true)
  })
  it('still unlocks the L1 reads (cumulative)', () => {
    expect(isCapabilityInScope('L2', READ)).toBe(true)
  })
  it('does NOT unlock any commit, not even the low-risk one', () => {
    expect(scopeDecision('L2', LOW_COMMIT).decision).toBe('deny')
    expect(scopeDecision('L2', MED_COMMIT).decision).toBe('deny')
  })
  it('does NOT yet unlock credential.scoped_request', () => {
    expect(isCapabilityInScope('L2', CRED_REQUEST)).toBe(false)
  })
})

describe('L3 Guarded Act adds scoped-credential requests + low-risk commits only', () => {
  it('unlocks credential.scoped_request', () => {
    expect(scopeDecision('L3', CRED_REQUEST).decision).toBe('allow')
  })
  it('unlocks the low-risk commit', () => {
    expect(scopeDecision('L3', LOW_COMMIT).decision).toBe('allow')
  })
  it('must escalate medium-risk commits (deny at L3)', () => {
    expect(scopeDecision('L3', MED_COMMIT).decision).toBe('deny')
  })
})

describe('L4 Limited Autonomy adds medium-risk commits, never high/critical', () => {
  it('a read cap is allow at L4', () => {
    expect(scopeDecision('L4', READ).decision).toBe('allow')
  })
  it('unlocks the medium-risk commit', () => {
    expect(isCapabilityInScope('L4', MED_COMMIT)).toBe(true)
    expect(scopeDecision('L4', MED_COMMIT).decision).toBe('allow')
  })
  it('still carries every lower-level capability (cumulative)', () => {
    expect(isCapabilityInScope('L4', READ)).toBe(true)
    expect(isCapabilityInScope('L4', PREPARE)).toBe(true)
    expect(isCapabilityInScope('L4', LOW_COMMIT)).toBe(true)
    expect(isCapabilityInScope('L4', CRED_REQUEST)).toBe(true)
  })
})

describe('capability is not permission — high/critical commits never auto-unlock', () => {
  for (const cap of HIGH_CRIT_COMMITS) {
    it(`${cap} is require_approval (never allow) at L3 and L4`, () => {
      expect(requiresHumanApproval(cap)).toBe(true)
      const d3 = scopeDecision('L3', cap)
      const d4 = scopeDecision('L4', cap)
      expect(d3.decision).toBe('require_approval')
      expect(d4.decision).toBe('require_approval')
      expect(d3.decision).not.toBe('allow')
      expect(d4.decision).not.toBe('allow')
    })
    it(`${cap} appears in NO level's allowed set`, () => {
      for (const level of LICENSE_ORDER) {
        expect(allowedCapabilities(level).has(cap)).toBe(false)
      }
    })
  }
})

describe('GLOBAL_FORBIDDEN caps are denied even with approval', () => {
  it('payment.spend denies at every level and is not approval-gated', () => {
    expect(isForbidden(FORBIDDEN_CAP)).toBe(true)
    expect(requiresHumanApproval(FORBIDDEN_CAP)).toBe(false)
    for (const level of LICENSE_ORDER) {
      expect(scopeDecision(level, FORBIDDEN_CAP).decision).toBe('deny')
    }
  })
  it('credential.unrestricted denies at L4', () => {
    expect(scopeDecision('L4', 'credential.unrestricted').decision).toBe('deny')
  })
})

describe('scopeDecision three-way for representative caps', () => {
  const cases: Array<[LicenseLevelId, string, 'allow' | 'require_approval' | 'deny']> = [
    ['L0', READ, 'deny'],
    ['L1', READ, 'allow'],
    ['L1', PREPARE, 'deny'],
    ['L2', PREPARE, 'allow'],
    ['L2', MED_COMMIT, 'deny'],
    ['L3', CRED_REQUEST, 'allow'],
    ['L3', LOW_COMMIT, 'allow'],
    ['L3', MED_COMMIT, 'deny'],
    ['L4', MED_COMMIT, 'allow'],
    ['L4', 'messages.send', 'require_approval'],
    ['L4', FORBIDDEN_CAP, 'deny'],
  ]
  for (const [level, cap, expected] of cases) {
    it(`(${level}, ${cap}) → ${expected}`, () => {
      const d = scopeDecision(level, cap)
      expect(d.decision).toBe(expected)
      expect(typeof d.reason).toBe('string')
      expect(d.reason.length).toBeGreaterThan(0)
    })
  }
})

describe('cumulative ladder invariant L0 ⊆ L1 ⊆ L2 ⊆ L3 ⊆ L4', () => {
  it('each level is a superset of the one below', () => {
    for (let i = 1; i < LICENSE_ORDER.length; i++) {
      const lower = allowedCapabilities(LICENSE_ORDER[i - 1])
      const higher = allowedCapabilities(LICENSE_ORDER[i])
      for (const cap of lower) expect(higher.has(cap)).toBe(true)
      expect(higher.size).toBeGreaterThanOrEqual(lower.size)
    }
  })
  it('no allowed cap at any level is human-approval-gated or forbidden', () => {
    for (const level of LICENSE_ORDER) {
      for (const cap of allowedCapabilities(level)) {
        expect(requiresHumanApproval(cap)).toBe(false)
        expect(isForbidden(cap)).toBe(false)
      }
    }
  })
})

describe('manifestDigest — deterministic and tamper-evident', () => {
  it('is stable across two calls', () => {
    expect(manifestDigest()).toBe(manifestDigest())
  })
  it('matches an independent canonical digest of the live manifest', () => {
    const independent = createHash('sha256').update(stableStringify(manifestJson)).digest('hex')
    expect(manifestDigest()).toBe(independent)
  })
  it('changes when a copy of the manifest is mutated', () => {
    const before = manifestDigest()
    const copy = JSON.parse(JSON.stringify(manifestJson))
    copy.levels.L1.push('calendar.read.SMUGGLED')
    expect(computeManifestDigest(copy)).not.toBe(before)
  })
  it('exposes the pinned manifest version', () => {
    expect(MANIFEST_VERSION).toBe('countersign-scope-v1')
  })
})
