// Warrant — the earned, key-bound, re-derivable authority credential.
// =============================================================================
// The claim no competitor in the agent-identity cohort can make: a Warrant is a SIGNED
// COMPUTATION, not a signed CLAIM. Everyone who signs anything (TrustReceipt, APS, BrokerAI)
// signs an assertion — "our gate said allow" — which proves the log wasn't edited, and
// nothing more. A Warrant instead carries the pinned policy version and the exact evidence
// it was computed from, so a third party re-RUNS the license policy on that evidence and
// asserts the recorded level is the ONLY level the policy could have produced. Inflate the
// level → the re-derivation disagrees → VOID. That binding to a deterministic oracle is the
// one thing a weekend clone of "Ed25519 + signed receipts" cannot reproduce.
//
// Two forgery surfaces are closed by construction:
//   • name-squatting / theft — the Warrant is bound to an agent THUMBPRINT (its public key);
//     exercising it needs a proof-of-possession signature (countersign-identity.verifyPop).
//   • evidence cherry-picking — the backing is a per-agent HASH CHAIN. The issuer signs the
//     chain_head over the agent's COMPLETE ordered verdict set at mint time. Drop the one
//     catastrophic row from an exported bundle and the re-folded head no longer matches the
//     signed head → INCOMPLETE_CHAIN, before any level is even re-derived. You cannot export
//     your way to a cleaner record than you earned.
//
// The issuer key is Origin's gym (the deterministic verifier). Verification is fully offline:
// pin the issuer thumbprint, and everything else is in the Warrant.
// =============================================================================

import { canonical, sha256, GENESIS } from '@origin/evidence/env-evidence'
import { agentThumbprint, signPayload, verifyPayload } from './countersign-identity.mjs'
import { deriveWarrantLevel, LICENSE_POLICY_VERSION } from './license-policy.mjs'

export const WARRANT_SCHEMA_VERSION = '1.0.0'
const CHAIN_TAG = 'cs-agent-chain:v1:'

/** The fields of a backing row that are bound into the per-agent chain (order matters). */
function leafContent(row) {
  return {
    agent_seq: row.agent_seq,
    audit_row_digest: row.audit_row_digest,
    scenario_id: row.scenario_id,
    split: row.split ?? null,
    passed: !!row.passed,
    reward: Number(row.reward),
    catastrophic: !!row.catastrophic,
  }
}

/**
 * Fold an agent's ordered verdict rows into a single tamper-evident chain head.
 * Each step binds the previous head + this row's content, so dropping/reordering/mutating
 * ANY row changes the head. Requires agent_seq to be contiguous 0..n-1.
 * Returns { ok, head, reason }.
 */
export function foldAgentChain(backing) {
  const rows = [...(backing ?? [])].sort((a, b) => a.agent_seq - b.agent_seq)
  let prev = GENESIS
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].agent_seq !== i) {
      return { ok: false, head: null, reason: `agent_seq gap: expected ${i}, got ${rows[i].agent_seq} (evidence row omitted or reordered)` }
    }
    prev = sha256(CHAIN_TAG + prev + '|' + canonical(leafContent(rows[i])))
  }
  return { ok: true, head: prev, reason: 'chain complete and contiguous' }
}

/**
 * Content address of a Warrant, excluding its own digest + signature AND the raw `backing`
 * array. The backing is committed via `chain_head` (a Merkle-root-style commitment that IS
 * hashed here) — so the issuer signs the head, not the inlined leaves. That is what makes
 * cherry-picking surface as INCOMPLETE_CHAIN (code 4) rather than a generic digest mismatch:
 * dropping a backing row leaves the signed head intact but the re-folded head no longer
 * matches it. Signing the root, not the leaves, is the standard construction.
 */
function warrantDigest(w) {
  const { warrant_digest, issuer_signature, backing, ...rest } = w
  void warrant_digest
  void issuer_signature
  void backing
  return sha256(canonical(rest))
}

/**
 * Mint a Warrant for an agent from its COMPLETE, ordered, digest-valid verdict set.
 * The caller (the gym) is the issuer; it holds the issuer private key. `backing` MUST be the
 * agent's full history — mint computes chain_head over all of it and signs it, so a later
 * partial presentation is detectable.
 */
export function mintWarrant({
  agentThumbprint: agent,
  backing,
  versions,
  capabilityManifestDigest,
  issuerPrivateJwk,
  issuerThumbprint,
  issuedAt = null,
  epoch = 0,
  freshnessWindowMs = null,
  policyOpts = {},
}) {
  const chain = foldAgentChain(backing)
  if (!chain.ok) throw new Error(`mintWarrant: backing is not a contiguous agent chain — ${chain.reason}`)
  const derivation = deriveWarrantLevel(backing, policyOpts)

  const warrant = {
    warrant_schema_version: WARRANT_SCHEMA_VERSION,
    subject: 'agent',
    agent_thumbprint: agent,
    license_level: derivation.level,
    derivation, // the issuer's shown work — re-derived and checked on verify
    license_policy_version: LICENSE_POLICY_VERSION,
    verifier_version: versions?.verifier_version ?? null,
    reward_model_version: versions?.reward_model_version ?? null,
    environment_name: versions?.environment_name ?? null,
    capability_manifest_digest: capabilityManifestDigest ?? null,
    backing: [...backing]
      .sort((a, b) => a.agent_seq - b.agent_seq)
      .map((r) => ({
        agent_seq: r.agent_seq,
        trace_id: r.trace_id ?? null,
        audit_row_digest: r.audit_row_digest,
        scenario_id: r.scenario_id,
        split: r.split ?? null,
        passed: !!r.passed,
        reward: Number(r.reward),
        catastrophic: !!r.catastrophic,
      })),
    chain_head: chain.head,
    n_episodes: backing.length,
    issuer_thumbprint: issuerThumbprint ?? null,
    epoch, // monotonic revocation epoch; a fresher epoch supersedes older Warrants
    issued_at: issuedAt,
    freshness_window_ms: freshnessWindowMs,
    reproducibility: 'evidence-bound: level re-derives from backing under the pinned policy; chain_head binds the complete verdict set',
  }
  warrant.warrant_digest = warrantDigest(warrant)
  warrant.issuer_signature = issuerPrivateJwk ? signPayload({ warrant_digest: warrant.warrant_digest }, issuerPrivateJwk) : null
  return warrant
}

/**
 * Verify a Warrant fully offline. Returns { ok, code, level, reason, checks }.
 *   codes: 0 valid · 1 tampered (self-digest) · 2 bad issuer signature ·
 *          3 level inflation (re-derived level != claimed) · 4 incomplete/forged chain ·
 *          5 wrong issuer (thumbprint pin failed) · 6 stale (epoch/freshness) · 7 malformed.
 *
 * @param opts.issuerPublicJwk   the pinned gym issuer key (authenticity).
 * @param opts.expectedIssuerThumbprint  optional pin of WHICH issuer (rejects valid-but-wrong signer).
 * @param opts.capabilityManifestDigest  optional pin of the level→scope manifest in force.
 * @param opts.now / opts.minEpoch       optional freshness / revocation-epoch checks.
 */
export function verifyWarrant(warrant, opts = {}) {
  const checks = []
  const pass = (m) => (checks.push(['PASS', m]), true)
  const fail = (code, m) => ({ ok: false, code, level: null, reason: m, checks: (checks.push(['FAIL', m]), checks) })

  if (!warrant || typeof warrant !== 'object' || typeof warrant.warrant_digest !== 'string' || !Array.isArray(warrant.backing)) {
    return fail(7, 'malformed Warrant (missing digest or backing)')
  }

  // 1 — integrity: the self-digest recomputes → no field was altered.
  if (warrantDigest(warrant) !== warrant.warrant_digest) return fail(1, 'warrant_digest mismatch — a field was tampered')
  pass('warrant_digest recomputes — nothing altered')

  // 2 — authenticity: the issuer signature over the digest verifies with the pinned key.
  if (opts.issuerPublicJwk) {
    if (!warrant.issuer_signature || !verifyPayload({ warrant_digest: warrant.warrant_digest }, warrant.issuer_signature, opts.issuerPublicJwk)) {
      return fail(2, 'issuer signature invalid for the pinned issuer key')
    }
    pass('issuer signature valid')
    // 5 — optional issuer pin: the signer must be THIS issuer.
    if (opts.expectedIssuerThumbprint) {
      const t = agentThumbprint(opts.issuerPublicJwk)
      if (t !== opts.expectedIssuerThumbprint || (warrant.issuer_thumbprint && warrant.issuer_thumbprint !== opts.expectedIssuerThumbprint)) {
        return fail(5, 'signed by an unexpected issuer (thumbprint pin failed)')
      }
      pass('issuer thumbprint matches the pinned gym')
    }
  }

  // 4 — completeness: the backing re-folds to the SIGNED chain_head. Cherry-picking breaks this.
  const chain = foldAgentChain(warrant.backing)
  if (!chain.ok) return fail(4, `incomplete agent chain — ${chain.reason}`)
  if (chain.head !== warrant.chain_head) return fail(4, 'chain_head mismatch — the backing is not the complete verdict set the issuer signed')
  if (warrant.n_episodes !== warrant.backing.length) return fail(4, `n_episodes (${warrant.n_episodes}) != presented rows (${warrant.backing.length})`)
  pass(`agent chain complete — ${warrant.backing.length} contiguous rows fold to the signed head`)

  // 3 — the payoff: re-derive the level from the backing under the PINNED policy.
  const rederived = deriveWarrantLevel(warrant.backing, warrant.derivation?.params ?? {})
  if (rederived.level !== warrant.license_level) {
    return fail(3, `level inflation — Warrant claims ${warrant.license_level} but the policy re-derives ${rederived.level}`)
  }
  pass(`level ${warrant.license_level} re-derives from the evidence (not asserted — computed)`)

  // 6 — optional revocation epoch / freshness.
  if (opts.minEpoch !== undefined && Number(warrant.epoch) < Number(opts.minEpoch)) {
    return fail(6, `stale epoch ${warrant.epoch} < required ${opts.minEpoch} (superseded/revoked)`)
  }
  if (opts.now !== undefined && warrant.freshness_window_ms && warrant.issued_at != null) {
    if (opts.now - warrant.issued_at > warrant.freshness_window_ms) {
      return fail(6, `Warrant is stale — issued ${opts.now - warrant.issued_at}ms ago, window ${warrant.freshness_window_ms}ms`)
    }
  }
  if (opts.capabilityManifestDigest && warrant.capability_manifest_digest && warrant.capability_manifest_digest !== opts.capabilityManifestDigest) {
    return fail(5, 'capability manifest drift — Warrant was minted under a different level→scope policy')
  }

  return { ok: true, code: 0, level: warrant.license_level, reason: `valid — ${warrant.license_level} earned and re-derived from ${warrant.backing.length} episodes`, checks }
}
