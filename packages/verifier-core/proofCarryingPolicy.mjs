// Proof-carrying, versioned policy.
// =============================================================================
// Clean-room. Inspired by ScopeMemory's "proof-carrying, versioned policy" idea (no code copied
// — see docs/PRIOR_ART.md).
//
// A policy is not a mutable blob you edit in place. It is a HASH-CHAINED sequence of versions:
// each version content-addresses itself and points at its parent, so the whole history is
// tamper-evident (you can't silently rewrite yesterday's policy). Each amendment CARRIES ITS
// PROOF — who authorized it and why — inside the hashed content.
//
// The load-bearing property: every DECISION is bound to the exact policy version it ran under
// (its policy_digest). So "was this action compliant?" is answerable against the policy as it
// was AT THE TIME — a later amendment can't retroactively make a past decision look compliant
// (or vice-versa). Pairs with a Sigil to sign whichever version is currently in force.
// =============================================================================

import { canonical, sha256, GENESIS } from '@origin/evidence/env-evidence'

/** Content address of a version, excluding the digest field itself. */
export function policyVersionDigest(version) {
  const { digest, ...rest } = version
  void digest
  return sha256(canonical(rest))
}

/** Genesis version (version 1). `rules` is any JSON policy body; proof = author + reason. */
export function createPolicy(rules, { author, reason, at = null } = {}) {
  const v = { policy_schema_version: '1.0.0', version: 1, parent_digest: GENESIS, rules, author, reason, at }
  v.digest = policyVersionDigest(v)
  return v
}

/** Amend a policy → a new version linking the previous one. The proof travels inside the hash. */
export function amendPolicy(prev, rules, { author, reason, at = null } = {}) {
  const v = { policy_schema_version: '1.0.0', version: prev.version + 1, parent_digest: prev.digest, rules, author, reason, at }
  v.digest = policyVersionDigest(v)
  return v
}

/**
 * Verify a full version chain (oldest → newest): each version's digest must recompute, versions
 * increment by 1, and each parent_digest must equal the previous version's digest.
 */
export function verifyPolicyChain(versions) {
  if (versions.length === 0) return { ok: false, reason: 'empty chain' }
  for (let i = 0; i < versions.length; i++) {
    const v = versions[i]
    if (policyVersionDigest(v) !== v.digest) return { ok: false, reason: `version ${v.version}: digest does not recompute (a field was altered)` }
    const expectedParent = i === 0 ? GENESIS : versions[i - 1].digest
    if (v.parent_digest !== expectedParent) return { ok: false, reason: `version ${v.version}: broken parent link (history was rewritten or reordered)` }
    if (i > 0 && v.version !== versions[i - 1].version + 1) return { ok: false, reason: `version ${v.version}: non-monotonic version number` }
  }
  return { ok: true, reason: `chain of ${versions.length} version(s) intact`, head: versions[versions.length - 1].digest }
}

/** Bind a decision to the policy version it ran under — a decision that carries its policy proof. */
export function bindDecision(policyVersion, decision) {
  return { decision, policy_digest: policyVersion.digest, policy_version: policyVersion.version, decided_under: 'proof-carrying-policy@1.0.0' }
}

/**
 * Verify a bound decision against a policy version: the decision's policy_digest must match — i.e.
 * the decision really ran under THIS version. Detects retroactive-policy-change ("the policy was
 * amended after the decision, so judging it against the new policy is dishonest").
 */
export function verifyDecisionUnderPolicy(boundDecision, policyVersion) {
  if (boundDecision.policy_digest !== policyVersion.digest) {
    return { ok: false, reason: `decision ran under policy v${boundDecision.policy_version} (${boundDecision.policy_digest.slice(0, 12)}…), not v${policyVersion.version} — policy changed after the decision` }
  }
  return { ok: true, reason: `decision is bound to policy v${policyVersion.version}` }
}
