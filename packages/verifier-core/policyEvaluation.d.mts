// Type surface for policyEvaluation.mjs — the result an Action/Run 1.1.0 record states, and its replay.
// Hand-written declarations; keep in lockstep with policyEvaluation.mjs. Type aliases (not
// interfaces), so the block fits the index-signature types of the record package.
import type { SupportPolicyParameters } from './supportGym.mjs'
import type { IamPolicyParameters } from './iamGym.mjs'
import type { PolicyDecision, MissDirection } from './missDirection.mjs'

export type PolicyEvaluationScenario = 'support' | 'iam'
export type PolicyEvaluationRow = { id: string; decision: PolicyDecision; expected: PolicyDecision }
export type PolicyEvaluationSummary = { matched: number; total: number; over_grants: number; misses: number }

/** The record's `evaluation` block: exactly these five keys. */
export type PolicyEvaluation = {
  battery: { id: PolicyEvaluationScenario; version: string }
  oracle_version: string
  policy_parameters: SupportPolicyParameters | IamPolicyParameters
  decisions: PolicyEvaluationRow[]
  summary: PolicyEvaluationSummary
}

/** A record field whose value does not agree with the rest of the record or with the replay. */
export type PolicyEvaluationField =
  | 'evaluation'
  | 'subject.policy_digest'
  | 'subject.verifier_version'
  | 'proposal.proposed_effect.selected_battery_task_ids'
  | 'proposal.proposed_effect.scenario'
  | 'completeness.covered_ids_digest'
  | 'completeness.expected_count'
  | 'evaluation.oracle_version'
  | 'summary'
  | 'subject.environment_digest'
  | 'decisions'
  | 'policy_parameters'
  | 'source.oracle_verdict_digest'

/** One row of the digest in `source.oracle_verdict_digest`. */
export type PolicyEvaluationVerdictRow = { id: string; selected_policy_decision: PolicyDecision; oracle_decision: PolicyDecision; passed: boolean; catastrophic: boolean }

export type PolicyEvaluationName = { name: string; version: string }
export type PolicyEvaluationDiff =
  | { kind: 'field'; field: PolicyEvaluationField }
  | { kind: 'row'; id: string; field: 'decision' | 'expected'; stated: string; replayed: PolicyDecision }
  | { kind: 'unavailable'; field: 'battery' | 'oracle_version'; named: PolicyEvaluationName; shipped: PolicyEvaluationName[] }

export type PolicyEvaluationReplay =
  | { status: 'absent'; diffs: []; summary: null }
  | { status: 'mismatch' | 'unavailable'; diffs: PolicyEvaluationDiff[]; summary: null }
  | {
      status: 'match'
      diffs: []
      summary: PolicyEvaluationSummary & { over_grant_ids: string[]; miss_rows: { id: string; direction: MissDirection }[] }
    }

/** Every battery version this verifier ships; entries are never removed. */
export const SHIPPED_BATTERIES: ReadonlyArray<{ readonly id: string; readonly version: string; readonly oracle_version: string }>
/** Display text, keyed by verifier version: what a reproduced result does not cover. Not part of the record. */
export const NOT_TESTED: Readonly<Record<string, readonly string[]>>

/** Throws a TypeError on an unknown scenario or parameters outside the validator's exact key set. */
export function buildPolicyEvaluation(args: {
  scenario: PolicyEvaluationScenario
  parameters: SupportPolicyParameters | IamPolicyParameters
}): PolicyEvaluation
/** The rows a record digests into `source.oracle_verdict_digest`. Throws on a battery this verifier does not ship. */
export function verdictRows(evaluation: PolicyEvaluation): PolicyEvaluationVerdictRow[]
export function replayPolicyEvaluation(evidence: unknown): PolicyEvaluationReplay
