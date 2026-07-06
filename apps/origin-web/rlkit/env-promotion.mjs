// Origin Training Evidence — environment promotion lifecycle (P9)
// =============================================================================
// Promote an ENVIRONMENT through authoring → validation → production. This is
// DISTINCT from policy promotion: an EnvironmentPromotionReceipt binds an
// env_bundle_digest + gate results + approver + rollback target — it never promotes a
// model/policy version. EnvStatus lives ONLY on the receipt, NEVER in
// env_bundle_digest, so promoting an unchanged bundle does not change its content
// identity (same discipline that excludes created_at).
//
// "Frozen" (production) means digest-as-identity + supersede-never-mutate, NOT
// write-locked storage (that's P1 OCI/ORAS). A production bundle is superseded by a
// new bundle that re-runs the full ladder and references the prior digest as rollback.
//
// Exit codes (env:promote): 0 promoted · 5 tampered digest / a gate failed (no receipt)
// · 6 illegal status transition · 7 missing/expired approval.
// =============================================================================

import { canonical, sha256, bundleDigest } from './env-evidence.mjs'

export const EnvStatus = { AUTHORING: 'authoring', VALIDATION: 'validation', PRODUCTION: 'production' }
const ORDER = ['authoring', 'validation', 'production']

// Only an adjacent FORWARD step is legal (no skipping, no going backward).
export function allowedTransition(from, to) {
  const i = ORDER.indexOf(from)
  const j = ORDER.indexOf(to)
  return i >= 0 && j === i + 1
}

// An ApprovalPacket-shaped human approval (passport idiom): capability-scoped, TTL-aware.
export function approvalValid(a) {
  if (!a || a.capability !== 'env.promote' || a.valid === false) return false
  if (a.expires_at != null && a.now != null && a.now > a.expires_at) return false
  return true
}

// The seven gates. Pure: the caller injects the pinned verifier + the exploit/gold
// corpus (reused from P5) + the human approval, so the runner stays env-agnostic.
export function runEnvPromotionGates({ bundle, tasks, scoreFn, oracleFn, goldSuite, exploitSuite, schema, approval, versions }) {
  const results = []
  const gate = (id, ok, detail) => {
    results.push({ id, ok: Boolean(ok), detail })
    return Boolean(ok)
  }

  gate('schema_valid', schema.required.every((k) => bundle[k] !== undefined), `${schema.required.length} required bundle fields present`)
  const digestOk = gate('digest_recomputes', bundleDigest(bundle) === bundle.env_bundle_digest, 'env_bundle_digest recomputes')
  gate('verifier_pinned', bundle.verifier?.verifier_version === versions.verifier_version, `verifier ${bundle.verifier?.verifier_version}`)

  const oracleR = tasks.map((t) => scoreFn(t, oracleFn(t)))
  gate('oracle_self_consistent', oracleR.every((r) => r.passed && !r.falseAccept), `oracle passes ${oracleR.length}/${oracleR.length} tasks`)

  const goldOk = goldSuite.every((c) => scoreFn(c.task, c.actions).reward > 0)
  const exploitOk = exploitSuite.every((c) => {
    const r = scoreFn(c.task, c.actions)
    return r.patched_reward === 0 && r.is_hack === true
  })
  gate('exploit_suite_green', goldOk && exploitOk, 'every gold > 0 and every known exploit → 0')

  gate('catastrophic_zero', oracleR.every((r) => !r.falseAccept), '0 catastrophic false-accepts on the honest path')
  gate('human_approved', approvalValid(approval), approval ? `approver ${approval.approver}` : 'no approval packet')

  return { gate_results: results, allGreen: results.every((r) => r.ok), digestOk }
}

// Promote: enforce the transition + approval + gates, then emit an
// EnvironmentPromotionReceipt (or a typed non-zero code + no receipt).
export function promoteEnvironment(opts) {
  const { bundle, from, to, approval, rollbackTarget = null } = opts

  if (!allowedTransition(from, to)) return { code: 6, receipt: null, reason: `illegal transition ${from} → ${to}` }

  const { gate_results, allGreen, digestOk } = runEnvPromotionGates(opts)
  if (!digestOk) return { code: 5, receipt: null, reason: 'env_bundle_digest tampered', gate_results }
  if (!approvalValid(approval)) return { code: 7, receipt: null, reason: 'missing/expired approval', gate_results }
  if (!allGreen) return { code: 5, receipt: null, reason: 'a promotion gate failed', gate_results }

  const receipt = {
    receipt_schema_version: '1.0.0',
    kind: 'environment_promotion',
    env_bundle_digest: bundle.env_bundle_digest, // WHAT is promoted (the env), not a policy
    from_status: from,
    to_status: to,
    gate_results,
    approver: approval.approver,
    capability: approval.capability,
    rollback_target: rollbackTarget, // prior production bundle digest (null on first promotion)
    frozen: to === EnvStatus.PRODUCTION,
    frozen_note: 'digest-as-identity + supersede-never-mutate; NOT write-locked storage (that is P1 OCI/ORAS).',
  }
  receipt.receipt_digest = sha256(canonical(receipt))
  return { code: 0, receipt, gate_results }
}

// Re-run the gates on the pinned bundle and confirm the committed receipt reproduces.
export function verifyEnvPromotionReceipt(receipt, opts) {
  const { receipt_digest, ...rest } = receipt
  if (sha256(canonical(rest)) !== receipt_digest) return { ok: false, reason: 'receipt_digest self-inconsistent' }
  if (receipt.env_bundle_digest !== opts.bundle.env_bundle_digest) return { ok: false, reason: 'receipt not bound to this bundle' }
  const re = promoteEnvironment({ ...opts, from: receipt.from_status, to: receipt.to_status, rollbackTarget: receipt.rollback_target })
  if (re.code !== 0) return { ok: false, reason: `gates no longer pass (code ${re.code})` }
  if (re.receipt.receipt_digest !== receipt.receipt_digest) return { ok: false, reason: 'receipt does not reproduce' }
  return { ok: true }
}
