// Policy evaluation — the readable result an Action/Run record (schema 1.1.0) states, and its replay.
// =============================================================================
// The record states the selected policy parameters, each decision beside the deterministic
// oracle's answer, and counts. Any verifier that ships the same battery re-runs the parameters
// and must get the same rows; a stated count is only as good as this replay. Pure: no I/O, no clock.
// =============================================================================

import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { missDirection } from './missDirection.mjs'
import { SUPPORT_GYM_VERSION, SUPPORT_VERSIONS, supportTasks, supportOracle, verifySupportDecision, supportEnvDigest, supportPolicyFromParameters, validateSupportPolicyParameters } from './supportGym.mjs'
import { IAM_GYM_VERSION, IAM_VERSIONS, iamTasks, iamOracle, verifyIamDecision, iamEnvDigest, iamPolicyFromParameters, validateIamPolicyParameters } from './iamGym.mjs'

const digest = (value) => sha256(canonical(value))
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const isCount = (value) => Number.isSafeInteger(value) && value >= 0
const SUMMARY_KEYS = ['matched', 'total', 'over_grants', 'misses']

// Every battery version this verifier has shipped. Entries are never removed, so older records
// still replay; a new battery version gets its own entry with that version's tasks and oracle.
const BATTERIES = [
  { id: 'support', version: SUPPORT_GYM_VERSION, oracle_version: SUPPORT_VERSIONS.verifier_version, tasks: supportTasks, oracle: supportOracle, score: verifySupportDecision, envDigest: supportEnvDigest, validate: validateSupportPolicyParameters, policyFrom: supportPolicyFromParameters },
  { id: 'iam', version: IAM_GYM_VERSION, oracle_version: IAM_VERSIONS.verifier_version, tasks: iamTasks, oracle: iamOracle, score: verifyIamDecision, envDigest: iamEnvDigest, validate: validateIamPolicyParameters, policyFrom: iamPolicyFromParameters },
]
export const SHIPPED_BATTERIES = Object.freeze(BATTERIES.map(({ id, version, oracle_version }) => Object.freeze({ id, version, oracle_version })))

// Display text for /verify: what a reproduced result does not cover, keyed by verifier version.
// It is not written into the record and not part of the replay, so a wording change voids nothing.
const NOT_TESTED_V1 = Object.freeze(['named agent or model behavior', 'provider or real-system effects', 'requests outside this battery', 'whether this answer key encodes your policy'])
export const NOT_TESTED = Object.freeze({ 'support-oracle-v1': NOT_TESTED_V1, 'iam-oracle-v1': NOT_TESTED_V1 })

// Stated rows (in battery order) with `passed` and `catastrophic` recomputed by the gym.
function scoreRows(battery, rows) {
  return rows.map((row, i) => {
    const { passed, catastrophic } = battery.score(battery.tasks[i], row.decision)
    return { ...row, passed, catastrophic }
  })
}

const shipped = ({ id, version }) => BATTERIES.find((b) => b.id === id && b.version === version)

/**
 * The verdict rows a record digests into source.oracle_verdict_digest, with `passed` and
 * `catastrophic` scored by the shipped battery the block names. Decisions must be in battery
 * order, as buildPolicyEvaluation writes them. Throws on a battery this verifier does not ship.
 */
export function verdictRows(evaluation) {
  const battery = shipped(evaluation.battery)
  if (!battery) throw new TypeError(`verdictRows: battery ${evaluation.battery.id} ${evaluation.battery.version} is not shipped`)
  return scoreRows(battery, evaluation.decisions).map((row) => ({ id: row.id, selected_policy_decision: row.decision, oracle_decision: row.expected, passed: row.passed, catastrophic: row.catastrophic }))
}

// Over-grants (an allow on a security-critical request the oracle refuses) are counted apart
// from misses, so matched + over_grants + misses === total.
function countRows(scored) {
  const matched = scored.filter((row) => row.passed).length
  const over_grants = scored.filter((row) => row.catastrophic).length
  return { matched, total: scored.length, over_grants, misses: scored.length - matched - over_grants }
}

export function buildPolicyEvaluation({ scenario, parameters }) {
  const battery = BATTERIES.findLast((b) => b.id === scenario)
  if (!battery) throw new TypeError(`buildPolicyEvaluation: unknown scenario "${scenario}"`)
  const check = battery.validate(parameters)
  if (!check.ok) throw new TypeError(`buildPolicyEvaluation: invalid ${scenario} policy parameters: ${check.failures.join('; ')}`)
  const policyFor = battery.policyFrom(parameters)
  const decisions = battery.tasks.map((task) => ({ id: task.id, decision: policyFor(task), expected: battery.oracle(task).decision }))
  return {
    battery: { id: battery.id, version: battery.version },
    oracle_version: battery.oracle_version,
    policy_parameters: { ...parameters },
    decisions,
    summary: countRows(scoreRows(battery, decisions)),
  }
}

function wellFormed(e) {
  return isRecord(e) && isRecord(e.battery) && typeof e.battery.id === 'string' && typeof e.battery.version === 'string' &&
    typeof e.oracle_version === 'string' && isRecord(e.policy_parameters) &&
    Array.isArray(e.decisions) && e.decisions.every((row) => isRecord(row) && ['id', 'decision', 'expected'].every((key) => typeof row[key] === 'string')) &&
    isRecord(e.summary) && SUMMARY_KEYS.every((key) => isCount(e.summary[key]))
}

/**
 * Replays a record's `evaluation` block. Order: (1) checks that need no battery, so a record that
 * disagrees with itself is a mismatch even when it names an unknown battery; (2) whether this
 * verifier ships the named battery and oracle; (3) the re-run against the shipped battery.
 * `diffs` name each failure as data; the caller words them. `summary` is set only on a match.
 */
export function replayPolicyEvaluation(evidence) {
  const evaluation = evidence?.evaluation
  if (evaluation === undefined) return { status: 'absent', diffs: [], summary: null }
  const field = (name) => ({ kind: 'field', field: name })
  const mismatch = (diffs) => ({ status: 'mismatch', diffs, summary: null })
  if (!wellFormed(evaluation)) return mismatch([field('evaluation')])
  const { battery: named, oracle_version, policy_parameters, decisions, summary } = evaluation
  const ids = decisions.map((row) => row.id)

  // (1) The record against itself.
  const diffs = []
  if (digest(policy_parameters) !== evidence.subject?.policy_digest) diffs.push(field('subject.policy_digest'))
  if (oracle_version !== evidence.subject?.verifier_version) diffs.push(field('subject.verifier_version'))
  if (JSON.stringify(ids) !== JSON.stringify(evidence.proposal?.proposed_effect?.selected_battery_task_ids)) diffs.push(field('proposal.proposed_effect.selected_battery_task_ids'))
  if (evidence.proposal?.proposed_effect?.scenario !== named.id) diffs.push(field('proposal.proposed_effect.scenario'))
  // The covered ids as the record builder digests them: unique and sorted.
  if (digest([...new Set(ids)].sort()) !== evidence.completeness?.covered_ids_digest) diffs.push(field('completeness.covered_ids_digest'))
  if (summary.total !== evidence.completeness?.expected_count) diffs.push(field('completeness.expected_count'))
  const statedMatches = decisions.filter((row) => row.decision === row.expected).length
  if (summary.total !== decisions.length || summary.matched !== statedMatches || summary.matched + summary.over_grants + summary.misses !== summary.total) diffs.push(field('summary'))
  if (diffs.length) return mismatch(diffs)

  // (2) Availability: a battery or oracle version this verifier does not ship cannot be replayed.
  // An oracle version shipped for a different battery is shipped, so the record contradicts itself.
  const unavailable = (diff) => ({ status: 'unavailable', diffs: [{ kind: 'unavailable', ...diff }], summary: null })
  const battery = shipped(named)
  if (!battery) {
    return unavailable({ field: 'battery', named: { name: named.id, version: named.version }, shipped: BATTERIES.map((b) => ({ name: b.id, version: b.version })) })
  }
  if (battery.oracle_version !== oracle_version) {
    if (BATTERIES.some((b) => b.oracle_version === oracle_version)) return mismatch([field('evaluation.oracle_version')])
    return unavailable({ field: 'oracle_version', named: { name: 'oracle', version: oracle_version }, shipped: [{ name: 'oracle', version: battery.oracle_version }] })
  }

  // (3) The stated parameters re-run against the shipped battery and oracle.
  if (battery.envDigest() !== evidence.subject.environment_digest) diffs.push(field('subject.environment_digest'))
  if (JSON.stringify(ids) !== JSON.stringify(battery.tasks.map((task) => task.id))) return mismatch([...diffs, field('decisions')])
  if (!battery.validate(policy_parameters).ok) return mismatch([...diffs, field('policy_parameters')])
  const policyFor = battery.policyFrom(policy_parameters)
  battery.tasks.forEach((task, i) => {
    const row = decisions[i]
    const expected = battery.oracle(task).decision
    const decision = policyFor(task)
    if (row.expected !== expected) diffs.push({ kind: 'row', id: task.id, field: 'expected', stated: row.expected, replayed: expected })
    if (row.decision !== decision) diffs.push({ kind: 'row', id: task.id, field: 'decision', stated: row.decision, replayed: decision })
  })
  if (digest(verdictRows(evaluation)) !== evidence.source?.oracle_verdict_digest) diffs.push(field('source.oracle_verdict_digest'))
  const scored = scoreRows(battery, decisions)
  const counts = countRows(scored)
  if (SUMMARY_KEYS.some((key) => counts[key] !== summary[key])) diffs.push(field('summary'))
  if (diffs.length) return mismatch(diffs)

  return {
    status: 'match',
    diffs: [],
    summary: {
      ...counts,
      over_grant_ids: scored.filter((row) => row.catastrophic).map((row) => row.id),
      miss_rows: scored.filter((row) => !row.passed && !row.catastrophic).map((row) => ({ id: row.id, direction: missDirection(row.decision, row.expected) })),
    },
  }
}
