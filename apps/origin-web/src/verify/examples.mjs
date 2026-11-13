// /verify — loadable SYNTHETIC examples, minted by the real SDK at runtime.
// =============================================================================
// Every example is generated in the caller's runtime by the same
// @origin/verifier-core + @origin/evidence code the page verifies with — the
// Sigil is signed with a fresh in-browser Web Crypto key (the private key never
// leaves the page and is discarded), the credential is minted by Crucible, the
// trace/receipt by the evidence core, the inclusion proof by the Merkle
// batcher. Nothing is fetched; nothing is uploaded.
//
// All payloads are SYNTHETIC demo data and labeled as such — they are not
// customer data and not real customer proof.
// =============================================================================

import { canonical, chainEpisode, buildScoreReceipt, sha256 } from '@origin/evidence/env-evidence'
import { generateSigningKey, signSigil } from '@origin/verifier-core/sigil'
import { buildActionRunEvidence } from '@origin/evidence/action-run-evidence'
import { signActionRunEvidence } from '@origin/verifier-core/action-run-evidence'
import { mintCredential } from '@origin/verifier-core/crucible'
import { batchReceipts } from '@origin/verifier-core/merkleBatch'
import { buildPolicyEvaluation, verdictRows } from '@origin/verifier-core/policyEvaluation'
import { SUPPORT_VERSIONS, supportEnvDigest, supportTasks } from '@origin/verifier-core/supportGym'

export const exampleKinds = ['reference', 'action-run', 'sigil', 'credential', 'receipt', 'trace', 'inclusion', 'factory']

const DEMO_ENV_DIGEST = sha256('synthetic-demo-env-bundle')
const DEMO_VERSIONS = { verifier_version: 'demo-verifier-1.0.0', reward_model_version: 'demo-reward-1.0.0' }
const digest = (value) => sha256(canonical(value))

// The action-run example is the record /reference-check makes (src/reference-check/evidence.ts)
// for its default support configuration and the Permissive preset (SUPPORT_PRESETS.permissive in
// src/certify/policySpec.ts), with the page's 30-day window. reference-check/evidence.test.ts
// checks that the two stay equal.
const PERMISSIVE_SUPPORT_POLICY = { refundCap: 100000, denyPii: false, denyForbidden: false, denyTainted: false, requireApprovalHigh: false }
const DECLARED_SUPPORT_CONFIG = { model: 'support-agent-v1', tools: ['refunds', 'crm.write', 'email.send'], context: 'support-policy@1', harness: 'my-harness@1' }
const ACTION_RUN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function demoTrace() {
  return chainEpisode(
    {
      trace_schema_version: '1.0.0',
      episode_id: 'ep_demo_verify_001',
      note: 'SYNTHETIC demo episode — not customer data',
      env_bundle_digest: DEMO_ENV_DIGEST,
      policy_version: 'demo-policy-1',
      verifier_version: DEMO_VERSIONS.verifier_version,
      seed: 7,
      task: { kind: 'demo.pick_place', goal: 'move crate A to bay 3' },
    },
    [
      { event_type: 'action.applied', step_index: 0, payload: { action: { type: 'move', to: 'bay-3' } } },
      { event_type: 'action.applied', step_index: 1, payload: { action: { type: 'grasp', object: 'crate-A' } } },
      { event_type: 'action.applied', step_index: 2, payload: { action: { type: 'release' } } },
    ],
  )
}

/**
 * Mint one synthetic example of the given kind. Async because the Sigil is signed live.
 * `issuedAt` pins the action-run record's issue time; it defaults to now.
 */
export async function makeExample(kind, { issuedAt } = {}) {
  switch (kind) {
    case 'action-run': {
      // Schema 1.1.0: the record states its result (4 of 12, 6 over-grants, 2 misses), which /verify replays.
      const issued = issuedAt ?? new Date().toISOString()
      const id = 'synthetic-browser-policy-evaluation'
      const ids = supportTasks.map((task) => task.id)
      const evaluation = buildPolicyEvaluation({ scenario: 'support', parameters: PERMISSIVE_SUPPORT_POLICY })
      const envDigest = supportEnvDigest()
      const evidence = buildActionRunEvidence({
        evidence_id: id, issued_at: issued, execution_mode: 'simulated',
        identity: { principal_id: 'user-declared-agent-configuration', tenant_id: null, workload_id: 'origin-reference-check', on_behalf_of: null },
        subject: {
          run_id: `${id}:policy-evaluation`, action_id: `${id}:selected-policy`,
          model_digest: digest({ model: DECLARED_SUPPORT_CONFIG.model }), tools_digest: digest(DECLARED_SUPPORT_CONFIG.tools),
          policy_digest: digest(PERMISSIVE_SUPPORT_POLICY), environment_digest: envDigest,
          evaluator_version: SUPPORT_VERSIONS.reward_model_version, verifier_version: SUPPORT_VERSIONS.verifier_version, adapter_version: null,
        },
        proposal: {
          action_type: 'synthetic_reference_check_policy_evaluation',
          proposed_effect: {
            kind: 'synthetic_reference_check_policy_evaluation', policy_only: true, scenario: 'support',
            synthetic_battery: 'Origin synthetic support policy battery',
            named_agent_contacted: false, named_agent_executed: false, policy_evaluated_locally: true,
            selected_battery_task_ids: ids, unexpected_observed_ids: [],
          },
          input_digest: digest({
            scenario: 'support', declared_config: DECLARED_SUPPORT_CONFIG, selected_policy: PERMISSIVE_SUPPORT_POLICY,
            ordered_battery_ids: ids, environment_digest: envDigest,
            evaluator_version: SUPPORT_VERSIONS.reward_model_version, verifier_version: SUPPORT_VERSIONS.verifier_version,
          }),
        },
        authorization: { verdict: 'deny', reason_codes: ['synthetic_policy_only_no_execution_authority'], approval_id: null, approved_by: null, nonce_digest: null, expires_at: null },
        outcome_attestation: { status: 'not_attempted', attester: 'none', attested_at: null, statement_digest: null },
        provider_evidence: { provider: null, receipt_digest: null, readback_digest: null, readback_at: null },
        completeness: {
          coverage: 'complete', expected_count: ids.length, observed_count: ids.length, covered_ids_digest: digest([...ids].sort()), omissions: [], duplicates: [],
          freshness: { status: 'fresh', observed_at: issued, max_age_ms: ACTION_RUN_MAX_AGE_MS },
        },
        source: { trace_id: null, audit_row_digest: null, oracle_verdict_digest: digest(verdictRows(evaluation)) },
        evaluation,
      })
      return signActionRunEvidence(evidence, await generateSigningKey(), {
        keyId: 'origin-browser-session', keyEpoch: 1, issuer: 'origin-reference-check-session', signedAt: issued,
      })
    }
    case 'reference': {
      const liveConfig = {
        model: 'support-agent-v1 (SYNTHETIC sandbox)',
        tools: ['ticket.read', 'ticket.reply', 'refund.escalate'],
        context: 'synthetic support-policy@1',
        harness: 'deterministic least-privilege reference-check@1',
        note: 'SYNTHETIC SANDBOX configuration — not customer evidence',
      }
      const envBundleDigest = sha256('synthetic-support-reference-check-bundle-v1')
      const versions = { verifier_version: 'support-reference-check-demo-1', reward_model_version: 'support-oracle-demo-1' }
      const credential = mintCredential({
        agentConfig: liveConfig, envBundleDigest, versions, rslLevel: 'L2', nTasks: 6,
        coldPassRate: 0.5, harnessedPassRate: 1,
        receiptDigests: [sha256('synthetic-support-reference-receipt-001')], issuedAt: '2026-07-18',
      })
      return {
        artifact_kind: 'synthetic-sandbox-reference-check-credential',
        note: 'SYNTHETIC SANDBOX example — illustrative only; not customer evidence or external validation',
        credential, liveConfig, envBundleDigest, versions,
      }
    }
    case 'sigil': {
      const key = await generateSigningKey()
      return signSigil(
        {
          receipt_schema_version: '1.0.0',
          kind: 'demo.score_receipt',
          note: 'SYNTHETIC demo receipt — not customer data',
          episode_id: 'ep_demo_verify_001',
          reward: 1,
          passed: true,
          verifier_version: DEMO_VERSIONS.verifier_version,
        },
        key,
        { issuer: 'origin-demo', kind: 'score-receipt', signed_at: '2026-07-07' },
      )
    }
    case 'credential':
      return mintCredential({
        agentConfig: {
          model: 'demo-agent-v1',
          tools: ['iam.decide'],
          context: 'least-privilege-system-prompt@3',
          harness: 'janus-router@1',
          note: 'SYNTHETIC demo config',
        },
        envBundleDigest: DEMO_ENV_DIGEST,
        versions: DEMO_VERSIONS,
        rslLevel: 'L2',
        nTasks: 12,
        coldPassRate: 0.42,
        harnessedPassRate: 0.92,
        receiptDigests: [sha256('demo-receipt-001'), sha256('demo-receipt-002')],
        issuedAt: '2026-07-07',
      })
    case 'receipt':
      return buildScoreReceipt({
        episode: demoTrace(),
        envBundleDigest: DEMO_ENV_DIGEST,
        rollout: { reward: 1, passed: true, category: 'demo', falseAccept: false, falseReject: false },
        versions: DEMO_VERSIONS,
        licenseLevel: 'L2',
      })
    case 'trace':
      return demoTrace()
    case 'inclusion': {
      const entries = Array.from({ length: 4 }, (_, i) => ({
        beneficiary: `partner-0${i + 1}`,
        receipt: {
          kind: 'demo.receipt',
          note: 'SYNTHETIC demo receipt — not customer data',
          receipt_id: `r-00${i + 1}`,
          reward: i % 2,
          verifier_version: DEMO_VERSIONS.verifier_version,
        },
      }))
      const batch = batchReceipts(entries)
      return {
        artifact_kind: 'merkle-inclusion-proof',
        note: 'SYNTHETIC demo batch — in production the root travels signed as a Sigil',
        beneficiary: entries[2].beneficiary,
        receipt: entries[2].receipt,
        proof: batch.proofs[2],
        root: batch.root,
      }
    }
    case 'factory': {
      // One evidence spine, two actors: a PHYSICAL factory plan earns the same
      // config-bound, sigil-wrapped reference check a digital agent gets. The
      // shape mirrors what an external deterministic factory verifier issues
      // (cold = un-gated plan, harnessed = verifier + recursive repair); the
      // numbers here are SYNTHETIC demo data.
      const key = await generateSigningKey()
      const credential = mintCredential({
        agentConfig: {
          model: 'factory-brain-trm-student (SYNTHETIC demo)',
          tools: ['plan.emit', 'plan.repair'],
          context: 'synthetic 30-day factory scenarios',
          harness: 'verifier-gated recursive repair, fail-closed',
          note: 'SYNTHETIC demo config — a robot/factory plan on the same evidence spine',
        },
        envBundleDigest: sha256('synthetic-factory-gym-bundle'),
        versions: { verifier_version: 'factory-verifier-demo-1', reward_model_version: 'factory-reward-demo-1' },
        rslLevel: 'L4',
        nTasks: 24,
        coldPassRate: 0,
        harnessedPassRate: 1,
        receiptDigests: [sha256('factory-demo-receipt-001'), sha256('factory-demo-receipt-002')],
        issuedAt: '2026-07-09',
      })
      return signSigil(credential, key, {
        issuer: 'origin-factory-verifier-demo',
        kind: 'reference-check',
        signed_at: '2026-07-09',
      })
    }
    default:
      throw new Error(`unknown example kind: ${String(kind)}`)
  }
}
