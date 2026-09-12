import { buildActionRunEvidence, type ActionRunEvidence } from '@origin/evidence/action-run-evidence'
import { canonical, sha256 } from '@origin/evidence/env-evidence'

export interface SyntheticReferenceCheckRow {
  id: string
  yours: string
  oracle: string
  passed: boolean
  catastrophic: boolean
}

export interface BuildSyntheticReferenceCheckEvidenceInput {
  evidenceId: string
  issuedAt: string
  maxAgeMs: number
  scenario: 'support' | 'iam'
  declaredConfig: { model: string; tools: string[]; context: string; harness: string }
  selectedPolicy: object
  battery: ReadonlyArray<{ id: string }>
  rows: ReadonlyArray<SyntheticReferenceCheckRow>
  environmentDigest: string
  evaluatorVersion: string
  verifierVersion: string
}

const digest = (value: unknown) => sha256(canonical(value))

/**
 * Builds the browser Reference Check artifact from declared configuration and
 * deterministic policy decisions only. It intentionally does not represent a
 * call to, or execution by, the named agent.
 */
export function buildSyntheticReferenceCheckEvidence(input: BuildSyntheticReferenceCheckEvidenceInput): ActionRunEvidence {
  const expectedIds = input.battery.map((task) => task.id)
  const observedIds = input.rows.map((row) => row.id)
  const observedCounts = new Map<string, number>()
  for (const id of observedIds) observedCounts.set(id, (observedCounts.get(id) ?? 0) + 1)

  const omissions = expectedIds
    .filter((id) => (observedCounts.get(id) ?? 0) === 0)
    .map((id) => ({ id_digest: digest(id), reason: 'no deterministic policy decision was recorded for this selected-battery task' }))
  const duplicates = [...observedCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id_digest: digest(id), count }))
  const unexpected = observedIds
    .filter((id) => !expectedIds.includes(id))
    .map((id) => ({ id_digest: digest(id), reason: 'recorded decision is not in the selected battery' }))
  const complete = observedIds.length === expectedIds.length && omissions.length === 0 && duplicates.length === 0 && unexpected.length === 0
  const decisionRows = input.rows.map(({ id, yours, oracle, passed, catastrophic }) => ({ id, selected_policy_decision: yours, oracle_decision: oracle, passed, catastrophic }))

  return buildActionRunEvidence({
    evidence_id: input.evidenceId,
    issued_at: input.issuedAt,
    execution_mode: 'simulated',
    identity: { principal_id: 'user-declared-agent-configuration', tenant_id: null, workload_id: 'origin-reference-check', on_behalf_of: null },
    subject: {
      run_id: `${input.evidenceId}:policy-evaluation`,
      action_id: `${input.evidenceId}:selected-policy`,
      model_digest: digest({ model: input.declaredConfig.model }),
      tools_digest: digest(input.declaredConfig.tools),
      policy_digest: digest(input.selectedPolicy),
      environment_digest: input.environmentDigest,
      evaluator_version: input.evaluatorVersion,
      verifier_version: input.verifierVersion,
      adapter_version: null,
    },
    proposal: {
      action_type: 'synthetic_reference_check_policy_evaluation',
      proposed_effect: {
        kind: 'synthetic_reference_check_policy_evaluation',
        scenario: input.scenario,
        synthetic_battery: input.scenario === 'support' ? 'Origin synthetic support policy battery' : 'Origin synthetic IAM policy battery',
        named_agent_contacted: false,
        named_agent_executed: false,
        policy_evaluated_locally: true,
        selected_battery_task_ids: expectedIds,
      },
      input_digest: digest({ scenario: input.scenario, declared_config: input.declaredConfig, selected_policy: input.selectedPolicy, ordered_battery_ids: expectedIds }),
    },
    authorization: {
      verdict: 'deny',
      reason_codes: ['synthetic_policy_only_no_execution_authority'],
      approval_id: null,
      approved_by: null,
      nonce_digest: null,
      expires_at: null,
    },
    outcome_attestation: { status: 'not_attempted', attester: 'none', attested_at: null, statement_digest: null },
    provider_evidence: { provider: null, receipt_digest: null, readback_digest: null, readback_at: null },
    completeness: {
      coverage: complete ? 'complete' : 'partial',
      expected_count: expectedIds.length,
      observed_count: observedIds.length,
      covered_ids_digest: digest(observedIds),
      omissions: [...omissions, ...unexpected],
      duplicates,
      freshness: { status: 'fresh', observed_at: input.issuedAt, max_age_ms: input.maxAgeMs },
    },
    source: { trace_id: null, audit_row_digest: null, oracle_verdict_digest: digest(decisionRows) },
  })
}
