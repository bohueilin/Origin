// /verify self-test — exercises the page's ACTUAL logic in Node (no browser, no mocks).
// =============================================================================
//   node apps/origin-web/src/verify/selftest.mjs
//
// Imports the SAME ./detect.mjs + ./examples.mjs the React page uses (which in
// turn import the same '@origin/verifier-core/*' + '@origin/evidence/*'
// specifiers), and walks every detect→verify→tamper path. Prints PASS/FAIL per
// path; exits non-zero on any FAIL.
// =============================================================================

import { detectArtifact, verifyArtifact, tamperArtifact, parseArtifact } from './detect.mjs'
import { makeExample } from './examples.mjs'
import { keyThumbprint } from '@origin/verifier-core/sigil'

let failures = 0
function check(name, cond, detail = '') {
  const status = cond ? 'PASS' : 'FAIL'
  if (!cond) failures += 1
  console.log(`${status}  ${name}${detail ? ` — ${detail}` : ''}`)
}

// ── 1 · Sigil: sign → detect → verify 0 → tamper 1 → corrupt 2 → wrong signer 3
const sigil = await makeExample('sigil')
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

console.log(failures === 0 ? '\nALL PASS — /verify detect+verify logic reproduces under Node' : `\n${failures} FAILURE(S)`)
process.exitCode = failures === 0 ? 0 : 1
