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

import { chainEpisode, buildScoreReceipt, sha256 } from '@origin/evidence/env-evidence'
import { generateSigningKey, signSigil } from '@origin/verifier-core/sigil'
import { mintCredential } from '@origin/verifier-core/crucible'
import { batchReceipts } from '@origin/verifier-core/merkleBatch'

export const exampleKinds = ['sigil', 'credential', 'receipt', 'trace', 'inclusion', 'factory']

const DEMO_ENV_DIGEST = sha256('synthetic-demo-env-bundle')
const DEMO_VERSIONS = { verifier_version: 'demo-verifier-1.0.0', reward_model_version: 'demo-reward-1.0.0' }

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

/** Mint one synthetic example of the given kind. Async because the Sigil is signed live. */
export async function makeExample(kind) {
  switch (kind) {
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
          license_level: 'L2',
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
