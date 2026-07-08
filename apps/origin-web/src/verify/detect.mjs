// /verify — pure artifact detection + verification core (no React, no DOM).
// =============================================================================
// The ONE module both consumers import, so the browser page and the Node
// self-test exercise the identical code path (same .mjs + .d.mts discipline
// as @origin/verifier-core itself — no logic duplicated, no mocks):
//
//   • src/verify/VerifyPage.tsx  — the /verify browser UI
//   • src/verify/selftest.mjs    — the Node self-test (node src/verify/selftest.mjs)
//
// Detection is shape-based and conservative, most-specific first:
//
//   pubkey_jwk + signature + payload_digest         → Sigil               → verifySigil
//   credential_digest + config_digest               → Crucible credential → verifyCredential
//   { credential: { credential_digest }, …bindings }→ credential + live bindings (same)
//   beneficiary + receipt + proof{leaf,proof[]} + root → inclusion proof  → verifyReceiptInBatch
//   receipt_digest                                  → ScoreReceipt        → digest recompute
//   events[] + final_digest                         → EpisodeTrace        → verifyChain
//
// Honesty rails (match the rest of the site): a green verdict means
// "reproducible under this verifier" — never "safe", "correct", or "certified".
// Everything runs client-side/offline; the per-kind `scope` string states
// exactly what an offline check can and cannot prove.
// =============================================================================

import { canonical, sha256, verifyChain } from '@origin/evidence/env-evidence'
import { verifySigil } from '@origin/verifier-core/sigil'
import { verifyCredential } from '@origin/verifier-core/crucible'
import { verifyReceiptInBatch } from '@origin/verifier-core/merkleBatch'

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const short = (d) => String(d).slice(0, 12) + '…'

// ── report vocabulary (mirrors the /security log lines) ──────────────────────
const ok = (label, text) => ({ tone: 'ok', label, text })
const bad = (label, text) => ({ tone: 'bad', label, text })
const info = (label, text) => ({ tone: 'info', label, text })

/** Human names for the detected kinds (shared by the UI + selftest output). */
export const KIND_LABELS = {
  sigil: 'Sigil — portable signed receipt',
  credential: 'Crucible credential — config-bound reference check',
  receipt: 'ScoreReceipt — sealed score record',
  trace: 'EpisodeTrace — hash-chained event log',
  inclusion: 'Merkle inclusion proof — receipt-in-signed-batch',
  unknown: 'Unrecognized artifact',
}

/**
 * Detect the artifact kind from its shape. Order matters: a Sigil may WRAP a
 * credential or receipt in its payload, so the outer signature fields win;
 * a credential carries receipt_digests (plural) but never receipt_digest.
 */
export function detectArtifact(value) {
  if (!isObj(value)) return 'unknown'
  if (isObj(value.pubkey_jwk) && typeof value.signature === 'string' && typeof value.payload_digest === 'string')
    return 'sigil'
  if (typeof value.credential_digest === 'string' && typeof value.config_digest === 'string')
    return 'credential'
  if (isObj(value.credential) && typeof value.credential.credential_digest === 'string')
    return 'credential' // { credential, liveConfig?, envBundleDigest?, versions? } — cred + live bindings
  if (isObj(value.proof) && Array.isArray(value.proof.proof) && typeof value.root === 'string' && 'receipt' in value)
    return 'inclusion'
  if (typeof value.receipt_digest === 'string') return 'receipt'
  if (Array.isArray(value.events) && typeof value.final_digest === 'string') return 'trace'
  return 'unknown'
}

/** Strict-ish JSON intake: one artifact object per paste. */
export function parseArtifact(text) {
  const trimmed = String(text ?? '').trim()
  if (!trimmed) return { ok: false, error: 'nothing pasted yet' }
  try {
    return { ok: true, value: JSON.parse(trimmed) }
  } catch (e) {
    return { ok: false, error: `not valid JSON (${e instanceof Error ? e.message : String(e)})` }
  }
}

// ── per-kind verifiers → one normalized report shape ─────────────────────────

async function verifySigilArtifact(sigil, opts) {
  const lines = [info('detected', 'Sigil (pubkey_jwk + signature + payload_digest) → verifySigil, offline')]
  const pin = opts?.expectedThumbprint ? { expectedThumbprint: opts.expectedThumbprint } : {}
  if (pin.expectedThumbprint) lines.push(info('issuer pin', `requiring signer thumbprint ${short(pin.expectedThumbprint)}`))
  const v = await verifySigil(sigil, pin)
  lines.push(
    v.ok
      ? ok(`code ${v.code}`, `${v.reason} — content-address ${short(sigil.payload_digest)}, signer ${short(sigil.thumbprint ?? '(no thumbprint)')}`)
      : bad(`code ${v.code}`, v.reason),
  )
  return {
    kind: 'sigil',
    ok: v.ok,
    verdict: v.ok ? 'VALID' : 'VOID',
    code: v.code,
    headline: v.ok ? 'Sigil verifies — content intact, signed by the embedded key.' : `Sigil is void — ${v.reason}.`,
    lines,
    scope:
      'Integrity + authenticity only: the payload is byte-intact and this key signed it. It does not prove the key belongs to a real-world identity (a PKI/attestation concern), nor that the payload describes a run that actually happened. Codes: 0 valid · 1 payload tampered · 2 signature invalid · 3 wrong signer · 4 malformed.',
  }
}

function verifyCredentialArtifact(value) {
  // Bare credential, or a { credential, liveConfig?, envBundleDigest?, versions? } bundle.
  const bundled = isObj(value.credential)
  const args = bundled
    ? { credential: value.credential, liveConfig: value.liveConfig, envBundleDigest: value.envBundleDigest, versions: value.versions }
    : { credential: value }
  const provided = bundled
    ? ['liveConfig', 'envBundleDigest', 'versions'].filter((k) => value[k] != null)
    : []
  const lines = [
    info('detected', 'Crucible credential (credential_digest + config_digest) → verifyCredential, offline'),
    provided.length > 0
      ? info('live bindings', `provided alongside the credential: ${provided.join(', ')} — checked for drift`)
      : info('live bindings', 'none provided — checking the credential’s self-consistency only'),
  ]
  const v = verifyCredential(args)
  for (const [status, msg] of v.checks) lines.push(status === 'PASS' ? ok('check', msg) : bad(`code ${v.code}`, msg))
  const lastFail = v.checks.filter(([s]) => s === 'FAIL').map(([, m]) => m).pop()
  return {
    kind: 'credential',
    ok: v.code === 0,
    verdict: v.code === 0 ? 'VALID' : 'VOID',
    code: v.code,
    headline:
      v.code === 0
        ? 'Credential is self-consistent under this verifier — digest and config binding recompute.'
        : `Credential is void — ${lastFail ?? 'a check failed'}.`,
    lines,
    scope:
      'Offline, this recomputes the credential’s own content-address (its Sigil) and the embedded config binding — plus any live bindings you paste alongside it ({ credential, liveConfig, envBundleDigest, versions }). It does NOT re-run the certification battery or prove the original run happened: replaying the run needs the pinned environment bundle + episode traces under env:verify. Codes: 0 valid · 3 tamper · 4 drift → VOID.',
  }
}

function verifyReceiptArtifact(receipt) {
  // Self-consistency — exactly check 5a of env:verify (verifyEpisode): the sealed
  // digest must match the receipt's own contents. Same code vocabulary (0 / 3).
  const { receipt_digest, ...rest } = receipt
  const recomputed = sha256(canonical(rest))
  const intact = recomputed === receipt_digest
  const lines = [info('detected', 'ScoreReceipt (receipt_digest) → recompute sha256(canonical(receipt)), offline')]
  lines.push(
    intact
      ? ok('code 0', `receipt_digest recomputes (${short(receipt_digest)}) — no field was altered after sealing`)
      : bad('code 3', `receipt_digest mismatch — sealed ${short(receipt_digest)}, contents now hash to ${short(recomputed)}; a field was tampered after sealing`),
  )
  if (typeof receipt.env_bundle_digest === 'string')
    lines.push(info('bindings', `bound to env ${short(receipt.env_bundle_digest)} · verifier ${receipt.verifier_version ?? '(unpinned)'}`))
  if (typeof receipt.recorded_actions_digest === 'string')
    lines.push(info('bindings', `bound to the recorded action trace ${short(receipt.recorded_actions_digest)}`))
  return {
    kind: 'receipt',
    ok: intact,
    verdict: intact ? 'VALID' : 'VOID',
    code: intact ? 0 : 3,
    headline: intact
      ? 'ScoreReceipt is self-consistent — the sealed digest matches its contents.'
      : 'ScoreReceipt is void — a field was altered after the digest was sealed.',
    lines,
    scope:
      'Self-consistency only: the digest seals these exact fields, so any post-hoc edit is tamper-evident. Reproducing the SCORE itself needs the pinned environment bundle + the episode trace replayed under env:verify — this page cannot do that from the receipt alone.',
  }
}

function verifyTraceArtifact(trace) {
  const v = verifyChain(trace)
  const lines = [info('detected', 'EpisodeTrace (events[] + final_digest) → verifyChain, offline')]
  if (v.ok) {
    lines.push(
      ok('code 0', `every event_hash + prev_hash link re-derives across ${trace.events.length} events; the seal matches final_digest ${short(trace.final_digest)}`),
    )
  } else {
    for (const f of v.failures) lines.push(bad('code 2', `chain break — ${f}`))
  }
  return {
    kind: 'trace',
    ok: v.ok,
    verdict: v.ok ? 'VALID' : 'VOID',
    code: v.ok ? 0 : 2,
    headline: v.ok
      ? 'Episode hash chain verifies end-to-end and is sealed.'
      : `Episode hash chain is broken (${v.failures.length} failure${v.failures.length === 1 ? '' : 's'}) — the log was altered after sealing.`,
    lines,
    scope:
      'A green chain proves the event log is internally hash-linked and sealed — tamper-evident, not tamper-proof, and not by itself proof that the events describe a real run. Re-scoring the recorded actions needs the pinned verifier via env:verify.',
  }
}

function verifyInclusionArtifact(value) {
  const lines = [info('detected', 'Merkle inclusion proof (beneficiary + receipt + proof + root) → verifyReceiptInBatch, offline')]
  const v = verifyReceiptInBatch({ beneficiary: value.beneficiary, receipt: value.receipt }, value.proof, value.root)
  lines.push(
    v.ok
      ? ok('included', `${v.reason} — ${value.proof.proof.length} sibling hash${value.proof.proof.length === 1 ? '' : 'es'} fold to root ${short(value.root)} (count-bound, ${value.proof.count} leaves)`)
      : bad('not included', v.reason),
  )
  return {
    kind: 'inclusion',
    ok: v.ok,
    verdict: v.ok ? 'VALID' : 'VOID',
    code: null,
    headline: v.ok
      ? 'Receipt is provably included in the batch commitment, bound to this beneficiary.'
      : `Inclusion fails — ${v.reason}.`,
    lines,
    scope:
      'Proves this exact receipt + beneficiary sits inside the batch root, without revealing the other receipts. Whether the ROOT itself is authentic is a separate check: verify the Sigil that signed the root.',
  }
}

function unknownReport() {
  return {
    kind: 'unknown',
    ok: false,
    verdict: 'UNRECOGNIZED',
    code: null,
    headline: 'This JSON does not match any Origin evidence artifact shape.',
    lines: [
      info('expected one of', 'a Sigil (pubkey_jwk + signature + payload_digest)'),
      info('…', 'a Crucible credential (credential_digest + config_digest), alone or as { credential, liveConfig, … }'),
      info('…', 'a ScoreReceipt (receipt_digest)'),
      info('…', 'an EpisodeTrace (events[] + final_digest)'),
      info('…', 'a Merkle inclusion proof (beneficiary + receipt + proof + root)'),
    ],
    scope: 'Nothing was verified — and nothing you pasted left this tab.',
  }
}

/**
 * The one entry point: detect the artifact kind from its shape and run the
 * matching @origin/verifier-core / @origin/evidence verifier, offline.
 * opts.expectedThumbprint (optional) pins the issuer for Sigils only.
 */
export async function verifyArtifact(value, opts = {}) {
  switch (detectArtifact(value)) {
    case 'sigil':
      return verifySigilArtifact(value, opts)
    case 'credential':
      return verifyCredentialArtifact(value)
    case 'inclusion':
      return verifyInclusionArtifact(value)
    case 'receipt':
      return verifyReceiptArtifact(value)
    case 'trace':
      return verifyTraceArtifact(value)
    default:
      return unknownReport()
  }
}

// ── the visceral proof: flip one field, watch it void ────────────────────────
const flipHexChar = (s) => (typeof s === 'string' && s.length > 0 ? (s[0] === '0' ? '1' : '0') + s.slice(1) : s)

/**
 * Return a tampered deep copy of an artifact (the original is untouched) plus a
 * human note describing the flip. Works on the built-in examples AND on pasted
 * artifacts. The tamper never re-signs / re-seals — that is the whole point.
 */
export function tamperArtifact(kind, artifact) {
  const copy = structuredClone(artifact)
  switch (kind) {
    case 'sigil': {
      if (isObj(copy.payload)) {
        const had = typeof copy.payload.reward === 'number'
        copy.payload = { ...copy.payload, reward: 999 }
        return { value: copy, note: had ? 'flipped payload.reward → 999 without re-signing' : 'injected payload.reward = 999 without re-signing' }
      }
      copy.payload = 'tampered'
      return { value: copy, note: 'replaced the signed payload without re-signing' }
    }
    case 'credential': {
      const cred = isObj(copy.credential) ? copy.credential : copy
      if (typeof cred.pass_rate === 'number') {
        cred.pass_rate = 0.999
        return { value: copy, note: 'inflated pass_rate → 0.999 without re-minting the credential' }
      }
      cred.rsl_level = 'L4'
      return { value: copy, note: 'inflated rsl_level → L4 without re-minting the credential' }
    }
    case 'receipt': {
      if (typeof copy.reward === 'number') {
        copy.reward = 999
        return { value: copy, note: 'flipped reward → 999 after the digest was sealed' }
      }
      copy.tampered = true
      return { value: copy, note: 'added a field after the digest was sealed' }
    }
    case 'trace': {
      const e = Array.isArray(copy.events) && copy.events.length > 0 ? copy.events[0] : null
      if (e) {
        e.payload = { ...(isObj(e.payload) ? e.payload : {}), tampered: true }
        return { value: copy, note: 'rewrote event #1’s payload inside the sealed chain' }
      }
      copy.final_digest = flipHexChar(copy.final_digest)
      return { value: copy, note: 'flipped one character of final_digest' }
    }
    case 'inclusion': {
      if (isObj(copy.receipt)) {
        copy.receipt = { ...copy.receipt, reward: 999 }
        return { value: copy, note: 'altered the receipt while keeping its original inclusion proof' }
      }
      copy.root = flipHexChar(copy.root)
      return { value: copy, note: 'flipped one character of the batch root' }
    }
    default:
      return { value: copy, note: 'artifact kind not recognized — nothing tampered' }
  }
}
