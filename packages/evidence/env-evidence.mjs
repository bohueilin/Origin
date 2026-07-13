// Origin Training Evidence — evidence core (@origin/evidence)
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

import { toolsDigest, policiesDigest, registryDigest } from './env-manifest.mjs'
import { buildCostLedger, rateDigest } from './cost-ledger.mjs'

export const GENESIS = '0'.repeat(64) // null hash — chain anchor

// ── canonical JSON: keys sorted at every level, no whitespace, UTF-8. Same as
//    generate-tr-a002.mjs `canonical` and evidence/digest.ts `stableStringify`.
//
// `undefined` handling matches JSON.stringify (DET-1 fix): an object key whose
// value is undefined (or a function/symbol) is OMITTED, and an undefined array
// element (or hole/function/symbol) serializes to null. The old fall-through
// emitted the literal token `undefined` — not valid JSON, not round-trippable,
// and unreproducible by any independent JSON implementation. Only previously
// INVALID inputs change; every JSON-safe value serializes byte-identically to
// before, so committed digests do not move (asserted by env-evidence.test.ts).
export function canonical(value) {
  // Honor toJSON exactly like JSON.stringify does (Date, and any object exposing
  // toJSON). DET-2 fix: without this, a Date fell through to the object branch below
  // and canonicalized as `{}` — so two receipts differing only in a Date field
  // (distinct timestamps) content-addressed identically (digest collision), and an
  // independent verifier using JSON.stringify computed a DIFFERENT digest.
  if (value && typeof value === 'object' && typeof value.toJSON === 'function') {
    return canonical(value.toJSON())
  }
  if (Array.isArray(value)) {
    // Array.from (not .map) so sparse holes are visited and serialize as null too.
    return '[' + Array.from(value, (v) => canonical(v) ?? 'null').join(',') + ']'
  }
  if (value && typeof value === 'object') {
    // Fail closed on the silent-`{}` footgun: Map/Set (and other class instances
    // without toJSON) have no enumerable own keys, so they would canonicalize as
    // `{}` — two distinct values sharing one digest. Evidence must be plain JSON.
    if (value instanceof Map || value instanceof Set) {
      throw new TypeError('canonical(): Map/Set are not JSON-serializable evidence — pass a plain object/array')
    }
    const keys = Object.keys(value).sort()
    const parts = []
    for (const k of keys) {
      const piece = canonical(value[k])
      if (piece !== undefined) parts.push(JSON.stringify(k) + ':' + piece) // omit undefined-valued keys
    }
    return '{' + parts.join(',') + '}'
  }
  return JSON.stringify(value) // strings / numbers / booleans / null; undefined/function/symbol → undefined
}

// ── SHA-256 (synchronous, isomorphic) ────────────────────────────────────────
// In Node this module binds the exact node:crypto path it has always used —
// identical digests, native speed, nothing about committed traces moves. In a
// browser bundle it binds the pure-JS FIPS 180-4 implementation below instead.
// Byte-identity between the two paths is asserted by sha256-identity.test.ts
// (committed digests depend on exact hashes, so divergence is a test failure).
// WebCrypto is deliberately NOT used: crypto.subtle.digest is async-only and the
// evidence core's hash-chain API is synchronous by design.
const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])
const rotr = (x, n) => ((x >>> n) | (x << (32 - n))) >>> 0

/** Pure-JS synchronous SHA-256 over the UTF-8 bytes of `str` → lowercase hex.
 *  The browser path. Exported for the byte-identity test only — production
 *  callers use `sha256`, which picks the right path once at module load. */
export function sha256Js(str) {
  const data = new TextEncoder().encode(str)
  const padded = new Uint8Array((((data.length + 8) >> 6) + 1) << 6)
  padded.set(data)
  padded[data.length] = 0x80
  const dv = new DataView(padded.buffer)
  dv.setUint32(padded.length - 8, Math.floor(data.length / 0x20000000)) // bit-length, high 32
  dv.setUint32(padded.length - 4, (data.length << 3) >>> 0) //             bit-length, low 32
  const H = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])
  const w = new Uint32Array(64)
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }
    let [a, b, c, d, e, f, g, h] = H
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + K256[i] + w[i]) >>> 0
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) >>> 0
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0
    }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h
  }
  let hex = ''
  for (let i = 0; i < 8; i++) hex += H[i].toString(16).padStart(8, '0')
  return hex
}

// Node → node:crypto (unchanged digests); browser → sha256Js. Selected once, here.
// The specifier is computed + @vite-ignore'd so bundlers neither resolve nor
// polyfill node:crypto; the guarded branch simply never runs in a browser.
let nodeCreateHash = null
if (typeof process !== 'undefined' && process.versions?.node) {
  const nodeCryptoSpecifier = 'node:crypto'
  const { createHash } = await import(/* @vite-ignore */ nodeCryptoSpecifier)
  nodeCreateHash = createHash
}
export const sha256 = nodeCreateHash
  ? (s) => nodeCreateHash('sha256').update(s, 'utf8').digest('hex')
  : sha256Js

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
// resumable checkpoint path (@origin/verifier-core/checkpoint, P7) both fold through it, so an
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
  // The sealing event is the last event. Accept both sealing conventions: the
  // EpisodeTrace emitter uses { event_type: 'episode.sealed' }; the published
  // TR-A002 evidence package uses { action: 'evidence.digest_sealed' }. Either
  // marker is fine — the event's own hash (below) still binds every field, so a
  // tampered sealing event breaks the chain regardless of which name it carries.
  const last = trace.events?.[trace.events.length - 1]
  const sealMarker = last && (last.event_type ?? last.action)
  if (!last || (sealMarker !== 'episode.sealed' && sealMarker !== 'evidence.digest_sealed'))
    failures.push('missing sealing event')
  if (last && trace.final_digest !== last.event_hash) failures.push('final_digest != sealing hash')
  if (trace.log_digest !== sha256(canonical((trace.events || []).map((e) => e.event_hash))))
    failures.push('log_digest')
  return { ok: failures.length === 0, failures }
}

// ── the recorded actions, extracted from action.applied events (in order).
//    ONLY action.applied enters the score-authoritative trace — tool.call/tool.result
//    (P3) and cost events (P6) are evidence, never score inputs (Goodhart guard).
export const recordedActions = (trace) =>
  (trace.events || []).filter((e) => e.event_type === 'action.applied').map((e) => e.payload.action)

// ── the recorded tool calls (P3 evidence): every authorized-or-denied MCP call.
export const recordedToolCalls = (trace) => (trace.events || []).filter((e) => e.event_type === 'tool.call')

// ── build a ScoreReceipt from a scoring result. `rollout` is a WarehouseRollout-
//    shaped object: { reward, passed, category, falseAccept, falseReject }.
export function buildScoreReceipt({ episode, envBundleDigest, rollout, versions, licenseLevel, cost }) {
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
  // the scoreFn (env/reward-module.ts scoreReward) returns them deterministically.
  if (rollout.is_hack !== undefined) {
    receipt.raw_reward = rollout.raw_reward
    receipt.patched_reward = rollout.patched_reward
    receipt.is_hack = rollout.is_hack
    receipt.exploit_cluster = rollout.exploit_cluster
  }
  // P6 — the cost ledger, folded in BEFORE the digest (so tampering cost → digest drift).
  if (cost != null) receipt.cost = cost
  receipt.receipt_digest = sha256(canonical(receipt))
  return receipt
}

// ── P6: a signed adjudication for a disputed score. Settles ONLY the Computation
//    class — a green replay means the stored score/cost reproduced under the pinned
//    verifier. It does NOT settle Definition (right reward?) or Governance (approved?).
export function adjudicate({ code, bundle, receipt }) {
  const outcome = code === 0 ? 'RESOLVED_FOR' : code === 3 ? 'RESOLVED_AGAINST' : 'UNRESOLVED'
  const adj = {
    adjudication_schema_version: '1.0.0',
    dispute_class: 'Computation',
    outcome, // RESOLVED_FOR (reproduced) · RESOLVED_AGAINST (score/cost mismatch) · UNRESOLVED (chain/bundle drift)
    exit_code: code,
    env_bundle_digest: bundle?.env_bundle_digest ?? null,
    receipt_digest: receipt?.receipt_digest ?? null,
    verifier_version: receipt?.verifier_version ?? null,
    settles: 'Computation only',
    note: 'A green replay means the stored score + cost reproduced under the pinned verifier. This does NOT settle Definition (is this the right verifier/reward?) or Governance (who approved this version?). A reproducible score is not thereby correct, legitimate, or approved.',
  }
  adj.adjudication_digest = sha256(canonical(adj))
  return adj
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

  // 1b — the (unsigned) trace header carries task/seed, but final_digest only covers
  //      events[]. Bind provenance: the header task.id/seed MUST match the chain-bound
  //      episode.started payload, so a verified trace's "produced under this task/seed"
  //      claim cannot be relabeled without breaking the chain. (Full header-into-seal
  //      binding incl. policy_version is a versioned seal-digest migration — AUDIT_REPORT
  //      moat-sdk-2.) episode.task is also what scoreFn is fed below, so this stops a
  //      re-scored reward being attributed to a different task than the one recorded.
  {
    const started = episode.events?.find((e) => e.event_type === 'episode.started')
    const p = started?.payload
    if (started && p && episode.task) {
      if (episode.task.id != null && p.task_id != null && episode.task.id !== p.task_id)
        return bad(3, `header task.id (${episode.task.id}) != chain-bound episode.started task_id (${p.task_id}) — provenance relabeled`)
      if (episode.task.seed != null && p.seed != null && episode.task.seed !== p.seed)
        return bad(3, `header task.seed (${episode.task.seed}) != chain-bound episode.started seed (${p.seed}) — provenance relabeled`)
      ok('header task/seed match the chain-bound episode.started payload')
    }
  }

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
    // P3 — the MCP tool-registry authorization (scopes + rate limits) is pinned.
    if (bundle.registry_digest != null) {
      if (registryDigest(bundle.tools || []) !== bundle.registry_digest)
        return bad(4, 'registry_digest inconsistent with the pinned tool authorization (scope/rate_limit)')
      ok('registry_digest recomputes from the pinned tool authorization')
    }
    // P6 — the cost rate model is pinned; a rate change is drift (governance event).
    if (bundle.rate_digest != null) {
      if (rateDigest(bundle.cost_model) !== bundle.rate_digest)
        return bad(4, 'rate_digest inconsistent with the pinned cost_model')
      ok('rate_digest recomputes from the pinned cost model')
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

  // 5a — the receipt is SELF-CONSISTENT: its digest matches its own contents. Catches a
  //      field tampered without re-sealing the digest (e.g. a forged cost or is_hack),
  //      which the from-scratch recompute below would otherwise silently override.
  {
    const { receipt_digest: storedDigest, ...restReceipt } = receipt
    if (sha256(canonical(restReceipt)) !== storedDigest)
      return bad(3, 'receipt_digest does not match the receipt contents — a receipt field was tampered')
  }
  ok('receipt is self-consistent (digest matches its contents)')

  // 5 — recompute the whole receipt digest from the fresh score (catches any field tamper).
  //     P6: rebuild the cost ledger deterministically (sandbox_seconds = applied steps,
  //     storage = canonical({task,actions}) bytes, tokens = 0 for the deterministic gym)
  //     so a tampered cost surfaces here as a receipt_digest drift → exit 3.
  const licenseLevel = licenseFn([
    { passed: rollout.passed, reward: rollout.reward, catastrophic: rollout.falseAccept },
  ])
  let cost
  if (receipt.cost != null && bundle?.cost_model != null) {
    // UTF-8 byte count — TextEncoder (not Buffer) so this path also runs in a browser.
    const storage_bytes = new TextEncoder().encode(canonical({ task: episode.task, actions })).length
    cost = buildCostLedger({
      sandbox_seconds: actions.length,
      tokens: { in: 0, out: 0 },
      storage_bytes,
      verifier_ms: 0,
      reward: rollout.reward,
      costModel: bundle.cost_model,
    })
  }
  const recomputed = buildScoreReceipt({
    episode,
    envBundleDigest: receipt.env_bundle_digest,
    rollout,
    versions: { verifier_version: receipt.verifier_version, reward_model_version: receipt.reward_model_version },
    licenseLevel,
    cost,
  })
  if (recomputed.receipt_digest !== receipt.receipt_digest)
    return bad(3, `receipt_digest mismatch (a receipt field — reward, license, or cost — was tampered)`)
  ok('receipt_digest recomputes — score is reproducible under this verifier')
  if (cost) ok(`cost ledger reproduces (total $${cost.total_usd} · reward/$ ${cost.reward_per_dollar})`)

  return { code: 0, checks }
}
