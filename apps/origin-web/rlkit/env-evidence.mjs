// Origin Training Evidence — rlkit core
// =============================================================================
// Reproducible score receipts for agent training. This module is the pure,
// verifier-agnostic backbone shared by the generator (scripts/gen-env-evidence.mjs)
// and the replay CLI (scripts/env-verify.mjs).
//
// Guarantee (narrow, honest): a ScoreReceipt is reproducible from a pinned
// EnvironmentBundle, a recorded action trace, and a pinned verifier. Generation
// with hosted models is NOT reproduced here — the recorded actions are the
// authority, and re-scoring them under the pinned verifier reproduces the reward.
//
// Reuses, verbatim, the tamper-evident pattern from scripts/generate-tr-a002.mjs
// (canonical JSON + SHA-256 hash chain + sealing digest) and the allowlist-digest
// discipline from server/evidence/digest.ts.
// =============================================================================

import { createHash } from 'node:crypto'
import { toolsDigest, policiesDigest } from './env-manifest.mjs'

export const GENESIS = '0'.repeat(64) // null hash — chain anchor

// ── canonical JSON: keys sorted at every level, no whitespace, UTF-8. Same as
//    generate-tr-a002.mjs `canonical` and evidence/digest.ts `stableStringify`.
export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}'
  }
  return JSON.stringify(value) // strings / numbers / booleans / null
}
export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex')

// ── EnvironmentBundle digest — content identity over everything that can move a
//    score, EXCLUDING created_at + the digest field itself (avoids round-trip
//    false-mismatch, exactly like DIGEST_FIELDS excludes created_at/audit_row_digest).
export function bundleDigest(manifest) {
  const rest = { ...manifest }
  delete rest.created_at
  delete rest.env_bundle_digest
  return sha256(canonical(rest))
}

// ── recorded-actions digest — binds a ScoreReceipt to the exact action trace.
export const recordedActionsDigest = (actions) => sha256(canonical(actions))

// ── EpisodeTrace: hash-chain a list of step payloads and append a sealing event.
//    header: { trace_schema_version, episode_id, env_bundle_digest, policy_version,
//              verifier_version, seed, task }
//    step:   { event_type, step_index?, payload? }
//
// openEpisode is the ONE hashing implementation. `chainEpisode` (one-shot) and the
// resumable checkpoint path (rlkit/checkpoint.mjs, P7) both fold through it, so an
// interrupted-then-resumed episode reproduces the byte-identical final_digest of the
// uninterrupted run. Do not duplicate this hashing anywhere.
export function openEpisode(header) {
  let prev = GENESIS
  const events = []
  let sealed = false

  function appendStep(s) {
    if (sealed) throw new Error('openEpisode: cannot appendStep after seal()')
    const i = events.length
    const payload = {
      seq: i + 1,
      event_id: `evt_${String(i + 1).padStart(3, '0')}`,
      event_type: s.event_type,
      step_index: s.step_index ?? null,
      payload: s.payload ?? null,
      payload_digest: s.payload == null ? null : sha256(canonical(s.payload)),
    }
    const event_hash = sha256(canonical({ ...payload, prev_hash: prev }))
    const out = { ...payload, prev_hash: prev, event_hash }
    prev = event_hash
    events.push(out)
    return out
  }

  function seal() {
    if (sealed) throw new Error('openEpisode: already sealed')
    // sealing event — commits the chain root (like TR-A002's evidence.digest_sealed)
    const sealPayload = {
      seq: events.length + 1,
      event_id: `evt_${String(events.length + 1).padStart(3, '0')}`,
      event_type: 'episode.sealed',
      step_index: null,
      payload: null,
      payload_digest: null,
      chain_root: prev,
    }
    const seal_hash = sha256(canonical({ ...sealPayload, prev_hash: prev }))
    events.push({ ...sealPayload, prev_hash: prev, event_hash: seal_hash })
    sealed = true
    return {
      ...header,
      event_count: events.length,
      final_digest: seal_hash,
      log_digest: sha256(canonical(events.map((e) => e.event_hash))),
      events,
    }
  }

  return {
    appendStep,
    seal,
    // chain tip event_hash after the last appended step (the resume anchor, P7)
    get tip() { return prev },
    // number of appended (non-seal) events so far
    get length() { return events.length },
    get sealed() { return sealed },
  }
}

export function chainEpisode(header, steps) {
  const b = openEpisode(header)
  for (const s of steps) b.appendStep(s)
  return b.seal()
}

// ── verify the chain: re-derive every event_hash + prev_hash link + the seal.
export function verifyChain(trace) {
  const failures = []
  let prev = GENESIS
  for (const e of trace.events || []) {
    const { event_hash, ...payload } = e
    if (payload.prev_hash !== prev) failures.push(`event ${e.seq} prev_hash link`)
    if (sha256(canonical(payload)) !== event_hash) failures.push(`event ${e.seq} event_hash`)
    prev = event_hash
  }
  const last = trace.events?.[trace.events.length - 1]
  if (!last || last.event_type !== 'episode.sealed') failures.push('missing sealing event')
  if (last && trace.final_digest !== last.event_hash) failures.push('final_digest != sealing hash')
  if (trace.log_digest !== sha256(canonical((trace.events || []).map((e) => e.event_hash))))
    failures.push('log_digest')
  return { ok: failures.length === 0, failures }
}

// ── the recorded actions, extracted from action.applied events (in order).
export const recordedActions = (trace) =>
  (trace.events || []).filter((e) => e.event_type === 'action.applied').map((e) => e.payload.action)

// ── build a ScoreReceipt from a scoring result. `rollout` is a WarehouseRollout-
//    shaped object: { reward, passed, category, falseAccept, falseReject }.
export function buildScoreReceipt({ episode, envBundleDigest, rollout, versions, licenseLevel }) {
  const receipt = {
    receipt_schema_version: '1.0.0',
    episode_id: episode.episode_id,
    env_bundle_digest: envBundleDigest,
    verifier_version: versions.verifier_version,
    reward_model_version: versions.reward_model_version,
    recorded_actions_digest: recordedActionsDigest(recordedActions(episode)),
    reward: rollout.reward,
    passed: rollout.passed,
    category: rollout.category,
    catastrophic: rollout.falseAccept, // executing finish when the oracle says not-finish
    false_accept: rollout.falseAccept,
    false_reject: rollout.falseReject,
    license_level: licenseLevel,
    reproducibility: 'deterministic-from-recorded-actions',
  }
  // P5 — when the reward module classified reward-hacking, carry it on the receipt.
  // Evidence only; the license already reflects `catastrophic`. These reproduce because
  // the scoreFn (rlkit/reward-module.ts scoreReward) returns them deterministically.
  if (rollout.is_hack !== undefined) {
    receipt.raw_reward = rollout.raw_reward
    receipt.patched_reward = rollout.patched_reward
    receipt.is_hack = rollout.is_hack
    receipt.exploit_cluster = rollout.exploit_cluster
  }
  receipt.receipt_digest = sha256(canonical(receipt))
  return receipt
}

// ── env:verify core. Re-derives everything from the recorded trace + pinned
//    verifier and compares to the stored ScoreReceipt.
//    scoreFn(task, actions) -> { reward, passed, category, falseAccept, falseReject }
//    licenseFn([{passed,reward,catastrophic}]) -> level id string
//    Returns { code, checks }: 0 verified · 2 chain tamper · 3 reward/receipt mismatch · 4 verifier/bundle drift.
export function verifyEpisode({ episode, receipt, bundle, scoreFn, licenseFn }) {
  const checks = []
  const ok = (m) => (checks.push(['PASS', m]), true)
  const bad = (code, m) => ({ code, checks: (checks.push(['FAIL', m]), checks) })

  // 1 — episode hash chain
  const chain = verifyChain(episode)
  if (!chain.ok) return bad(2, `episode chain: ${chain.failures.join('; ')}`)
  ok(`episode hash chain verifies (${episode.events.length} events)`)

  // 2 — bundle integrity + version pins (drift = exit 4)
  if (bundle) {
    const d = bundleDigest(bundle)
    if (d !== bundle.env_bundle_digest) return bad(4, `env_bundle_digest drift (${d} != ${bundle.env_bundle_digest})`)
    ok('env_bundle_digest recomputes')
    if (episode.env_bundle_digest !== bundle.env_bundle_digest) return bad(4, 'episode not bound to this bundle')
    if (receipt.env_bundle_digest !== bundle.env_bundle_digest) return bad(4, 'receipt not bound to this bundle')
    ok('episode + receipt bound to the bundle digest')
    if (bundle.verifier?.verifier_version !== receipt.verifier_version)
      return bad(4, `verifier_version drift (bundle ${bundle.verifier?.verifier_version} != receipt ${receipt.verifier_version})`)
    ok(`verifier_version pinned (${receipt.verifier_version})`)
    // P1 — the pinned tool surface + policy set are content-addressed sub-artifacts.
    // Recompute their rollups from the bundle entries; a rollup that disagrees with
    // its own tools[]/policies[] is drift (exit 4). (Any edit to tools[]/policies[]
    // also moves env_bundle_digest above; this is the more specific diagnostic.)
    if (bundle.tools_digest != null) {
      if (toolsDigest(bundle.tools || []) !== bundle.tools_digest)
        return bad(4, 'tools_digest inconsistent with the pinned tools[]')
      ok(`tools_digest recomputes from the pinned tool set (${(bundle.tools || []).length} tools)`)
    }
    if (bundle.policies_digest != null) {
      if (policiesDigest(bundle.policies || []) !== bundle.policies_digest)
        return bad(4, 'policies_digest inconsistent with the pinned policies[]')
      ok(`policies_digest recomputes from the pinned policy set (${(bundle.policies || []).length} policies)`)
    }
  }

  // 3 — recorded actions bind the receipt
  const actions = recordedActions(episode)
  if (recordedActionsDigest(actions) !== receipt.recorded_actions_digest)
    return bad(3, 'recorded_actions_digest mismatch — receipt not bound to these actions')
  ok('recorded_actions_digest binds the receipt to the action trace')

  // 4 — re-run the pinned verifier on the recorded actions
  const rollout = scoreFn(episode.task, actions)
  if (rollout.reward !== receipt.reward)
    return bad(3, `reward mismatch (re-scored ${rollout.reward} != receipt ${receipt.reward})`)
  ok(`reward reproduces under the pinned verifier (${rollout.reward})`)

  // 5 — recompute the whole receipt digest from the fresh score (catches any field tamper)
  const licenseLevel = licenseFn([
    { passed: rollout.passed, reward: rollout.reward, catastrophic: rollout.falseAccept },
  ])
  const recomputed = buildScoreReceipt({
    episode,
    envBundleDigest: receipt.env_bundle_digest,
    rollout,
    versions: { verifier_version: receipt.verifier_version, reward_model_version: receipt.reward_model_version },
    licenseLevel,
  })
  if (recomputed.receipt_digest !== receipt.receipt_digest)
    return bad(3, `receipt_digest mismatch (a receipt field was tampered)`)
  ok('receipt_digest recomputes — score is reproducible under this verifier')

  return { code: 0, checks }
}
