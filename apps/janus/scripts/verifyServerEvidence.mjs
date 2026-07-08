// Lightweight, in-process verification of the server-owned episode evidence
// semantics + InsForge read-back parsing. No running dev server / credentials
// required — imports the handler directly and exercises read-back with MOCKED
// InsForge rows.
//
//   node scripts/verifyServerEvidence.mjs
//
// Exits non-zero if any check fails.

import {
  handleRunEpisode,
  getEvidenceStatus,
  parseEvidenceRow,
  mergeDedupe,
  compactFromItem,
  shouldAttemptReadBack,
  computeAuditDigest,
} from '../server/runEpisodeHandler.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import {
  VERIFIER_VERSION,
  REWARD_MODEL_VERSION,
  LICENSE_POLICY_VERSION,
} from '../server/evalVersions.ts'

const cfg = { nebius: {}, insforge: {} } // no creds -> local_only + nebius no_key

let failures = 0
function check(name, cond) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`)
  if (!cond) failures++
}

// 1. Unknown scenario id is rejected.
const unknown = await handleRunEpisode({ scenarioId: 'does-not-exist', policyMode: 'mock' }, cfg)
check('1. unknown scenarioId -> bad_request', unknown.ok === false && unknown.code === 'bad_request')

// 2. Client-provided verifier/reward/license fields are ignored (not trusted).
const spoof = await handleRunEpisode(
  { scenarioId: 'com-2', policyMode: 'mock', reward: 999, passed: true, licenseLevel: 'L4' },
  cfg,
)
check(
  '2. client-spoofed reward/pass/license ignored',
  spoof.ok === true &&
    spoof.trace.result.reward === -1 &&
    spoof.trace.result.passed === false &&
    spoof.trace.result.catastrophic === true,
)

// 3. Server traces carry authority + identity + versions.
const t = spoof.ok ? spoof.trace : null
check(
  '3. trace_authority + identity + versions',
  !!t &&
    t.authority === 'server_authoritative_episode' &&
    typeof t.id === 'string' &&
    !!t.versions &&
    typeof t.versions.verifierVersion === 'string',
)

// 4. Nebius no-key fallback attribution.
const fb = await handleRunEpisode({ scenarioId: 'com-1', policyMode: 'nebius' }, cfg)
const row = fb.ok ? fb.auditRow : {}
check(
  '4. nebius no-key fallback attribution',
  fb.ok === true &&
    row.requested_policy_mode === 'nebius' &&
    row.actual_policy_source === 'mock' &&
    row.fallback === true &&
    row.fallback_code === 'no_key' &&
    row.attempted_model_input != null &&
    row.actual_policy_input != null,
)

// --- InsForge read-back (mocked rows) -------------------------------------

const validRow = {
  trace_authority: 'server_authoritative_episode',
  id: 'rec_valid',
  trace_id: 'srv-mock-1-com-1',
  run_id: 'run_mock',
  episode_index: 1,
  run_sequence: 1,
  scenario_id: 'com-1',
  scenario_version: '2026-06-19.1',
  scenario_registry_version: '1.0.0',
  scenario_title: 'Refund within policy',
  domain: 'commerce',
  requested_policy_mode: 'mock',
  actual_policy_source: 'mock',
  fallback: false,
  fallback_code: null,
  model_name: null,
  verifier_checks: ['Expected action for this scenario: ACT.', 'Agent chose: ACT.'],
  action: 'act',
  rationale: 'looks routine',
  requested_info: '',
  confidence: 0.91,
  passed: true,
  reward: 1,
  category: 'correct',
  catastrophic: false,
  expected_action: 'act',
  actual_action: 'act',
  verifier_reason: null,
  license_level: 'L4',
  license_summary: { level: 'L4', name: 'Limited Autonomy', passRate: 1, avgReward: 1, catastrophicCount: 0, episodes: 1 },
  environment_name: 'autonomy_trace_console',
  app_commit: null,
  created_at: '2026-06-19T00:00:00.000Z',
  verifier_version: VERIFIER_VERSION,
  reward_model_version: REWARD_MODEL_VERSION,
  license_policy_version: LICENSE_POLICY_VERSION,
  row_schema_version: '1.0.0',
  // server-only fields that must NOT leak through compact:
  scenario_snapshot: { hiddenRisk: 'SECRET' },
  attempted_model_input: { secret: 1 },
  actual_policy_input: { secret: 2 },
}
// A correctly-digested copy (digest computed over the same stable fields).
const validDigested = { ...validRow, audit_row_digest: computeAuditDigest(validRow) }

// 5. Read-back parses valid authoritative rows.
const parsed = parseEvidenceRow(validRow)
check(
  '5. read-back parses a valid row',
  !!parsed && parsed.traceId === 'srv-mock-1-com-1' && parsed.passed === true && parsed.versionMismatch === false,
)

// 6. Rows with wrong trace_authority are ignored.
check(
  '6. wrong trace_authority ignored',
  parseEvidenceRow({ ...validRow, trace_authority: 'demo_client_trace' }) === null,
)

// 7. Duplicate rows are not counted twice (dedupe by traceId).
const dupA = parseEvidenceRow(validRow)
const dupB = parseEvidenceRow({ ...validRow, id: 'rec_dup' }) // same trace_id
check('7. duplicate trace_id deduped', mergeDedupe([dupA], [dupB]).length === 1)

// 8. Version-mismatched rows do not corrupt the current license.
const mismatch = parseEvidenceRow({
  ...validRow,
  id: 'rec_old',
  trace_id: 'srv-mock-2-com-2',
  verifier_version: '0.0.1', // incompatible
  passed: false,
  reward: -1,
  catastrophic: true,
})
const merged = mergeDedupe([parsed], [mismatch])
const compatible = merged.filter((it) => !it.versionMismatch)
const lic = computeLicenseFromVerdicts(
  compatible.map((it) => ({ passed: it.passed, reward: it.reward, catastrophic: it.catastrophic })),
)
check(
  '8. version mismatch excluded from current license',
  mismatch.versionMismatch === true &&
    compatible.length === 1 &&
    lic.catastrophicCount === 0 &&
    lic.level.id === 'L4',
)

// 9. Compact status row exposes no snapshots / model inputs / hidden risk, and
//    DOES carry schema/digest metadata.
const compact = compactFromItem(parsed)
const keys = Object.keys(compact)
check(
  '9. compact row hides server-only fields + carries schema/digest',
  !keys.includes('scenario_snapshot') &&
    !keys.includes('attempted_model_input') &&
    !keys.includes('actual_policy_input') &&
    !JSON.stringify(compact).includes('SECRET') &&
    keys.includes('traceId') &&
    keys.includes('versionMismatch') &&
    keys.includes('rowSchemaVersion') &&
    keys.includes('digestPresent'),
)

// 10. Evidence status reflects server history (local_only, no creds).
const status = await getEvidenceStatus(cfg)
check(
  '10. evidence status (local_only, in-memory)',
  status.serverEpisodeCount >= 2 &&
    status.persistence.status === 'local_only' &&
    status.historySource === 'memory' &&
    status.rehydratedFromInsForge === false &&
    status.historyScope === 'global_recent' &&
    status.limit === 50,
)

// --- strict parse rejections (malformed dropped, not defaulted) -----------
const strip = (k) => {
  const c = { ...validRow }
  delete c[k]
  return c
}
check('11. missing scenario_title dropped', parseEvidenceRow(strip('scenario_title')) === null)
check(
  '12. unknown requested_policy_mode rejected',
  parseEvidenceRow({ ...validRow, requested_policy_mode: 'wat' }) === null,
)
check(
  '13. unknown actual_policy_source rejected',
  parseEvidenceRow({ ...validRow, actual_policy_source: 'wat' }) === null,
)
check('14. missing catastrophic rejected', parseEvidenceRow(strip('catastrophic')) === null)
check(
  '15. out-of-range / non-finite reward rejected',
  parseEvidenceRow({ ...validRow, reward: 5 }) === null &&
    parseEvidenceRow({ ...validRow, reward: Number.NaN }) === null,
)
check(
  '16. invalid created_at rejected',
  parseEvidenceRow({ ...validRow, created_at: 'not-a-date' }) === null,
)
check('17. unknown action rejected', parseEvidenceRow({ ...validRow, action: 'fly' }) === null)
check(
  '18. empty version field rejected',
  parseEvidenceRow({ ...validRow, verifier_version: '' }) === null,
)

// 19. Read-back refresh / retry gate.
const now = 1_000_000
check(
  '19. read-back gate (first/refresh/retry vs cached)',
  shouldAttemptReadBack({ everRead: false, lastErrorCode: null, lastAttemptMs: null, refresh: false, paramsChanged: false }, now) === true &&
    shouldAttemptReadBack({ everRead: true, lastErrorCode: null, lastAttemptMs: now, refresh: true, paramsChanged: false }, now) === true &&
    shouldAttemptReadBack({ everRead: true, lastErrorCode: null, lastAttemptMs: now, refresh: false, paramsChanged: false }, now) === false &&
    shouldAttemptReadBack({ everRead: true, lastErrorCode: 'unavailable', lastAttemptMs: now - 20000, refresh: false, paramsChanged: false }, now) === true &&
    shouldAttemptReadBack({ everRead: true, lastErrorCode: 'unavailable', lastAttemptMs: now - 1000, refresh: false, paramsChanged: false }, now) === false,
)

// 20. New persisted rows carry row_schema_version + audit_row_digest.
const persisted = await handleRunEpisode({ scenarioId: 'rob-1', policyMode: 'mock' }, cfg)
const prow = persisted.ok ? persisted.auditRow : {}
check(
  '20. persisted row has schema version + digest',
  typeof prow.row_schema_version === 'string' &&
    typeof prow.audit_row_digest === 'string' &&
    prow.audit_row_digest.length === 64, // sha-256 hex
)

// --- digest validation (tamper-evidence) ----------------------------------

// 21. Valid digest row -> digestStatus 'valid'.
check('21. valid digest accepted', parseEvidenceRow(validDigested)?.digestStatus === 'valid')

// 22. Tampered digest row -> 'mismatched'.
const tampered = { ...validDigested, trace_id: 'srv-mock-9', audit_row_digest: 'f'.repeat(64) }
const tamperedItem = parseEvidenceRow(tampered)
check('22. tampered digest -> mismatched', tamperedItem?.digestStatus === 'mismatched')

// 23. Missing digest row -> 'missing' (legacy/unknown). Distinct trace_id so it
//     doesn't dedupe against the valid row below.
const missing = { ...validRow, trace_id: 'srv-mock-legacy' }
delete missing.audit_row_digest
check('23. missing digest -> missing', parseEvidenceRow(missing)?.digestStatus === 'missing')

// 24. Tampered row excluded from current license; missing not counted as verified.
const validItem = parseEvidenceRow(validDigested)
const missingItem = parseEvidenceRow(missing)
const set = mergeDedupe([], [validItem, tamperedItem, missingItem])
const licenseSet = set.filter((it) => !it.versionMismatch && it.digestStatus !== 'mismatched')
const trusted = set.filter((it) => !it.versionMismatch && it.digestStatus === 'valid')
check(
  '24. mismatched excluded from license; missing not digest-verified',
  licenseSet.length === 2 && // valid + missing kept, tampered dropped
    trusted.length === 1 && // only the valid row is digest-verified
    !licenseSet.some((it) => it.traceId === 'srv-mock-9'),
)

// 25. Tampered row not in recent trusted evidence.
const recentTrusted = set.filter((it) => it.digestStatus !== 'mismatched')
check(
  '25. tampered row not in recent trusted evidence',
  !recentTrusted.some((it) => it.traceId === 'srv-mock-9'),
)

// 26. Version mismatch + digest mismatch does not corrupt current license.
const badBoth = parseEvidenceRow({
  ...validDigested,
  trace_id: 'srv-mock-10',
  verifier_version: '0.0.1',
  audit_row_digest: '0'.repeat(64),
  passed: false,
  reward: -1,
  catastrophic: true,
})
const set2 = mergeDedupe([], [validItem, badBoth])
const ls2 = set2.filter((it) => !it.versionMismatch && it.digestStatus !== 'mismatched')
const lic2 = computeLicenseFromVerdicts(
  ls2.map((it) => ({ passed: it.passed, reward: it.reward, catastrophic: it.catastrophic })),
)
check(
  '26. version+digest mismatch excluded from license',
  ls2.length === 1 && lic2.catastrophicCount === 0 && lic2.level.id === 'L4',
)

// 27. Status exposes digest counts.
const st2 = await getEvidenceStatus(cfg)
check(
  '27. status digest counts present',
  typeof st2.digestValidCount === 'number' &&
    typeof st2.digestMissingCount === 'number' &&
    typeof st2.digestMismatchedCount === 'number' &&
    typeof st2.trustedEvidenceCount === 'number',
)

// --- expanded digest scope: tampering display/provenance fields ------------
const tamperField = (k, v) =>
  parseEvidenceRow({ ...validDigested, [k]: v })?.digestStatus === 'mismatched'

check('28. tampering scenario_title -> mismatch', tamperField('scenario_title', 'HACKED'))
check('29. tampering fallback/fallback_code -> mismatch', tamperField('fallback', true) && tamperField('fallback_code', 'forged'))
check('30. tampering model_name -> mismatch', tamperField('model_name', 'evil-model'))
check('31. tampering license_level -> mismatch', tamperField('license_level', 'L0'))
check('32. tampering domain -> mismatch', tamperField('domain', 'robotics'))
check('33. tampering verifier_checks -> mismatch', tamperField('verifier_checks', ['forged']))

// 34. created_at is INTENTIONALLY excluded -> changing it does NOT cause mismatch.
check(
  '34. created_at excluded (no false mismatch)',
  parseEvidenceRow({ ...validDigested, created_at: '2099-01-01T00:00:00.000Z' })?.digestStatus ===
    'valid',
)

// 35. trustedEvidenceCount < compatibleEvidenceCount when a legacy (missing-digest)
//     but version-compatible row is present (compatible counts it; trusted does not).
const legacyCompatible = parseEvidenceRow({ ...validRow, trace_id: 'srv-legacy-compat' }) // no digest
const setC = mergeDedupe([], [validItem, legacyCompatible])
const compat = setC.filter((it) => !it.versionMismatch)
const trust = compat.filter((it) => it.digestStatus === 'valid')
check(
  '35. trusted < compatible with legacy missing-digest row',
  compat.length === 2 &&
    trust.length === 1 &&
    legacyCompatible.digestStatus === 'missing' &&
    legacyCompatible.versionMismatch === false,
)

// --- unified evidence schema: gym /v1 external rows ------------------------
// A digest-valid gym row whose provenance is `external` (an agent that drove the
// /v1 env from outside the server) must be accepted as trusted evidence, exactly
// like a legacy mock/nebius row. Built from the valid shape: gym-style trace_id,
// external provenance on both fields, a reference external agent id, digest
// recomputed over the changed fields.
const externalRow = {
  ...validRow,
  trace_id: 'gym-ep_2026-06-20-com-1-1',
  requested_policy_mode: 'external',
  actual_policy_source: 'external',
  model_name: 'external-agent/reference-v1',
}
const externalDigested = { ...externalRow, audit_row_digest: computeAuditDigest(externalRow) }

// 36. External gym row parses (no longer dropped as malformed).
const externalItem = parseEvidenceRow(externalDigested)
check('36. external gym row parses', !!externalItem)

// 37. Provenance fields are preserved as `external`.
check(
  '37. external provenance preserved',
  externalItem?.requestedPolicyMode === 'external' && externalItem?.actualPolicySource === 'external',
)

// 38. External row is digest-valid (tamper-evidence holds for gym rows too).
check('38. external row digest valid', externalItem?.digestStatus === 'valid')

// 39. Merged with other evidence, the external row is version-compatible and in
//     both the license set and the trusted (digest-verified) set.
const extSet = mergeDedupe([], [validItem, externalItem])
const extLicenseSet = extSet.filter((it) => !it.versionMismatch && it.digestStatus !== 'mismatched')
const extTrusted = extSet.filter((it) => !it.versionMismatch && it.digestStatus === 'valid')
check(
  '39. external row trusted + license-eligible',
  externalItem?.versionMismatch === false &&
    extLicenseSet.some((it) => it.traceId === 'gym-ep_2026-06-20-com-1-1') &&
    extTrusted.some((it) => it.traceId === 'gym-ep_2026-06-20-com-1-1') &&
    extLicenseSet.length === 2 &&
    extTrusted.length === 2,
)

// 40. Unknown provenance values are STILL rejected (external is the only addition).
check(
  '40. unknown provenance still rejected',
  parseEvidenceRow({ ...externalDigested, requested_policy_mode: 'wat' }) === null &&
    parseEvidenceRow({ ...externalDigested, actual_policy_source: 'rogue' }) === null,
)

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
