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
import { ACTION_RUN_SCHEMA_VERSIONS } from '@origin/evidence/action-run-evidence'
import { verifySigil } from '@origin/verifier-core/sigil'
import { verifyCredential } from '@origin/verifier-core/crucible'
import { verifyReceiptInBatch } from '@origin/verifier-core/merkleBatch'
import { verifyActionRunEvidence } from '@origin/verifier-core/action-run-evidence'
import { NOT_TESTED, replayPolicyEvaluation } from '@origin/verifier-core/policyEvaluation'

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const short = (d) => String(d).slice(0, 12) + '…'

// ── report vocabulary (mirrors the /security log lines) ──────────────────────
const ok = (label, text) => ({ tone: 'ok', label, text })
const bad = (label, text) => ({ tone: 'bad', label, text })
const info = (label, text) => ({ tone: 'info', label, text })

// What each format's VALID or UNTRUSTED verdict means, printed beside it (never beside VOID).
const FORMAT_SCOPE = {
  action_run_evidence: 'signed by the key inside the record; VALID needs a published issuer key',
  sigil: 'VALID means intact and signed by the embedded key; not signer identity',
  credential: 'unsigned format: VALID means the digests recompute; anyone can make one',
  receipt: 'unsigned format: VALID means the sealed digest matches; anyone can make one',
  trace: 'unsigned format: VALID means the hash chain re-derives; anyone can make one',
  inclusion: "VALID means this receipt folds to this root; the root's signer is a separate check",
}

// A VOID result names the first check that failed and claims nothing else.
const voidScope = (firstFailedCheck) =>
  `Do not rely on this record: ${firstFailedCheck}. A VOID result establishes nothing about the policy, the requests or any agent.`
const firstBad = (lines) => lines.find((line) => line.tone === 'bad')?.text ?? 'a check failed'

/** Human names for the detected kinds (shared by the UI + selftest output). */
export const KIND_LABELS = {
  action_run_evidence: 'Action/Run Evidence — signed policy-evaluation envelope',
  sigil: 'Origin Attestation — portable signed receipt',
  credential: 'Crucible credential — config-bound reference check',
  receipt: 'ScoreReceipt — sealed score record',
  trace: 'Episode trace — hash-chained event log',
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
  if (ACTION_RUN_SCHEMA_VERSIONS.includes(value.schema_version) && typeof value.execution_mode === 'string' && typeof value.evidence_id === 'string' && typeof value.evidence_digest === 'string'
    && isObj(value.identity) && isObj(value.subject) && isObj(value.proposal) && isObj(value.authorization)
    && isObj(value.outcome_attestation) && isObj(value.provider_evidence) && isObj(value.completeness) && isObj(value.source)
    && isObj(value.signature) && isObj(value.signature.sigil))
    return 'action_run_evidence'
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

// ── Action/Run Evidence ───────────────────────────────────────────────────────
// Precedence: the first failure in the order structure → evidence digest → signature →
// freshness → replay picks the headline, the result block and the VOID scope note. Every
// failure still appears as a log line. The replay runs only once structure, digest and
// signature pass, and a stated count is shown only if the replay reproduced it.

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// A simulated record is checked against at most 30 days, whatever window it declares.
const SIMULATED_MAX_AGE_CAP_MS = 30 * DAY_MS

// "24-hour", "30-day": the window in words.
function windowWords(ms) {
  if (ms % DAY_MS === 0 && ms >= 2 * DAY_MS) return `${ms / DAY_MS}-day`
  if (ms % HOUR_MS === 0) return `${ms / HOUR_MS}-hour`
  if (ms % 60000 === 0) return `${ms / 60000}-minute`
  return `${ms}-millisecond`
}
// Date cannot represent every window a record may declare; say so instead of throwing.
const isoTime = (ms) => (Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString() : `${ms} ms after 1970-01-01`)

// The freshness lines, and the void headline used when freshness is the first failure. Picked by
// the verifier's `clock` value and freshness dimension, never by parsing failure text.
function checkFreshness(evidence, v, now) {
  const { status, observed_at: observed, max_age_ms: declared } = isObj(evidence.completeness?.freshness) ? evidence.completeness.freshness : {}
  const observedMs = Date.parse(observed)
  const invalid = bad('freshness', 'the stated freshness window is stale or invalid')
  // A record that states itself stale or unknown fails here without a clock failure.
  const notFresh = `Action/Run Evidence is void: its stated freshness status is ${status}, not fresh. The digest and signature still check.`
  if (!Number.isFinite(observedMs) || !Number.isSafeInteger(declared) || declared <= 0) return { lines: [invalid], headline: notFresh }
  const capped = evidence.execution_mode === 'simulated' && declared > SIMULATED_MAX_AGE_CAP_MS
  const windowMs = capped ? SIMULATED_MAX_AGE_CAP_MS : declared
  const window = windowWords(windowMs)
  const end = isoTime(observedMs + windowMs)
  const lines = []
  let headline = null
  if (v.clock === 'future') {
    lines.push(bad('freshness', `dated ${observed}, later than this device's clock; a record dated in the future is not fresh`))
    headline = `Action/Run Evidence is void: it is dated ${observed}, later than this device's clock. The digest and signature still check.`
  } else if (v.clock) {
    lines.push(bad('freshness', `the ${window} window ended ${end} by this device's clock`))
    headline = `Action/Run Evidence is void: its ${window} freshness window ended ${end}. The digest and signature still check.`
  } else if (!v.dimensions.fresh) {
    lines.push(invalid)
    headline = notFresh
  } else if (now === undefined) lines.push(info('freshness', 'not checked against a clock: no time was given to this verifier'))
  // The window runs from observed_at, so that is the date printed and checked.
  else lines.push(ok('freshness', `made ${observed}; the ${window} window ends ${end}; checked against this device's clock`))
  if (capped) lines.push(info('freshness', `the record declares a ${windowWords(declared)} window; this verifier caps a simulated record at 30 days`))
  return { lines, headline }
}

// A replay mismatch names the failing field in plain words (the replay returns data, not text).
const FIELD_WORDS = {
  evaluation: 'the evaluation block is malformed',
  'subject.policy_digest': 'the stated policy settings do not match subject.policy_digest',
  'subject.verifier_version': 'the stated oracle version does not match subject.verifier_version',
  'proposal.proposed_effect.selected_battery_task_ids': 'the decision rows do not match proposal.proposed_effect.selected_battery_task_ids',
  'proposal.proposed_effect.scenario': 'the stated battery does not match proposal.proposed_effect.scenario',
  'completeness.covered_ids_digest': 'the decision ids do not match completeness.covered_ids_digest',
  'completeness.expected_count': 'the summary total does not match completeness.expected_count',
  'evaluation.oracle_version': 'the stated oracle version does not belong to the stated battery',
  summary: 'the summary does not match the decision rows',
  'subject.environment_digest': 'the shipped battery does not match subject.environment_digest',
  decisions: "the decision rows do not match the shipped battery's requests",
  policy_parameters: 'the stated policy settings are not valid for this battery',
  'source.oracle_verdict_digest': 'the decision rows do not match source.oracle_verdict_digest',
}
const fieldWords = (field) => FIELD_WORDS[field] ?? `${field} does not reproduce`
const named = ({ name, version }) => `${name} ${version}`
const counted = (n, one, many, ids) => `${n} ${n === 1 ? one : many}${ids.length ? ` (${ids.join(', ')})` : ''}`

// The replay's log lines and result block (W2-VFY-15 to -18, -20a, -20b).
function replayReport(replay, evidence) {
  if (replay.status === 'absent') {
    return { lines: [], result: { status: 'absent', label: null, notTested: null,
      text: 'Result: not stated in this record. Records made before this format was added carry only digests of their decisions. Run the reference check again for a readable result.' } }
  }
  if (replay.status === 'unavailable') {
    const [diff] = replay.diffs
    return {
      lines: [bad('replay', `not replayed: this verifier ships ${diff.shipped.map(named).join(', ')}; the record names ${named(diff.named)}`)],
      result: { status: 'unavailable', label: null, notTested: null,
        text: `This record names ${named(diff.named)}, which this verifier does not ship; its stated result cannot be reproduced.` },
    }
  }
  if (replay.status === 'mismatch') {
    // A row differs on its policy decision or on its stated oracle answer (the answer key).
    const rowText = (diff, joiner) => (diff.field === 'expected'
      ? `${diff.id}'s stated oracle answer is ${diff.stated}${joiner} the oracle gives ${diff.replayed}`
      : `${diff.id} states ${diff.stated}${joiner} the replay gives ${diff.replayed}`)
    return {
      lines: replay.diffs.map((diff) => bad('replay', diff.kind === 'row' ? rowText(diff, ';') : fieldWords(diff.field))),
      result: { status: 'mismatch', label: null, notTested: null,
        text: `The stated result does not reproduce: ${replay.diffs.map((diff) => (diff.kind === 'row' ? rowText(diff, ',') : fieldWords(diff.field))).join('; ')}.` },
    }
  }
  const s = replay.summary
  const notTested = NOT_TESTED[evidence.subject.verifier_version]
  return {
    lines: [ok('replay', `re-ran the stated policy settings against the shipped ${evidence.evaluation.battery.id} battery and ${evidence.evaluation.oracle_version} oracle; all ${s.total} stated decisions reproduce`)],
    result: {
      status: 'reproduced',
      label: 'Stated in this record and reproduced in this tab:',
      text: `${s.matched} of ${s.total} synthetic decisions match the oracle (Origin's answer key) · ${counted(s.over_grants, 'over-grant', 'over-grants', s.over_grant_ids)} · ${counted(s.misses, 'miss', 'misses', s.miss_rows.map((row) => `${row.id} (${row.direction})`))}`,
      notTested: notTested ? `Not tested: ${notTested.join('; ')}.` : null,
    },
  }
}

const ACTION_RUN_LIMITS = 'A browser Reference Check is a local synthetic policy evaluation: it does not contact or execute the named agent, confirm a provider effect, or grant deployment authority.'

async function verifyActionRunEvidenceArtifact(evidence, opts) {
  const lines = [info('detected', 'Action/Run Evidence (schema_version + execution_mode + signed envelope) → verifyActionRunEvidence, offline')]
  const v = await verifyActionRunEvidence(evidence, { expectedThumbprints: opts?.expectedThumbprints, now: opts?.now, simulatedMaxAgeCapMs: SIMULATED_MAX_AGE_CAP_MS })
  const d = v.dimensions
  const notAttempted = evidence?.outcome_attestation?.status === 'not_attempted'
  const noProviderEvidence = evidence?.provider_evidence?.provider === null && evidence?.provider_evidence?.receipt_digest === null
    && evidence?.provider_evidence?.readback_digest === null && evidence?.provider_evidence?.readback_at === null
  const digestLine = d.integrity ? ok('digest', 'the unsigned envelope content-address recomputes') : bad('digest', 'the unsigned envelope content-address does not recompute')
  const signatureLine = d.signature_valid ? ok('signature', 'the signed Action/Run statement matches this envelope') : bad('signature', 'the signed Action/Run statement could not be verified')
  const coverageLine = d.complete ? ok('coverage', 'selected-battery decision coverage is complete') : bad('coverage', 'selected-battery decision coverage is partial or invalid')
  lines.push(digestLine, signatureLine)
  lines.push(info('signature labels', 'issuer, kind, thumbprint and signed_at in the signature block are not covered by the signature'))
  lines.push(d.issuer_trusted
    ? ok('issuer pin', 'the signer matches a configured key_id/key_epoch thumbprint')
    : info('issuer pin', 'no trusted thumbprint was supplied for this key_id/key_epoch; signature integrity is not issuer trust'))
  // Only a policy-only record's deny is known not to be the policy's result.
  const policyOnly = Array.isArray(evidence?.authorization?.reason_codes) && evidence.authorization.reason_codes.includes('synthetic_policy_only_no_execution_authority')
  if (evidence?.authorization?.verdict === 'deny') {
    lines.push(info('authorization', policyOnly ? "deny: this record grants no execution authority; it is not the policy's result" : 'deny: this record grants no execution authority'))
  }
  lines.push(info('outcome status', String(evidence?.outcome_attestation?.status ?? 'missing')))
  lines.push(d.provider_bound
    ? info('provider evidence', noProviderEvidence ? 'no provider receipt or readback is represented' : 'provider-evidence fields are internally consistent')
    : bad('provider evidence', 'provider-evidence fields are malformed or inconsistent'))
  lines.push(notAttempted
    ? info('execution_verified', 'false — not_attempted: no named agent execution, provider confirmation, or provider readback is represented')
    : d.execution_verified
      ? ok('execution_verified', 'true — provider-confirmed or independently verified execution is represented')
      : info('execution_verified', 'false — this envelope does not represent execution-verified evidence'))
  lines.push(coverageLine)
  const freshness = checkFreshness(evidence, v, opts?.now)
  lines.push(...freshness.lines)

  // The first of structure, coverage, digest, signature and outcome to fail; the replay runs only when none does.
  const integrityFailure = !(d.structure && d.semantics && d.authorization_valid && d.provider_bound) ? { check: 'structure', text: v.failures[0] ?? 'the record is malformed' }
    : !d.complete ? { check: 'structure', text: coverageLine.text }
      : !d.integrity ? { check: 'digest', text: digestLine.text }
        : !d.statement_bound || !d.signature_valid ? { check: 'signature', text: signatureLine.text }
          : !d.outcome_consistent ? { check: 'structure', text: v.failures.find((failure) => failure.startsWith('outcome')) ?? 'the outcome is not consistent' }
            : null
  const replay = integrityFailure ? null : replayReport(replayPolicyEvaluation(evidence), evidence)
  if (replay) lines.push(...replay.lines)
  for (const failure of v.failures) lines.push(info('verifier note', failure))

  const replayFailed = replay?.result.status === 'mismatch' || replay?.result.status === 'unavailable'
  const firstFailed = integrityFailure
    ?? (!d.fresh ? { check: 'freshness', text: firstBad(freshness.lines) } : null)
    ?? (replayFailed ? { check: 'replay', text: firstBad(replay.lines) } : null)
  const verdict = firstFailed ? 'VOID' : !d.issuer_trusted ? 'UNTRUSTED' : 'VALID'
  // Reproduced counts stay, greyed, only for a record past its window or dated in the future;
  // a record that does not state itself fresh has no window to be outside of.
  const result = replay && firstFailed?.check === 'freshness' && replay.result.status === 'reproduced'
    ? v.clock ? { ...replay.result, status: 'outside', label: 'Stated in this record (outside its freshness window):' } : null
    : replay?.result ?? null
  return {
    kind: 'action_run_evidence', ok: verdict === 'VALID', verdict, code: null,
    headline: verdict === 'VALID'
      ? notAttempted
        ? 'Action/Run Evidence is authentic under the trusted issuer pin; its raw outcome is not_attempted, so no execution effect is verified.'
        : 'Action/Run Evidence verifies under a trusted issuer pin.'
      : verdict === 'UNTRUSTED'
        ? 'Envelope integrity is checkable, but no trusted issuer thumbprint is registered; this does not represent a named-agent execution.'
        : firstFailed.check === 'freshness'
          ? freshness.headline
          : firstFailed.check === 'replay'
            ? result.status === 'unavailable'
              ? 'Action/Run Evidence is void: this verifier cannot reproduce its stated result.'
              : 'Action/Run Evidence is void: its stated result does not reproduce under this verifier.'
            : 'Action/Run Evidence is void — the envelope, signature, coverage, or freshness checks failed.',
    lines,
    result,
    scope: verdict === 'VOID'
      ? voidScope(firstFailed.text)
      : verdict === 'VALID'
        ? `Offline verification checks the deterministic envelope, coverage, freshness, and signature statement. ${ACTION_RUN_LIMITS}`
        : result?.status === 'reproduced'
          ? `Intact, and its stated result reproduces under this verifier, but the signing key is not one Origin has published, so anyone can produce a record like this. ${ACTION_RUN_LIMITS}`
          : `Intact under this verifier; no result was replayed${result?.status === 'absent' ? ' (this record states none)' : ''}. The signing key is not one Origin has published, so anyone can produce a record like this. ${ACTION_RUN_LIMITS}`,
  }
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
    scope: v.ok
      ? 'Integrity + authenticity only: the payload is byte-intact and this key signed it. It does not prove the key belongs to a real-world identity (a PKI/attestation concern), nor that the payload describes a run that actually happened. Origin Attestation codes: 0 valid · 1 payload tampered · 2 signature invalid · 3 wrong signer · 4 malformed.'
      : voidScope(firstBad(lines)),
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
    scope: v.code === 0
      ? 'Offline, this recomputes the credential’s own content-address (its Sigil) and the embedded config binding — plus any live bindings you paste alongside it ({ credential, liveConfig, envBundleDigest, versions }). It does NOT re-run the Crucible battery or prove the original run happened: replaying the run needs the pinned environment bundle + episode traces under env:verify. Crucible credential codes: 0 valid · 3 tamper · 4 drift → VOID.'
      : voidScope(firstBad(lines)),
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
      ? ok('code 0', `receipt_digest recomputes (${short(receipt_digest)}) — the fields match the sealed digest`)
      : bad('code 3', `receipt_digest mismatch — sealed ${short(receipt_digest)}, contents now hash to ${short(recomputed)}; a field was tampered after sealing`),
  )
  if (typeof receipt.env_bundle_digest === 'string')
    lines.push(info('bindings', `bound to env ${short(receipt.env_bundle_digest)} · verifier ${receipt.verifier_version ?? '(no verifier version stated)'}`))
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
    scope: intact
      ? 'Self-consistency only: the digest covers these exact fields, so an edit made without recomputing it shows as VOID; anyone can recompute it. Reproducing the SCORE itself needs the pinned environment bundle + the episode trace replayed under env:verify — this page cannot do that from the receipt alone.'
      : voidScope(firstBad(lines)),
  }
}

// Top-level TR-A002 fields that the chain or a line below checks; every other one is outside the chain.
const TR_A002_CHECKED = new Set(['artifact', 'event_count', 'sandbox', 'events', 'final_digest', 'log_digest'])
// The published chain's final_digest: a copy whose unchained `artifact` field was renamed is still checked.
const TR_A002_FINAL_DIGEST = 'ca1d4690206e4dcf3d654b907d02d2bccf9bcdc16ddc555071fec21874578b32'

// The checks scripts/verify-tr-a002.mjs makes beyond the chain. The `sandbox` fields are labels the
// generator writes: no line says or implies that a sandbox ran. On a broken chain, what the events
// say is a note, not a pass.
function trA002Lines(trace, chainOk) {
  const { event_count: n, events } = trace
  const unlabelled = events.findIndex((event) => event?.sandbox !== true)
  const live = events.findIndex((event) => event?.side_effect?.live_money === true)
  const seq = (i) => events[i]?.seq ?? i + 1
  const fields = Object.keys(trace).filter((key) => !TR_A002_CHECKED.has(key))
  const inside = chainOk ? ok : info
  return [
    trace.artifact === 'TR-A002'
      ? ok('artifact', 'artifact is TR-A002; this name sits outside the chain')
      : bad('artifact', 'artifact is not TR-A002, but final_digest is the published TR-A002 digest'),
    n === events.length ? ok('event count', `event_count is ${n} and matches the events`) : bad('event count', `event_count (${n}) does not match the ${events.length} events`),
    trace.sandbox === true
      ? ok('sandbox flag', 'the top-level field sandbox is true; it sits outside the chain and does not mean a sandbox ran')
      : bad('sandbox flag', 'the top-level field sandbox is not true'),
    unlabelled < 0
      ? inside('sandbox flags', 'every event carries the label sandbox: true (inside the chain); it does not mean a sandbox ran')
      : bad('sandbox flags', `event ${seq(unlabelled)} does not carry the label sandbox: true`),
    live < 0 ? inside('live money', 'no event claims live_money; inside the chain') : bad('live money', `event ${seq(live)} claims live_money`),
    ...(fields.length > 0
      ? [info('outside the chain', `these top-level fields are outside the chain and are not checked: ${fields.join(', ')}; changing them does not break it`)]
      : []),
  ]
}

function verifyTraceArtifact(trace) {
  const v = verifyChain(trace)
  // A failed TR-A002 line voids the trace with no code; code 2 stays reserved for a chain break.
  const published = trace.artifact === 'TR-A002' || trace.final_digest === TR_A002_FINAL_DIGEST ? trA002Lines(trace, v.ok) : []
  const failed = published.find((line) => line.tone === 'bad')
  const lines = [info('detected', 'EpisodeTrace (events[] + final_digest) → verifyChain, offline')]
  if (v.ok) {
    // Labelled by code only when that is the verdict's code.
    lines.push(
      ok(failed ? 'hash chain' : 'code 0', `every event_hash + prev_hash link re-derives across ${trace.events.length} events; the seal matches final_digest ${short(trace.final_digest)}`),
    )
  } else {
    for (const f of v.failures) lines.push(bad('code 2', `chain break — ${f}`))
  }
  lines.push(...published)
  const valid = v.ok && !failed
  return {
    kind: 'trace',
    ok: valid,
    verdict: valid ? 'VALID' : 'VOID',
    code: !v.ok ? 2 : failed ? null : 0,
    headline: !v.ok
      ? `Episode hash chain is broken (${v.failures.length} failure${v.failures.length === 1 ? '' : 's'}) — the log was altered after sealing.`
      : failed
        ? `TR-A002 is void: ${failed.text}. The hash chain itself verifies.`
        : 'Episode hash chain verifies end-to-end and is sealed.',
    lines,
    scope: valid
      ? 'A green chain proves the event log is internally hash-linked and sealed — tamper-evident, not tamper-proof, and not by itself proof that the events describe a real run. Re-scoring the recorded actions needs the pinned verifier via env:verify.'
      : voidScope(firstBad(lines)),
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
      ? 'Receipt folds to the batch root and is bound to this beneficiary.'
      : `Inclusion fails — ${v.reason}.`,
    lines,
    scope: v.ok
      ? 'Proves this exact receipt + beneficiary sits inside the batch root, without revealing the other receipts. Whether the ROOT itself is authentic is a separate check: verify the Sigil that signed the root.'
      : voidScope(firstBad(lines)),
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
      info('…', 'an Action/Run Evidence envelope (schema_version + execution_mode + evidence_digest)'),
    ],
    scope: 'Nothing was verified — and nothing you pasted left this tab.',
  }
}

/**
 * The one entry point: detect the artifact kind from its shape and run the
 * matching @origin/verifier-core / @origin/evidence verifier, offline.
 * opts.expectedThumbprint (optional) pins the issuer for Sigils only; opts.now is the
 * clock Action/Run freshness is checked against (the page passes the device clock).
 * The report's formatScope is set beside VALID and UNTRUSTED only.
 */
export async function verifyArtifact(value, opts = {}) {
  const report = await verifyByKind(value, opts)
  const scoped = report.verdict === 'VALID' || report.verdict === 'UNTRUSTED'
  return { ...report, formatScope: scoped ? FORMAT_SCOPE[report.kind] ?? null : null }
}

function verifyByKind(value, opts) {
  switch (detectArtifact(value)) {
    case 'action_run_evidence':
      return verifyActionRunEvidenceArtifact(value, opts)
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
      if (isObj(e?.side_effect) && typeof e.side_effect.amount_usd === 'number') {
        const from = e.side_effect.amount_usd
        e.side_effect.amount_usd = from + 1
        const what = /refund/.test(String(e.side_effect.tool)) ? 'refund amount' : 'amount_usd'
        return { value: copy, note: `changed event 1's ${what} $${from} → $${from + 1} without re-sealing the chain` }
      }
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
    case 'action_run_evidence': {
      const row = Array.isArray(copy.evaluation?.decisions) ? copy.evaluation.decisions[0] : null
      if (isObj(row) && typeof row.decision === 'string') {
        const from = row.decision
        row.decision = from === 'allow' ? 'deny' : 'allow'
        return { value: copy, note: `changed the stated decision for ${row.id} from ${from} to ${row.decision} without re-signing` }
      }
      copy.evidence_id = `${copy.evidence_id}-tampered`
      return { value: copy, note: 'altered evidence_id without recomputing the envelope digest or re-signing' }
    }
    default:
      return { value: copy, note: 'artifact kind not recognized — nothing tampered' }
  }
}
