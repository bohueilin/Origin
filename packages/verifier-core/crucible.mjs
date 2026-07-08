// Crucible — config-bound agent certification (the "reference check for agents").
// =============================================================================
// Clean-room. Inspired by Diploma.ai's config-bound credential + before/after lift
// and the Bad-agents IAM-gym idea (no code copied — see docs/PRIOR_ART.md). The
// difference that is our moat: the credential is issued by Origin's DETERMINISTIC
// oracle (env:verify + the RSL readiness ladder), not a self-authored rubric.
//
// A Crucible credential binds a readiness verdict to the agent's EXACT configuration
// (model + tools + context + harness) AND the environment it was tested in. Change any
// of them and the credential VOIDS — you cannot carry a cert earned by one config onto
// another. It emits a content-addressed Sigil (credential_digest) into the evidence chain.
//
// Honesty rails: the verdict comes from the deterministic oracle only; "certified" means
// "reproducible readiness under this verifier + this config," never "safe" or "correct."
// =============================================================================

import { canonical, sha256 } from '@origin/evidence/env-evidence'

const round4 = (n) => Math.round(n * 10000) / 10000

/** The exact-configuration fingerprint: any change to model/tools/context/harness moves it. */
export function configDigest(agentConfig) {
  return sha256(canonical(agentConfig))
}

/** Before/after lift — the Diploma insight: a cold model vs. the same model + the right harness. */
export function computeLift(coldPassRate, harnessedPassRate) {
  return round4(harnessedPassRate - coldPassRate)
}

// Mint a config-bound credential from oracle verdicts. `receiptDigests` are the score
// receipts (or score digests) that back it — the credential never floats free of them.
export function mintCredential({
  agentConfig,
  envBundleDigest,
  versions,
  rslLevel,
  nTasks,
  coldPassRate,
  harnessedPassRate,
  receiptDigests,
  issuedAt = null,
}) {
  const credential = {
    credential_schema_version: '1.0.0',
    subject: 'agent',
    agent_config: agentConfig, // model + tools + context + harness — the exact config
    config_digest: configDigest(agentConfig),
    env_bundle_digest: envBundleDigest, // the environment it was certified against
    verifier_version: versions.verifier_version,
    reward_model_version: versions.reward_model_version,
    rsl_level: rslLevel, // the readiness license earned (L0–L4)
    n_tasks: nTasks,
    cold_pass_rate: round4(coldPassRate),
    pass_rate: round4(harnessedPassRate),
    lift: computeLift(coldPassRate, harnessedPassRate),
    receipt_digests: [...receiptDigests].sort(),
    issued_at: issuedAt,
    reproducibility: 'config-bound: voids if model/tools/context/harness or the environment change',
  }
  credential.credential_digest = sha256(canonical(credential)) // the Sigil (content-addressed)
  return credential
}

// Verify a credential against a LIVE agent config + the pinned env/verifier.
//   codes: 0 valid · 3 credential tamper (Sigil mismatch) · 4 config/env/verifier drift → VOID
export function verifyCredential({ credential, liveConfig, envBundleDigest, versions }) {
  const checks = []
  const ok = (m) => (checks.push(['PASS', m]), true)
  const bad = (code, m) => ({ code, checks: (checks.push(['FAIL', m]), checks) })

  // 1 — the Sigil recomputes → no field was altered.
  const { credential_digest, ...rest } = credential
  if (sha256(canonical(rest)) !== credential_digest) return bad(3, 'credential_digest (Sigil) mismatch — a field was tampered')
  ok('credential_digest (Sigil) recomputes — nothing was altered')

  // 2 — config binding: recompute config_digest from the LIVE config; any drift → VOID.
  if (liveConfig) {
    if (configDigest(liveConfig) !== credential.config_digest)
      return bad(4, 'config drift — credential VOID (model/tools/context/harness changed)')
    ok('agent config matches the certified configuration')
  } else if (configDigest(credential.agent_config) !== credential.config_digest) {
    return bad(4, 'config_digest inconsistent with the embedded agent_config')
  }

  // 3 — environment + verifier binding.
  if (envBundleDigest && credential.env_bundle_digest !== envBundleDigest) return bad(4, 'env_bundle drift — VOID')
  if (versions && credential.verifier_version !== versions.verifier_version) return bad(4, 'verifier drift — VOID')
  ok(`bound to env ${String(credential.env_bundle_digest).slice(0, 12)}… + verifier ${credential.verifier_version} · RSL ${credential.rsl_level}`)

  return { code: 0, checks }
}
