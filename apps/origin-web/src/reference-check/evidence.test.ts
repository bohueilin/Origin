import { describe, expect, it } from 'vitest'
import { buildSyntheticReferenceCheckEvidence, type BuildSyntheticReferenceCheckEvidenceInput } from './evidence'
import { validateActionRunEvidence } from '@origin/evidence/action-run-evidence'
import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { signActionRunEvidence, type SignedActionRunEvidence } from '@origin/verifier-core/action-run-evidence'
import { iamEnvDigest, iamOracle, iamTasks, IAM_VERSIONS, verifyIamDecision } from '@origin/verifier-core/iamGym'
import { replayPolicyEvaluation } from '@origin/verifier-core/policyEvaluation'
import { generateSigningKey } from '@origin/verifier-core/sigil'
import { supportEnvDigest, supportOracle, supportTasks, SUPPORT_VERSIONS, verifySupportDecision } from '@origin/verifier-core/supportGym'
import { PRESETS, SUPPORT_PRESETS, policyForSpec, supportPolicyForSpec } from '../certify/policySpec'
import { encodeArtifact } from '../shared/shareLink'
import { makeExample } from '../verify/examples.mjs'

const base = {
  evidenceId: 'rc-evidence-0001',
  issuedAt: '2026-09-12T12:00:00.000Z',
  maxAgeMs: 60_000,
  scenario: 'support' as const,
  declaredConfig: { model: 'declared-agent-v1', tools: ['crm.write', 'email.send'], context: 'support-policy@1', harness: 'browser@1' },
  selectedPolicy: { denyPii: true, denyForbidden: true, denyTainted: true, refundCap: 50, requireApprovalHigh: true },
  battery: Array.from({ length: 12 }, (_, index) => ({ id: `support-${index + 1}` })),
  rows: Array.from({ length: 12 }, (_, index) => ({
    id: `support-${index + 1}`, yours: 'allow', oracle: 'allow', passed: true, catastrophic: false,
  })),
  environmentDigest: 'a'.repeat(64),
  evaluatorVersion: 'support-reward@1',
  verifierVersion: 'support-verifier@1',
}

describe('buildSyntheticReferenceCheckEvidence', () => {
  it('emits a local policy-evaluation envelope, not a claimed agent run', () => {
    const evidence = buildSyntheticReferenceCheckEvidence(base)

    expect(evidence.execution_mode).toBe('simulated')
    expect(evidence.identity).toEqual({ principal_id: 'user-declared-agent-configuration', tenant_id: null, workload_id: 'origin-reference-check', on_behalf_of: null })
    expect(evidence.subject.run_id).not.toBe(evidence.subject.action_id)
    expect(evidence.outcome_attestation).toEqual({ status: 'not_attempted', attester: 'none', attested_at: null, statement_digest: null })
    expect(evidence.provider_evidence).toEqual({ provider: null, receipt_digest: null, readback_digest: null, readback_at: null })
    expect(evidence.authorization).toMatchObject({ verdict: 'deny', reason_codes: ['synthetic_policy_only_no_execution_authority'] })
    expect(evidence.completeness).toMatchObject({ coverage: 'complete', expected_count: 12, observed_count: 12, omissions: [], duplicates: [] })
    expect(evidence.source.oracle_verdict_digest).toMatch(/^[a-f0-9]{64}$/)
    expect(evidence.proposal.proposed_effect).toMatchObject({
      kind: 'synthetic_reference_check_policy_evaluation', policy_only: true,
      named_agent_contacted: false, named_agent_executed: false,
    })
  })

  it('makes incomplete or duplicated decision records explicit rather than calling coverage complete', () => {
    const evidence = buildSyntheticReferenceCheckEvidence({
      ...base,
      rows: [base.rows[0], base.rows[0]],
    })

    expect(evidence.completeness.coverage).toBe('partial')
    expect(evidence.completeness.observed_count).toBe(2)
    expect(evidence.completeness.omissions).toHaveLength(11)
    expect(evidence.completeness.duplicates).toHaveLength(1)
  })

  it('canonicalizes covered selected IDs and records unexpected observed IDs separately', () => {
    const reordered = buildSyntheticReferenceCheckEvidence({ ...base, rows: [...base.rows].reverse() })
    const expected = buildSyntheticReferenceCheckEvidence(base)
    const withUnexpected = buildSyntheticReferenceCheckEvidence({
      ...base,
      rows: [...base.rows, { id: 'unexpected-task', yours: 'allow', oracle: 'deny', passed: false, catastrophic: false }],
    })

    expect(reordered.completeness.covered_ids_digest).toBe(expected.completeness.covered_ids_digest)
    expect(reordered.proposal.input_digest).toBe(expected.proposal.input_digest)
    expect(reordered.source.oracle_verdict_digest).toBe(expected.source.oracle_verdict_digest)
    expect(buildSyntheticReferenceCheckEvidence({ ...base, verifierVersion: 'support-verifier@2' }).proposal.input_digest)
      .not.toBe(expected.proposal.input_digest)
    expect(withUnexpected.completeness.coverage).toBe('partial')
    expect(withUnexpected.completeness.omissions).toEqual([])
    expect(withUnexpected.proposal.proposed_effect).toMatchObject({ unexpected_observed_ids: ['unexpected-task'] })
  })
})

const digest = (value: unknown) => sha256(canonical(value))
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_CONFIG = {
  support: { model: 'support-agent-v1', tools: ['refunds', 'crm.write', 'email.send'], context: 'support-policy@1', harness: 'my-harness@1' },
  iam: { model: 'iam-agent-v1', tools: ['iam.decide', 'data.read'], context: 'system-prompt@1', harness: 'my-harness@1' },
}

// The input ReferenceCheckPage.run() builds for a scenario and preset, with its 30-day window.
function pageInput(scenario: 'support' | 'iam', preset: string, overrides: Partial<BuildSyntheticReferenceCheckEvidenceInput> = {}): BuildSyntheticReferenceCheckEvidenceInput {
  const common = { evidenceId: '00000000-0000-4000-8000-000000000000', issuedAt: '2026-11-12T12:00:00.000Z', maxAgeMs: THIRTY_DAYS_MS, scenario, declaredConfig: DEFAULT_CONFIG[scenario] }
  if (scenario === 'support') {
    const selectedPolicy = SUPPORT_PRESETS[preset].spec
    const policyFor = supportPolicyForSpec(selectedPolicy)
    const rows = supportTasks.map((task) => {
      const yours = policyFor(task)
      const { passed, catastrophic } = verifySupportDecision(task, yours)
      return { id: task.id, yours, oracle: supportOracle(task).decision, passed, catastrophic }
    })
    return {
      ...common, selectedPolicy, battery: supportTasks, rows, environmentDigest: supportEnvDigest(),
      evaluatorVersion: SUPPORT_VERSIONS.reward_model_version, verifierVersion: SUPPORT_VERSIONS.verifier_version, ...overrides,
    }
  }
  const selectedPolicy = PRESETS[preset].spec
  const policyFor = policyForSpec(selectedPolicy)
  const rows = iamTasks.map((task) => {
    const yours = policyFor(task)
    const { passed, catastrophic } = verifyIamDecision(task, yours)
    return { id: task.id, yours, oracle: iamOracle(task).decision, passed, catastrophic }
  })
  return {
    ...common, selectedPolicy, battery: iamTasks, rows, environmentDigest: iamEnvDigest(),
    evaluatorVersion: IAM_VERSIONS.reward_model_version, verifierVersion: IAM_VERSIONS.verifier_version, ...overrides,
  }
}

const sign = async (input: BuildSyntheticReferenceCheckEvidenceInput) => signActionRunEvidence(buildSyntheticReferenceCheckEvidence(input), await generateSigningKey(), {
  keyId: 'origin-browser-session', keyEpoch: 1, issuer: 'origin-reference-check-session', signedAt: input.issuedAt,
})

const everyPreset = [
  ...Object.keys(SUPPORT_PRESETS).map((preset) => ['support', preset] as const),
  ...Object.keys(PRESETS).map((preset) => ['iam', preset] as const),
]

describe('the stated result (schema 1.1.0)', () => {
  it('writes a 1.1.0 record with the five-key evaluation block', () => {
    const evidence = buildSyntheticReferenceCheckEvidence(base)

    expect(evidence.schema_version).toBe('1.1.0')
    expect(Object.keys(evidence.evaluation ?? {}).sort()).toEqual(['battery', 'decisions', 'oracle_version', 'policy_parameters', 'summary'])
    expect(evidence.evaluation?.policy_parameters).toEqual(base.selectedPolicy)
    expect(validateActionRunEvidence(evidence, { now: base.issuedAt }).ok).toBe(true)
  })

  it.each(everyPreset)('cross-checks its digests and replays for %s %s', (scenario, preset) => {
    const input = pageInput(scenario, preset)
    const evidence = buildSyntheticReferenceCheckEvidence(input)
    const evaluation = evidence.evaluation!
    const verdictRows = evaluation.decisions.map((row, i) => ({
      id: row.id, selected_policy_decision: row.decision, oracle_decision: row.expected,
      passed: input.rows[i].passed, catastrophic: input.rows[i].catastrophic,
    }))

    expect(evaluation.decisions.map(({ id, decision, expected }) => [id, decision, expected]))
      .toEqual(input.rows.map(({ id, yours, oracle }) => [id, yours, oracle]))
    expect(digest(evaluation.policy_parameters)).toBe(evidence.subject.policy_digest)
    expect(digest(verdictRows)).toBe(evidence.source.oracle_verdict_digest)
    expect(evaluation.oracle_version).toBe(evidence.subject.verifier_version)
    expect(evidence.completeness.freshness.max_age_ms).toBe(THIRTY_DAYS_MS)
    expect(replayPolicyEvaluation(evidence).status).toBe('match')
  })

  it('keeps the typed model, tools, context and harness as digests only', async () => {
    const declaredConfig = { model: 'acme-refund-bot-7b', tools: ['acme.ledger.write', 'acme.mailer'], context: 'acme-support-prompt@9', harness: 'acme-harness@2' }
    const text = JSON.stringify(await sign(pageInput('support', 'least-privilege', { declaredConfig })))

    for (const typed of [declaredConfig.model, ...declaredConfig.tools, declaredConfig.context, declaredConfig.harness]) expect(text).not.toContain(typed)
  })

  it('states readable counts for a failing run: support Permissive is 4 of 12, 6 over-grants, 2 misses', () => {
    const evidence = buildSyntheticReferenceCheckEvidence(pageInput('support', 'permissive'))

    expect(evidence.evaluation?.summary).toEqual({ matched: 4, total: 12, over_grants: 6, misses: 2 })
    expect(replayPolicyEvaluation(evidence)).toMatchObject({
      status: 'match',
      summary: {
        over_grant_ids: ['sup-03', 'sup-04', 'sup-07', 'sup-08', 'sup-09', 'sup-12'],
        miss_rows: [{ id: 'sup-02', direction: 'looser' }, { id: 'sup-10', direction: 'looser' }],
      },
    })
  })

  it.each(everyPreset)('encodes the signed %s %s record for a /verify link under the 8,000-character cap', async (scenario, preset) => {
    const encoded = encodeArtifact(await sign(pageInput(scenario, preset)))

    expect(encoded).not.toBeNull()
    expect(encoded!.length).toBeLessThan(8000)
  })

  it('returns no link for a record over the cap, so the page shows the paste fallback', async () => {
    const signed = await sign(pageInput('support', 'permissive'))

    expect(encodeArtifact({ ...signed, padding: 'x'.repeat(4000) })).toBeNull()
  })

  it('is the record the /verify action-run example states', async () => {
    const issuedAt = '2026-11-12T00:00:00.000Z'
    const example = await makeExample('action-run', { issuedAt }) as SignedActionRunEvidence
    const built = buildSyntheticReferenceCheckEvidence(pageInput('support', 'permissive', { evidenceId: 'synthetic-browser-policy-evaluation', issuedAt }))

    expect({ ...example, signature: null }).toEqual(built)
  })
})
