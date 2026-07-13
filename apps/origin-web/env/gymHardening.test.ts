import { describe, it, expect } from 'vitest'
import { iamTasks, iamOracle } from '@origin/verifier-core/iamGym'
import {
  batteryDigest,
  gymRobustness,
  overGrantFamily,
  probePool,
  findHoles,
  runHardeningRound,
  hardenToFixedPoint,
} from '@origin/verifier-core/gymHardening'

// The self-hardening environment (the moat's compounding core): every over-granting
// agent a reference check surfaces becomes an oracle-labeled case, versioned into the
// battery, so a policy that used to game the gym gets caught. These tests pin the
// load-bearing invariants — the ONE thing that must never be wrong is the environment.

const youngGym = () => iamTasks.slice(0, 1) // a benign allow-case only — can't tell least-privilege from over-granting

describe('self-hardening IAM gym', () => {
  it('a young gym catches few risky agents; hardening catches them all', () => {
    const before = gymRobustness(youngGym())
    expect(before.robustness).toBeLessThan(0.5) // blind: over-granting agents pass
    const res = hardenToFixedPoint(youngGym())
    expect(res.final_robustness).toBe(1) // every adversarial family member now caught
    expect(res.battery.length).toBeGreaterThan(youngGym().length) // the library GREW
  })

  it('every added case is labeled by the deterministic oracle (never an LLM)', () => {
    const res = hardenToFixedPoint(youngGym())
    expect(res.ledger.length).toBeGreaterThan(0)
    for (const entry of res.ledger) {
      const task = res.battery.find((t) => t.id === entry.task_id)!
      expect(task).toBeTruthy()
      expect(entry.oracle_label).toBe(iamOracle(task).decision) // provenance = the oracle's verdict
    }
  })

  it('hardening changes the battery version digest (a credential pins the version)', () => {
    const seed = youngGym()
    const res = hardenToFixedPoint(seed)
    expect(res.final_digest).not.toBe(batteryDigest(seed)) // new version
    // determinism: same seed → byte-identical final battery + digest (reproducible)
    expect(hardenToFixedPoint(seed).final_digest).toBe(res.final_digest)
  })

  it('a found hole is a probe the policy OVER-GRANTS but the visible battery missed', () => {
    const holes = findHoles(youngGym(), probePool(), overGrantFamily())
    expect(holes.length).toBeGreaterThan(0)
    for (const h of holes) {
      // the oracle would NOT allow it (else it is not an over-grant)
      expect(iamOracle(h.task).decision).not.toBe('allow')
      // and it was not already in the visible battery
      expect(youngGym().some((t) => t.id === h.task.id)).toBe(false)
    }
  })

  it('incremental hardening (limit per round) yields a monotone robustness curve', () => {
    const res = hardenToFixedPoint(youngGym(), probePool(), overGrantFamily(), 30, 1)
    expect(res.curve.length).toBeGreaterThan(1) // multiple rounds (one customer at a time)
    // robustness never decreases round to round (monotone by construction)
    for (let i = 1; i < res.curve.length; i += 1) {
      expect(res.curve[i].robustness_after).toBeGreaterThanOrEqual(res.curve[i - 1].robustness_after)
    }
    expect(res.final_robustness).toBe(1)
  })

  it('the current shipped battery is already robust against the whole family', () => {
    // the production iamTasks battery catches every over-grant family member
    expect(gymRobustness(iamTasks).robustness).toBe(1)
  })

  it('one round reports before < after and an honest hole count', () => {
    const round = runHardeningRound(youngGym())
    expect(round.after.robustness).toBeGreaterThan(round.before.robustness)
    expect(round.holes_found).toBe(round.added.length)
    expect(round.digest_after).not.toBe(round.digest_before)
  })
})
