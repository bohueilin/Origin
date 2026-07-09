// Countersign offline bundle verifier — self-contained proof of the exit-code contract.
// Every bundle variant is CONSTRUCTED here (not read from the committed JSON examples) so the
// test proves the invariant from first principles: valid → 0, tampered → 2, inflated → 3,
// cherry-picked → 2. Relative imports (the co-located package source), not the @origin/* alias,
// because in a fresh worktree the alias resolves to an older installed copy.
import { describe, it, expect } from 'vitest'
import { verifyBundle, verifyBundleWithDelegations, formatReport, EXIT, exitForCode } from './countersign-verify.mjs'
import { generateAgentKey, signPayload } from './countersign-identity.mjs'
import { mintWarrant } from './warrant.mjs'
import { mintDelegation } from './delegation.mjs'
import { deriveWarrantLevel } from './license-policy.mjs'
import { canonical, sha256 } from '../evidence/env-evidence.mjs'

// Reproduce warrant.mjs's private warrantDigest EXACTLY: it excludes warrant_digest,
// issuer_signature AND the raw backing (the backing is committed via chain_head).
function warrantDigest(w: any): string {
  const { warrant_digest, issuer_signature, backing, ...rest } = w
  void warrant_digest
  void issuer_signature
  void backing
  return sha256(canonical(rest))
}
function reseal(w: any, privateJwk: any) {
  const digest = warrantDigest(w)
  return { ...w, warrant_digest: digest, issuer_signature: signPayload({ warrant_digest: digest }, privateJwk) }
}
const clone = (x: any) => JSON.parse(JSON.stringify(x))

function mkRow(agent_seq: number, scenario_id: string, split: string, passed: boolean, reward: number, catastrophic = false) {
  const r: any = { agent_seq, scenario_id, split, passed, reward, catastrophic, trace_id: `trace-${agent_seq}` }
  r.audit_row_digest = sha256(canonical(['audit', scenario_id, agent_seq, reward, passed]))
  return r
}

const versions = { verifier_version: 'countersign-verifier-v1', reward_model_version: 'reward-v1', environment_name: 'origin-gym' }

// A whole world: honest gym issuer, a rogue signer, one agent, a pinned capability manifest,
// and the four bundle variants built from real mints.
function buildWorld() {
  const gym = generateAgentKey()
  const rogue = generateAgentKey()
  const agent = generateAgentKey()
  const manifestDigest = sha256(canonical({ manifest: 'countersign-capability-manifest', version: 'v1' }))

  // Honest backing → L3 (5/6 pass, avg 0.66, 6 distinct scenarios incl. 1 heldout, no catastrophe).
  const backingL3 = [
    mkRow(0, 's-approve-invoice', 'train', true, 0.82),
    mkRow(1, 's-schedule-move', 'train', true, 0.74),
    mkRow(2, 's-triage-ticket', 'train', true, 0.68),
    mkRow(3, 's-refund-guard', 'train', false, 0.22), // lowest reward — dropped by cherry-pick
    mkRow(4, 's-heldout-audit', 'heldout', true, 0.71),
    mkRow(5, 's-close-loop', 'train', true, 0.79),
  ]
  expect(deriveWarrantLevel(backingL3).level).toBe('L3')

  const validWarrant = mintWarrant({
    agentThumbprint: agent.thumbprint,
    backing: backingL3,
    versions,
    capabilityManifestDigest: manifestDigest,
    issuerPrivateJwk: gym.privateJwk,
    issuerThumbprint: gym.thumbprint,
    epoch: 0,
  })

  const gymIssuer = { public_jwk: gym.publicJwk, thumbprint: gym.thumbprint }
  const rogueIssuer = { public_jwk: rogue.publicJwk, thumbprint: rogue.thumbprint }
  const pinned = { capability_manifest_digest: manifestDigest, min_epoch: 0 }
  const mkBundle = (issuer: any, warrants: any[]) => ({ bundle_schema_version: '1.0.0', issuer, warrants, pinned })

  // TAMPERED — doctor a digest-covered shown-work stat; do not reseal → code 1.
  const tamperedWarrant = clone(validWarrant)
  tamperedWarrant.derivation.avgReward = 0.99

  // CHERRY-PICKED — drop the lowest-reward backing row; no reseal, no key. Digest excludes the
  // backing so integrity+signature still pass, but the remaining rows no longer fold → code 4.
  const cherryWarrant = clone(validWarrant)
  cherryWarrant.backing = cherryWarrant.backing.filter((r: any) => r.agent_seq !== 3)

  // INFLATED — rogue mints over L2-only evidence, edits level (and shown-work) to L4, reseals
  // with its own key, names itself issuer. Every self-referential field agrees; only the
  // re-derivation from raw backing disagrees → code 3.
  const backingL2 = [
    mkRow(0, 's-approve-invoice', 'train', true, 0.55),
    mkRow(1, 's-schedule-move', 'train', true, 0.48),
    mkRow(2, 's-triage-ticket', 'train', false, 0.15),
    mkRow(3, 's-refund-guard', 'heldout', true, 0.52),
    mkRow(4, 's-heldout-audit', 'train', false, 0.1),
    mkRow(5, 's-close-loop', 'train', true, 0.44),
  ]
  expect(deriveWarrantLevel(backingL2).level).toBe('L2')
  const rogueWarrant = mintWarrant({
    agentThumbprint: agent.thumbprint,
    backing: backingL2,
    versions,
    capabilityManifestDigest: manifestDigest,
    issuerPrivateJwk: rogue.privateJwk,
    issuerThumbprint: rogue.thumbprint,
    epoch: 0,
  })
  const inflated = clone(rogueWarrant)
  inflated.license_level = 'L4'
  inflated.derivation.level = 'L4'
  const inflatedWarrant = reseal(inflated, rogue.privateJwk)

  return {
    gym,
    rogue,
    agent,
    manifestDigest,
    gymIssuer,
    rogueIssuer,
    mkBundle,
    validWarrant,
    valid: mkBundle(gymIssuer, [clone(validWarrant)]),
    tampered: mkBundle(gymIssuer, [tamperedWarrant]),
    inflated: mkBundle(rogueIssuer, [inflatedWarrant]),
    cherry: mkBundle(gymIssuer, [cherryWarrant]),
    inflatedWarrant,
  }
}

describe('Countersign offline bundle verifier — the exit-code contract', () => {
  it('VALID bundle → exit 0, every claim re-derived from the evidence', () => {
    const w = buildWorld()
    const r = verifyBundle(w.valid)
    expect(r.exitCode).toBe(EXIT.OK)
    expect(r.exitCode).toBe(0)
    expect(r.ok).toBe(true)
    const warrant = r.results.find((x) => x.kind === 'warrant')!
    expect(warrant.code).toBe(0)
    expect(warrant.level).toBe('L3')
    expect(r.summary.failed).toBe(0)
  })

  it('TAMPERED (doctored digest-covered field) → exit 2, warrant code 1', () => {
    const w = buildWorld()
    const r = verifyBundle(w.tampered)
    expect(r.exitCode).toBe(EXIT.INTEGRITY)
    expect(r.exitCode).toBe(2)
    expect(r.ok).toBe(false)
    expect(r.results.find((x) => x.kind === 'warrant')!.code).toBe(1)
  })

  it('INFLATED (rogue-signed L4 over L2 evidence) → exit 3, warrant code 3 — caught by re-derivation', () => {
    const w = buildWorld()
    const r = verifyBundle(w.inflated)
    expect(r.exitCode).toBe(EXIT.AUTHORITY)
    expect(r.exitCode).toBe(3)
    expect(r.ok).toBe(false)
    const warrant = r.results.find((x) => x.kind === 'warrant')!
    expect(warrant.code).toBe(3)
    expect(warrant.reason).toMatch(/inflation/i)
  })

  it('CHERRY-PICKED (dropped evidence row) → exit 2, warrant code 4 — you cannot export a cleaner record than you earned', () => {
    const w = buildWorld()
    const r = verifyBundle(w.cherry)
    expect(r.exitCode).toBe(EXIT.INTEGRITY)
    expect(r.exitCode).toBe(2)
    expect(r.ok).toBe(false)
    const warrant = r.results.find((x) => x.kind === 'warrant')!
    expect(warrant.code).toBe(4)
    expect(warrant.reason).toMatch(/chain|omitted|incomplete/i)
  })

  it('a bundle that LIES about its issuer (thumbprint != its own public key) → exit 2 (integrity)', () => {
    const w = buildWorld()
    const lying = { ...w.valid, issuer: { ...w.gymIssuer, thumbprint: 'deadbeef'.repeat(8) } }
    const r = verifyBundle(lying)
    expect(r.exitCode).toBe(2)
    const issuer = r.results.find((x) => x.kind === 'issuer')!
    expect(issuer.ok).toBe(false)
    expect(issuer.code).toBe(7)
  })

  it('the rogue cannot win by naming the REAL gym instead: pin the gym → bad signature (code 2, exit 3)', () => {
    const w = buildWorld()
    // Present the rogue-signed L4 warrant but claim the honest gym as issuer.
    const spoofed = w.mkBundle(w.gymIssuer, [clone(w.inflatedWarrant)])
    const r = verifyBundle(spoofed)
    expect(r.exitCode).toBe(EXIT.AUTHORITY)
    expect(r.results.find((x) => x.kind === 'warrant')!.code).toBe(2)
  })
})

describe('Countersign verifier — precedence, delegations, and the human report', () => {
  it('exitForCode maps integrity codes {1,4,7}→2 and authority codes {2,3,5,6}→3', () => {
    expect(exitForCode(0)).toBe(0)
    for (const c of [1, 4, 7]) expect(exitForCode(c)).toBe(2)
    for (const c of [2, 3, 5, 6]) expect(exitForCode(c)).toBe(3)
  })

  it('mixed failures: an integrity failure DOMINATES an authority failure (exit 2 wins)', () => {
    const w = buildWorld()
    // One tampered (code 1 → integrity) warrant plus one inflated (code 3 → authority) warrant,
    // both under the rogue issuer so both are reached. Integrity must dominate → exit 2.
    const tamperedRogue = clone(w.inflatedWarrant)
    tamperedRogue.derivation.avgReward = 0.99 // break the self-digest → code 1
    const mixed = w.mkBundle(w.rogueIssuer, [tamperedRogue, clone(w.inflatedWarrant)])
    const r = verifyBundle(mixed)
    expect(r.exitCode).toBe(2)
    const codes = r.results.filter((x) => x.kind === 'warrant').map((x) => x.code).sort()
    expect(codes).toEqual([1, 3])
  })

  it('a delegation present with no available verifier fails CLOSED (code 7, exit 2)', async () => {
    const w = buildWorld()
    const withDel = { ...w.valid, delegations: [{ subject_thumbprint: w.agent.thumbprint, note: 'unverifiable' }] }
    // sync: no injected verifier → fail closed.
    const r = verifyBundle(withDel)
    expect(r.exitCode).toBe(2)
    expect(r.results.find((x) => x.kind === 'delegation')!.code).toBe(7)
    // async wrapper: the optional delegation module does not exist yet → still fails closed.
    const ra = await verifyBundleWithDelegations(withDel)
    expect(ra.exitCode).toBe(2)
    expect(ra.results.find((x) => x.kind === 'delegation')!.ok).toBe(false)
  })

  it('a VALID delegation chain [rootWarrant, cert] verifies end-to-end → exit 0', async () => {
    const w = buildWorld()
    const child = generateAgentKey()
    const cert = mintDelegation({
      parentThumbprint: w.agent.thumbprint,
      parentPrivateJwk: w.agent.privateJwk,
      childThumbprint: child.thumbprint,
      caveats: { tools: ['calendar.read'] },
      parentDelegationDigest: w.validWarrant.warrant_digest,
      depth: 1,
    })
    const bundle = { ...w.valid, delegations: [[w.validWarrant, cert]] }
    const r = await verifyBundleWithDelegations(bundle)
    expect(r.exitCode).toBe(0)
    const del = r.results.find((x) => x.kind === 'delegation')!
    expect(del.ok).toBe(true)
    expect(del.code).toBe(0)
  })

  it('a delegation with a BROKEN parent link → code 5 → exit 2 (delegation-specific mapping: 5 is integrity)', async () => {
    const w = buildWorld()
    const child = generateAgentKey()
    const cert = mintDelegation({
      parentThumbprint: w.agent.thumbprint,
      parentPrivateJwk: w.agent.privateJwk,
      childThumbprint: child.thumbprint,
      caveats: { tools: ['calendar.read'] },
      parentDelegationDigest: '0'.repeat(64), // does not link to the root Warrant
      depth: 1,
    })
    const bundle = { ...w.valid, delegations: [[w.validWarrant, cert]] }
    const r = await verifyBundleWithDelegations(bundle)
    expect(r.exitCode).toBe(2)
    expect(r.results.find((x) => x.kind === 'delegation')!.code).toBe(5)
  })

  it('formatReport renders PASS/FAIL lines per check', () => {
    const w = buildWorld()
    const okReport = formatReport(verifyBundle(w.valid))
    expect(okReport).toContain('PASS')
    expect(okReport).toMatch(/re-derives from the evidence/)
    expect(okReport).toMatch(/exit 0/)

    const badReport = formatReport(verifyBundle(w.cherry))
    expect(badReport).toContain('FAIL')
    expect(badReport).toContain('PASS') // the early checks still pass before the chain fold fails
    expect(badReport).toMatch(/exit 2/)
  })
})
