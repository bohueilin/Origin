// /verify self-test — exercises the page's ACTUAL logic in Node (no browser, no mocks).
// =============================================================================
//   node apps/origin-web/src/verify/selftest.mjs
//
// Imports the SAME ./detect.mjs + ./examples.mjs the React page uses (which in
// turn import the same '@origin/verifier-core/*' + '@origin/evidence/*'
// specifiers), and walks every detect→verify→tamper path. Prints PASS/FAIL per
// path; exits non-zero on any FAIL.
// =============================================================================

import { readFileSync } from 'node:fs'
import { detectArtifact, verifyArtifact, tamperArtifact, parseArtifact } from './detect.mjs'
import { makeExample } from './examples.mjs'
import { generateSigningKey, keyThumbprint, signSigil } from '@origin/verifier-core/sigil'
import { actionRunEvidenceDigest } from '@origin/evidence/action-run-evidence'

let failures = 0
function check(name, cond, detail = '') {
  const status = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`${status}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── 0 · Signed browser Action/Run envelope: unpinned and not execution verified
const actionIssued = '2026-09-12T00:00:00.000Z'
const actionRun = await makeExample('action-run', { issuedAt: actionIssued })
check('browser policy-evaluation example detects as Action/Run Evidence', detectArtifact(actionRun) === 'action_run_evidence')
const actionNow = '2026-09-12T00:01:00.000Z'
const actionRunUntrusted = await verifyArtifact(actionRun, { now: actionNow })
check('browser policy-evaluation is UNTRUSTED, never execution-verified VALID', !actionRunUntrusted.ok && actionRunUntrusted.verdict === 'UNTRUSTED')
check('browser policy-evaluation says no provider readback occurred', actionRunUntrusted.lines.some((line) => line.text.includes('no named agent execution, provider confirmation, or provider readback')))
const actionThumbprint = await keyThumbprint(actionRun.signature.sigil.pubkey_jwk)
const actionPinned = await verifyArtifact(actionRun, { expectedThumbprints: { 'origin-browser-session': { 1: actionThumbprint } }, now: actionNow })
check('correct Action/Run key_id + epoch pin makes authentic not_attempted evidence VALID', actionPinned.ok && actionPinned.verdict === 'VALID' && actionPinned.lines.some((line) => line.label === 'issuer pin' && line.text.includes('matches')) && actionPinned.lines.some((line) => line.label === 'execution_verified' && line.text.startsWith('false')))
const actionWrongSigner = await verifyArtifact(actionRun, { expectedThumbprints: { 'origin-browser-session': { 1: '0'.repeat(64) } }, now: actionNow })
check('wrong Action/Run signer pin → VOID', !actionWrongSigner.ok && actionWrongSigner.verdict === 'VOID')
const actionWrongEpochArtifact = structuredClone(actionRun)
actionWrongEpochArtifact.signature.key_epoch = 2
const actionWrongEpoch = await verifyArtifact(actionWrongEpochArtifact, { expectedThumbprints: { 'origin-browser-session': { 2: actionThumbprint } }, now: actionNow })
check('wrong Action/Run key epoch → VOID', !actionWrongEpoch.ok && actionWrongEpoch.verdict === 'VOID')
const actionRunTampered = tamperArtifact('action_run_evidence', actionRun)
const actionRunVoid = await verifyArtifact(actionRunTampered.value, { now: actionNow })
check('Action/Run envelope tamper → VOID', !actionRunVoid.ok && actionRunVoid.verdict === 'VOID', actionRunTampered.note)

// ── 0b · Action/Run precedence: structure → evidence digest → signature → freshness → replay.
//         The first failure picks the headline, the result block and the VOID scope note.
const DAY = 24 * 60 * 60 * 1000
const at = (ms) => new Date(Date.parse(actionIssued) + ms).toISOString()
const bads = (report) => report.lines.filter((line) => line.tone === 'bad')
const lineOk = (report, label) => report.lines.some((line) => line.label === label && line.tone === 'ok')
const TODAY_VOID = 'Action/Run Evidence is void — the envelope, signature, coverage, or freshness checks failed.'
// Edit a record, recompute its digest and sign it with a new key: what anyone can do.
async function resign(record, edit) {
  const copy = structuredClone(record)
  edit(copy)
  copy.evidence_digest = actionRunEvidenceDigest(copy)
  const statement = { artifact_type: 'origin.action-run-evidence', schema_version: copy.schema_version, evidence_digest: copy.evidence_digest, key_id: 'forger', key_epoch: 1 }
  copy.signature = { key_id: 'forger', key_epoch: 1, sigil: await signSigil(statement, await generateSigningKey(), { issuer: 'forger', kind: 'origin.action-run-evidence', signed_at: copy.issued_at }) }
  return copy
}

check('1.1.0 example states 4 of 12, 6 over-grants and 2 looser misses, reproduced in this tab',
  actionRunUntrusted.result?.status === 'reproduced'
  && actionRunUntrusted.result.label === 'Stated in this record and reproduced in this tab:'
  && actionRunUntrusted.result.text === "4 of 12 synthetic decisions match the oracle (Origin's answer key) · 6 over-grants (sup-03, sup-04, sup-07, sup-08, sup-09, sup-12) · 2 misses (sup-02 (looser), sup-10 (looser))"
  && actionRunUntrusted.result.notTested === 'Not tested: named agent or model behavior; provider or real-system effects; requests outside this battery; whether this answer key encodes your policy.')
check('1.1.0 UNTRUSTED: replay line, match scope and the format scope beside the verdict',
  actionRunUntrusted.lines.some((line) => line.tone === 'ok' && line.label === 'replay' && line.text === 're-ran the stated policy settings against the shipped support battery and support-oracle-v1 oracle; all 12 stated decisions reproduce')
  && actionRunUntrusted.scope.startsWith('Intact, and its stated result reproduces under this verifier, but the signing key is not one Origin has published')
  && actionRunUntrusted.formatScope === 'signed by the key inside the record; VALID needs a published issuer key')
check('1.1.0 under an issuer pin is VALID with the same result block', actionPinned.verdict === 'VALID' && actionPinned.result?.status === 'reproduced')
check('wrong signer pin hides the result block (signature fails first)', actionWrongSigner.result === null && actionWrongSigner.headline === TODAY_VOID)

const noBlock = await verifyArtifact(await resign(actionRun, (r) => { r.evaluation = null }), { now: actionNow })
check('row 1 structure: a 1.1.0 record with evaluation null is VOID, result hidden',
  noBlock.verdict === 'VOID' && noBlock.result === null && noBlock.headline === TODAY_VOID && noBlock.formatScope === null
  && noBlock.scope === 'Do not rely on this record: evaluation: required plain object missing or malformed. A VOID result establishes nothing about the policy, the requests or any agent.', noBlock.scope)
const relabelled = await verifyArtifact(await resign(actionRun, (r) => { r.schema_version = '1.0.0' }), { now: actionNow })
check('row 1 structure: a 1.0.0 record carrying evaluation is VOID, result hidden', relabelled.verdict === 'VOID' && relabelled.result === null)

const flipped = tamperArtifact('action_run_evidence', actionRun)
const flippedReport = await verifyArtifact(flipped.value, { now: actionNow })
check('row 2 digest: a decision flipped without re-signing is VOID at the digest, result hidden',
  flipped.note === 'changed the stated decision for sup-01 from allow to deny without re-signing'
  && flippedReport.verdict === 'VOID' && flippedReport.result === null && !flippedReport.lines.some((line) => line.label === 'replay')
  && flippedReport.scope.startsWith('Do not rely on this record: the unsigned envelope content-address does not recompute.'), flipped.note)

const corrupt = (record) => { const s = record.signature.sigil.signature; record.signature.sigil.signature = (s[0] === 'A' ? 'B' : 'A') + s.slice(1) }
const badSignature = structuredClone(actionRun)
corrupt(badSignature)
const badSignatureReport = await verifyArtifact(badSignature, { now: actionNow })
check('row 3 signature: a corrupted signature is VOID, result hidden',
  badSignatureReport.verdict === 'VOID' && badSignatureReport.result === null && lineOk(badSignatureReport, 'digest') && !lineOk(badSignatureReport, 'signature'))
const staleBadSignature = await verifyArtifact(badSignature, { now: at(31 * DAY) })
check('row 3 before row 4: stale with a corrupted signature reports the signature first',
  staleBadSignature.verdict === 'VOID' && staleBadSignature.headline === TODAY_VOID && staleBadSignature.result === null
  && staleBadSignature.scope.startsWith('Do not rely on this record: the signed Action/Run statement could not be verified.'))

const stale = await verifyArtifact(actionRun, { now: at(31 * DAY) })
check('row 4 freshness: 31 days after issue is VOID for freshness only; digest and signature still check',
  stale.verdict === 'VOID' && lineOk(stale, 'digest') && lineOk(stale, 'signature')
  && stale.headline === 'Action/Run Evidence is void: its 30-day freshness window ended 2026-10-12T00:00:00.000Z. The digest and signature still check.'
  && bads(stale).length === 1 && bads(stale)[0].text === "the 30-day window ended 2026-10-12T00:00:00.000Z by this device's clock", stale.headline)
check('row 4 freshness: the reproduced counts show greyed under the outside-window label',
  stale.result?.status === 'outside' && stale.result.label === 'Stated in this record (outside its freshness window):' && stale.result.text.startsWith('4 of 12'))
const future = await verifyArtifact(actionRun, { now: at(-10 * 60 * 1000) })
check('row 4 freshness: a record dated in the future gets the second headline and the outside-window counts',
  future.verdict === 'VOID' && future.headline === "Action/Run Evidence is void: it is dated 2026-09-12T00:00:00.000Z, later than this device's clock. The digest and signature still check."
  && future.lines.some((line) => line.tone === 'bad' && line.text === "dated 2026-09-12T00:00:00.000Z, later than this device's clock; a record dated in the future is not fresh")
  && future.result?.status === 'outside', future.headline)
const staleFlip = await verifyArtifact(await resign(actionRun, (r) => { r.evaluation.decisions[1].decision = 'deny' }), { now: at(31 * DAY) })
check('row 4 over 5c: a stale record whose replay does not reproduce takes the freshness headline and the mismatch block, no counts',
  staleFlip.verdict === 'VOID' && staleFlip.headline === stale.headline && staleFlip.result?.status === 'mismatch' && !/\bof \d+\b/.test(staleFlip.result.text), staleFlip.result?.text)
const notFresh = async (freshness, now) => verifyArtifact(await resign(actionRun, (r) => { r.completeness.freshness = freshness }), { now })
const unknownFreshness = await notFresh({ status: 'unknown', observed_at: null, max_age_ms: null }, actionNow)
const statedStale = await notFresh({ ...actionRun.completeness.freshness, status: 'stale' }, at(31 * DAY))
check('row 4 freshness: a record stating itself unknown or stale is VOID for that, with no outside-window counts',
  [[unknownFreshness, 'unknown'], [statedStale, 'stale']].every(([report, status]) => report.verdict === 'VOID' && report.result === null
    && report.headline === `Action/Run Evidence is void: its stated freshness status is ${status}, not fresh. The digest and signature still check.`), `${unknownFreshness.headline} | ${statedStale.headline}`)
const laterIssue = await verifyArtifact(await resign(actionRun, (r) => { r.issued_at = '2099-01-01T00:00:00.000Z' }), { now: actionNow })
check('a 1.1.0 record whose issued_at is not its observed_at is VOID at the structure check and prints no 2099 date',
  laterIssue.verdict === 'VOID' && laterIssue.result === null && !laterIssue.lines.some((line) => line.text.includes('2099'))
  && laterIssue.scope.startsWith('Do not rely on this record: issued_at: must equal completeness.freshness.observed_at.'), laterIssue.scope)
const tenYears = await resign(actionRun, (r) => { r.completeness.freshness.max_age_ms = 3650 * DAY })
const capped = await verifyArtifact(tenYears, { now: at(31 * DAY) })
check('row 4 freshness: a simulated record declaring 3650 days is checked against 30 and is VOID, not only noted',
  capped.verdict === 'VOID'
  && capped.headline === 'Action/Run Evidence is void: its 30-day freshness window ended 2026-10-12T00:00:00.000Z. The digest and signature still check.'
  && capped.lines.some((line) => line.tone === 'info' && line.text === 'the record declares a 3650-day window; this verifier caps a simulated record at 30 days'), capped.headline)
const cappedFresh = await verifyArtifact(tenYears, { now: actionNow })
check('a capped simulated record inside 30 days is UNTRUSTED and says the window is 30 days',
  cappedFresh.verdict === 'UNTRUSTED' && cappedFresh.lines.some((line) => line.tone === 'ok' && line.text === "made 2026-09-12T00:00:00.000Z; the 30-day window ends 2026-10-12T00:00:00.000Z; checked against this device's clock"))

const MISMATCH = 'Action/Run Evidence is void: its stated result does not reproduce under this verifier.'
const settings = await verifyArtifact(await resign(actionRun, (r) => { r.evaluation.policy_parameters.refundCap = 50 }), { now: actionNow })
check('row 5a replay: settings edited without the policy digest name the field',
  settings.verdict === 'VOID' && settings.headline === MISMATCH
  && settings.result?.text === 'The stated result does not reproduce: the stated policy settings do not match subject.policy_digest.'
  && settings.lines.some((line) => line.tone === 'bad' && line.label === 'replay' && line.text === 'the stated policy settings do not match subject.policy_digest'), settings.result?.text)
const resignedFlip = await verifyArtifact(await resign(flipped.value, () => {}), { now: actionNow })
check('row 5 replay: a decision flipped and re-signed with another key is VOID with the mismatch named',
  resignedFlip.verdict === 'VOID' && resignedFlip.headline === MISMATCH && resignedFlip.result?.status === 'mismatch'
  && lineOk(resignedFlip, 'digest') && lineOk(resignedFlip, 'signature'), resignedFlip.result?.text)
const missFlip = await verifyArtifact(await resign(actionRun, (r) => { r.evaluation.decisions[1].decision = 'deny' }), { now: actionNow })
check('row 5c replay: a re-signed flip that keeps the counts names the row and the verdict digest',
  missFlip.verdict === 'VOID' && missFlip.headline === MISMATCH
  && missFlip.result?.text === 'The stated result does not reproduce: sup-02 states deny, the replay gives allow; the decision rows do not match source.oracle_verdict_digest.'
  && missFlip.lines.some((line) => line.tone === 'bad' && line.text === 'sup-02 states deny; the replay gives allow'), missFlip.result?.text)
const answerKey = await verifyArtifact(await resign(actionRun, (r) => {
  r.evaluation.decisions[1].expected = 'allow'
  r.evaluation.summary.matched += 1
  r.evaluation.summary.misses -= 1
}), { now: actionNow })
check('row 5c replay: an edited oracle answer is named as the answer, not as the decision',
  answerKey.verdict === 'VOID' && answerKey.headline === MISMATCH
  && answerKey.result?.text === "The stated result does not reproduce: sup-02's stated oracle answer is allow, the oracle gives escalate; the decision rows do not match source.oracle_verdict_digest; the summary does not match the decision rows."
  && answerKey.lines.some((line) => line.tone === 'bad' && line.text === "sup-02's stated oracle answer is allow; the oracle gives escalate"), answerKey.result?.text)
const bothFields = await verifyArtifact(await resign(actionRun, (r) => { Object.assign(r.evaluation.decisions[0], { decision: 'deny', expected: 'deny' }) }), { now: actionNow })
const bothReplayLines = bothFields.lines.filter((line) => line.label === 'replay').map((line) => line.text)
check('row 5c replay: a row whose decision and oracle answer both differ gets two different sentences',
  bothFields.result?.text.startsWith("The stated result does not reproduce: sup-01's stated oracle answer is deny, the oracle gives allow; sup-01 states deny, the replay gives allow;")
  && new Set(bothReplayLines).size === bothReplayLines.length, bothFields.result?.text)
const otherOracle = await verifyArtifact(await resign(actionRun, (r) => { r.evaluation.oracle_version = 'iam-oracle-v1'; r.subject.verifier_version = 'iam-oracle-v1' }), { now: actionNow })
check('row 5 replay: an oracle shipped for the other battery is a mismatch in plain words',
  otherOracle.verdict === 'VOID' && otherOracle.headline === MISMATCH
  && otherOracle.result?.text === 'The stated result does not reproduce: the stated oracle version does not belong to the stated battery.', otherOracle.result?.text)
const selfContradicting = await verifyArtifact(await resign(actionRun, (r) => { r.proposal.proposed_effect.scenario = 'iam'; r.completeness.covered_ids_digest = 'f'.repeat(64) }), { now: actionNow })
check('row 5a replay: a scenario or covered-ids digest that contradicts the rows is named in plain words',
  selfContradicting.verdict === 'VOID' && selfContradicting.headline === MISMATCH
  && selfContradicting.result?.text === 'The stated result does not reproduce: the stated battery does not match proposal.proposed_effect.scenario; the decision ids do not match completeness.covered_ids_digest.', selfContradicting.result?.text)
const authorizationLine = (report) => report.lines.find((line) => line.label === 'authorization')?.text
const otherDeny = await verifyArtifact(await resign(actionRun, (r) => { r.authorization.reason_codes = ['policy_denied'] }), { now: actionNow })
check('a deny says it is not the policy\'s result only on a policy-only record',
  authorizationLine(actionRunUntrusted) === "deny: this record grants no execution authority; it is not the policy's result"
  && authorizationLine(otherDeny) === 'deny: this record grants no execution authority', authorizationLine(otherDeny))
const renamed = await verifyArtifact(await resign(actionRun, (r) => { r.evaluation.battery.version = 'support-gym-v9' }), { now: actionNow })
check('row 5b replay: a battery this verifier does not ship is VOID with no counts and a bad replay line',
  renamed.verdict === 'VOID' && renamed.headline === 'Action/Run Evidence is void: this verifier cannot reproduce its stated result.'
  && renamed.result?.status === 'unavailable' && renamed.result.notTested === null && !/\bof \d+\b/.test(renamed.result.text)
  && renamed.result.text === 'This record names support support-gym-v9, which this verifier does not ship; its stated result cannot be reproduced.'
  && renamed.lines.some((line) => line.tone === 'bad' && line.label === 'replay' && line.text === 'not replayed: this verifier ships support support-gym-v1, iam iam-gym-v1; the record names support support-gym-v9'), renamed.result?.text)
const staleRenamed = await verifyArtifact(await resign(actionRun, (r) => { r.evaluation.battery.version = 'support-gym-v9' }), { now: at(31 * DAY) })
check('row 4 over 5b: a stale record naming an unknown battery takes the freshness headline and the unavailable block',
  staleRenamed.headline.startsWith('Action/Run Evidence is void: its 30-day freshness window ended') && staleRenamed.result?.status === 'unavailable')

// ── 0c · Backward compatibility: a 1.0.0 record made before the format stated its result
const legacy = JSON.parse(readFileSync(new URL('./fixtures/action-run-1.0.0.json', import.meta.url), 'utf8'))
const legacyInside = await verifyArtifact(legacy, { now: '2026-11-13T07:17:46.858Z' })
check('1.0.0 fixture inside its 24-hour window is UNTRUSTED with "Result: not stated"',
  detectArtifact(legacy) === 'action_run_evidence' && legacyInside.verdict === 'UNTRUSTED' && legacyInside.result?.status === 'absent'
  && legacyInside.result.text.startsWith('Result: not stated in this record.') && legacyInside.scope.includes('no result was replayed (this record states none)'))
const legacyAfter = await verifyArtifact(legacy, { now: '2026-11-14T07:17:46.858Z' })
check('1.0.0 fixture after its window is VOID for freshness only, with the 24-hour headline',
  legacyAfter.verdict === 'VOID' && lineOk(legacyAfter, 'digest') && lineOk(legacyAfter, 'signature') && legacyAfter.result?.status === 'absent'
  && legacyAfter.headline === 'Action/Run Evidence is void: its 24-hour freshness window ended 2026-11-14T07:16:46.858Z. The digest and signature still check.', legacyAfter.headline)
check('an unknown schema version stays unrecognized', detectArtifact({ ...legacy, schema_version: '1.2.0' }) === 'unknown')
const legacyRedated = await verifyArtifact(await resign(legacy, (r) => { r.issued_at = '2099-01-01T00:00:00.000Z' }), { now: '2026-11-13T07:17:46.858Z' })
check('the freshness pass line prints observed_at, the date the window was checked from, not issued_at',
  legacyRedated.lines.some((line) => line.tone === 'ok' && line.text === "made 2026-11-13T07:16:46.858Z; the 24-hour window ends 2026-11-14T07:16:46.858Z; checked against this device's clock"),
  legacyRedated.lines.find((line) => line.label === 'freshness')?.text)

// ── 1 · Bundled reference check: deterministic config-bound credential bundle
const reference = await makeExample('reference')
check('reference-check example detects as config-bound credential', detectArtifact(reference) === 'credential')
check('reference-check example is explicitly synthetic sandbox evidence',
  reference.artifact_kind === 'synthetic-sandbox-reference-check-credential'
  && reference.note.includes('not customer evidence'))
const referenceValid = await verifyArtifact(reference)
check('reference-check example verifies code 0 VALID', referenceValid.ok && referenceValid.code === 0 && referenceValid.verdict === 'VALID')
const referenceTampered = tamperArtifact('credential', reference)
const referenceVoid = await verifyArtifact(referenceTampered.value)
check('reference-check meaningful credential mutation → code 3 VOID', !referenceVoid.ok && referenceVoid.code === 3 && referenceVoid.verdict === 'VOID', referenceTampered.note)
const referenceReset = await verifyArtifact(reference)
check('reference-check pristine value remains VALID after tampering copy', referenceReset.ok && referenceReset.code === 0)

// ── 2 · Sigil: sign → detect → verify 0 → tamper 1 → corrupt 2 → wrong signer 3
const sigil = await makeExample('sigil')
check('demo sigil payload carries no licence/readiness level', !('license_level' in sigil.payload) && !('rsl_level' in sigil.payload))
check('sigil detect', detectArtifact(sigil) === 'sigil')
const sv = await verifyArtifact(sigil)
check('sigil verify code 0', sv.ok && sv.code === 0 && sv.verdict === 'VALID', sv.headline)

const sigilTampered = tamperArtifact('sigil', sigil)
const svt = await verifyArtifact(sigilTampered.value)
check('sigil tamper → code 1 VOID', !svt.ok && svt.code === 1 && svt.verdict === 'VOID', sigilTampered.note)

const sigilCorrupt = structuredClone(sigil)
sigilCorrupt.signature = (sigilCorrupt.signature[0] === 'A' ? 'B' : 'A') + sigilCorrupt.signature.slice(1)
const svc = await verifyArtifact(sigilCorrupt)
check('sigil signature corruption → code 2 VOID', !svc.ok && svc.code === 2)

const otherSigil = await makeExample('sigil') // a DIFFERENT fresh key signs the same payload
const pin = await keyThumbprint(sigil.pubkey_jwk)
const svw = await verifyArtifact(otherSigil, { expectedThumbprint: pin })
check('sigil wrong signer under pin → code 3 VOID', !svw.ok && svw.code === 3)

// ── 2 · Crucible credential: mint → detect → verify 0 → tamper 3 → live drift 4
const credential = await makeExample('credential')
check('credential detect', detectArtifact(credential) === 'credential')
const cv = await verifyArtifact(credential)
check('credential verify code 0 VALID', cv.ok && cv.code === 0 && cv.verdict === 'VALID', cv.headline)

const credTampered = tamperArtifact('credential', credential)
const cvt = await verifyArtifact(credTampered.value)
check('credential tamper → code 3 VOID', !cvt.ok && cvt.code === 3, credTampered.note)

const bundle = { credential, liveConfig: { ...credential.agent_config, model: 'demo-agent-v2' } }
check('credential+bindings detect', detectArtifact(bundle) === 'credential')
const cvd = await verifyArtifact(bundle)
check('credential live-config drift → code 4 VOID', !cvd.ok && cvd.code === 4, cvd.headline)

// ── 3 · ScoreReceipt: build → detect → recompute 0 → tamper 3
const receipt = await makeExample('receipt')
check('receipt detect', detectArtifact(receipt) === 'receipt')
const rv = await verifyArtifact(receipt)
check('receipt digest recomputes → code 0 VALID', rv.ok && rv.code === 0)

const receiptTampered = tamperArtifact('receipt', receipt)
const rvt = await verifyArtifact(receiptTampered.value)
check('receipt tamper → code 3 VOID', !rvt.ok && rvt.code === 3, receiptTampered.note)

// ── 4 · EpisodeTrace: chain → detect → verifyChain 0 → tamper 2
const trace = await makeExample('trace')
check('trace detect', detectArtifact(trace) === 'trace')
const tv = await verifyArtifact(trace)
check('trace chain verifies → code 0 VALID', tv.ok && tv.code === 0)

const traceTampered = tamperArtifact('trace', trace)
const tvt = await verifyArtifact(traceTampered.value)
check('trace tamper → code 2 VOID', !tvt.ok && tvt.code === 2, traceTampered.note)

// ── 5 · Merkle inclusion proof: batch → detect → included → tamper rejected
const inclusion = await makeExample('inclusion')
check('inclusion detect', detectArtifact(inclusion) === 'inclusion')
const iv = await verifyArtifact(inclusion)
check('inclusion proof folds to root → VALID', iv.ok && iv.verdict === 'VALID')

const inclusionTampered = tamperArtifact('inclusion', inclusion)
const ivt = await verifyArtifact(inclusionTampered.value)
check('inclusion tamper → VOID', !ivt.ok && ivt.verdict === 'VOID', inclusionTampered.note)

// ── 6 · Intake honesty: junk JSON + unknown shapes fail closed
check('parse rejects non-JSON', parseArtifact('not json {').ok === false)
check('parse rejects empty', parseArtifact('   ').ok === false)
const uv = await verifyArtifact({ hello: 'world' })
check('unknown shape → UNRECOGNIZED (not VALID)', !uv.ok && uv.verdict === 'UNRECOGNIZED')
check('array → unknown', detectArtifact([1, 2, 3]) === 'unknown')

// ── 7 · A Sigil WRAPPING a credential still detects as the outer Sigil
const wrapped = await (async () => {
  const { generateSigningKey, signSigil } = await import('@origin/verifier-core/sigil')
  return signSigil(credential, await generateSigningKey(), { issuer: 'origin-demo', kind: 'credential' })
})()
check('sigil-wrapped credential detects as sigil', detectArtifact(wrapped) === 'sigil')
const wv = await verifyArtifact(wrapped)
check('sigil-wrapped credential verifies code 0', wv.ok && wv.code === 0)

// ── 8 · Factory reference check: same spine, physical actor — outer sigil wins
const factory = await makeExample('factory')
check('factory example detects as sigil (wrapped credential)', detectArtifact(factory) === 'sigil')
const fv = await verifyArtifact(factory)
check('factory reference check verifies code 0 VALID', fv.ok && fv.code === 0, fv.headline)
check('factory payload is a config-bound credential',
  typeof factory.payload?.credential_digest === 'string'
  && factory.payload?.agent_config?.harness?.includes('verifier-gated'))
const factoryTampered = tamperArtifact(detectArtifact(factory), factory)
const fvt = await verifyArtifact(factoryTampered.value)
check('factory reference check tamper → code 1 VOID', !fvt.ok && fvt.code === 1, factoryTampered.note)

// ── 9 · The PUBLISHED flagship proof (public/proof/tr-a002.json), not a minted
//        example — the artifact /proof invites visitors to download and re-verify.
const { fileURLToPath } = await import('node:url')
const { dirname, resolve } = await import('node:path')
const proofPath = resolve(dirname(fileURLToPath(import.meta.url)), '../../public/proof/tr-a002.json')
const publishedProof = JSON.parse(readFileSync(proofPath, 'utf8'))
check('published TR-A002 detects as trace', detectArtifact(publishedProof) === 'trace')
const pv = await verifyArtifact(publishedProof)
check('published TR-A002 verifies code 0 VALID (no false tamper accusation)', pv.ok && pv.code === 0 && pv.verdict === 'VALID', pv.headline)
const proofTampered = tamperArtifact('trace', publishedProof)
const pvt = await verifyArtifact(proofTampered.value)
check('published TR-A002 tamper → VOID', !pvt.ok && pvt.verdict === 'VOID', proofTampered.note)
check('published TR-A002 $480 → $481 tamper → code 2 with one chain-break line',
  proofTampered.note === "changed event 1's refund amount $480 → $481 without re-sealing the chain"
  && pvt.code === 2 && pvt.lines.filter((line) => line.tone === 'bad').map((line) => line.text).join() === 'chain break — event 1 event_hash')
check('on a broken chain the inside-the-chain lines are notes, not passes',
  ['sandbox flags', 'live money'].every((label) => pvt.lines.some((line) => line.label === label && line.tone === 'info')))
const charge = tamperArtifact('trace', { events: [{ side_effect: { tool: 'payments.charge', amount_usd: 50 } }], final_digest: '0'.repeat(64) })
check('the trace tamper says "refund amount" only for a refund', charge.note === "changed event 1's amount_usd $50 → $51 without re-sealing the chain", charge.note)
const renamedProof = await verifyArtifact({ ...publishedProof, artifact: 'TR-A002 (copy)' })
check('the published chain under another artifact name still gets the TR-A002 lines and is VOID with no code',
  renamedProof.verdict === 'VOID' && renamedProof.code === null
  && renamedProof.headline === 'TR-A002 is void: artifact is not TR-A002, but final_digest is the published TR-A002 digest. The hash chain itself verifies.'
  && renamedProof.lines.some((line) => line.label === 'outside the chain'), renamedProof.headline)
check('published TR-A002 carries the command-line checks beyond the chain',
  ['artifact', 'event count', 'sandbox flag', 'sandbox flags', 'live money'].every((label) => pv.lines.some((line) => line.label === label && line.tone === 'ok'))
  && pv.lines.some((line) => line.label === 'outside the chain' && line.text.includes('type, emitted_by, label, scenario, agent, policy, risk_owner, proxy_tool, hash_spec')))
const unflagged = await verifyArtifact({ ...publishedProof, sandbox: false })
check('published TR-A002 with sandbox: false → VOID with no code; the chain still verifies, under a line with no code',
  unflagged.verdict === 'VOID' && unflagged.code === null && unflagged.headline === 'TR-A002 is void: the top-level field sandbox is not true. The hash chain itself verifies.'
  && unflagged.lines.some((line) => line.label === 'hash chain' && line.tone === 'ok') && !unflagged.lines.some((line) => line.label.startsWith('code ')))

// ── 10 · Format scope sits beside VALID and UNTRUSTED only
check('format scope beside VALID (receipt) and never beside VOID',
  rv.formatScope === 'unsigned format: VALID means the sealed digest matches; anyone can make one' && rvt.formatScope === null && uv.formatScope === null)

console.log(failures === 0 ? '\nALL PASS — /verify detect+verify logic reproduces under Node' : `\n${failures} FAILURE(S)`)
process.exitCode = failures === 0 ? 0 : 1
