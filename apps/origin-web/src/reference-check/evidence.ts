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
  const expectedUniqueIds = [...new Set(expectedIds)].sort()
  const observedIds = input.rows.map((row) => row.id)
  const observedCounts = new Map<string, number>()
  for (const id of observedIds) observedCounts.set(id, (observedCounts.get(id) ?? 0) + 1)

  const omissions = expectedUniqueIds
    .filter((id) => (observedCounts.get(id) ?? 0) === 0)
    .map((id) => ({ id_digest: digest(id), reason: 'no deterministic policy decision was recorded for this selected-battery task' }))
  const duplicates = [...observedCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id, count]) => ({ id_digest: digest(id), count }))
  const unexpectedObservedIds = [...new Set(observedIds.filter((id) => !expectedUniqueIds.includes(id)))].sort()
  const coveredExpectedIds = expectedUniqueIds.filter((id) => (observedCounts.get(id) ?? 0) > 0)
  const complete = observedIds.length === expectedUniqueIds.length && omissions.length === 0 && duplicates.length === 0 && unexpectedObservedIds.length === 0
  const recordsById = new Map<string, Array<Record<string, unknown>>>()
  for (const { id, yours, oracle, passed, catastrophic } of input.rows) {
    const records = recordsById.get(id) ?? []
    records.push({ id, selected_policy_decision: yours, oracle_decision: oracle, passed, catastrophic })
    recordsById.set(id, records)
  }
  const fixedBatteryOrder = [...new Set(expectedIds)]
  const decisionRows = [...fixedBatteryOrder, ...unexpectedObservedIds]
    .flatMap((id) => recordsById.get(id) ?? [])
    .sort((a, b) => {
      const aIndex = fixedBatteryOrder.indexOf(String(a.id))
      const bIndex = fixedBatteryOrder.indexOf(String(b.id))
      if (aIndex !== bIndex) return (aIndex < 0 ? Number.MAX_SAFE_INTEGER : aIndex) - (bIndex < 0 ? Number.MAX_SAFE_INTEGER : bIndex)
      return canonical(a).localeCompare(canonical(b))
    })

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
        policy_only: true,
        scenario: input.scenario,
        synthetic_battery: input.scenario === 'support' ? 'Origin synthetic support policy battery' : 'Origin synthetic IAM policy battery',
        named_agent_contacted: false,
        named_agent_executed: false,
        policy_evaluated_locally: true,
        selected_battery_task_ids: expectedIds,
        unexpected_observed_ids: unexpectedObservedIds,
      },
      input_digest: digest({
        scenario: input.scenario, declared_config: input.declaredConfig, selected_policy: input.selectedPolicy,
        ordered_battery_ids: expectedIds, environment_digest: input.environmentDigest,
        evaluator_version: input.evaluatorVersion, verifier_version: input.verifierVersion,
      }),
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
      expected_count: expectedUniqueIds.length,
      observed_count: observedIds.length,
      covered_ids_digest: digest(coveredExpectedIds),
      omissions,
      duplicates,
      freshness: { status: 'fresh', observed_at: input.issuedAt, max_age_ms: input.maxAgeMs },
    },
    source: { trace_id: null, audit_row_digest: null, oracle_verdict_digest: digest(decisionRows) },
  })
}
