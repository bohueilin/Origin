import { describe, it, expect } from 'vitest'
import { warehouseTasks, bfsOracle, verifyWarehouseRollout, oraclePolicy, alwaysFinishPolicy, WAREHOUSE_ACTIONS, WAREHOUSE_VERSION } from '../src/warehouse.ts'
import { computeLicenseFromVerdicts } from '../src/license.ts'
import { VERIFIER_VERSION, REWARD_MODEL_VERSION } from '../server/evalVersions.ts'
import { canonical, sha256 } from './env-evidence.mjs'
import { configDigest, mintCredential, verifyCredential } from './crucible.mjs'

const VERSIONS = { verifier_version: VERIFIER_VERSION, reward_model_version: REWARD_MODEL_VERSION }
const ENV_DIGEST = 'a'.repeat(64)
const finishTasks = warehouseTasks.filter((t) => bfsOracle(t).label === 'finish')

// Run a policy across the finishable tasks under the deterministic oracle; return pass rate,
// the verdicts (for the RSL ladder), and a content-addressed score digest per task (the receipts).
function certify(policyFor) {
  const verdicts = []
  const receiptDigests = []
  for (const task of finishTasks) {
    const r = verifyWarehouseRollout(task, policyFor(task), 'crucible')
    verdicts.push({ passed: r.passed, reward: r.reward, catastrophic: r.falseAccept })
    receiptDigests.push(sha256(canonical({ task_id: task.id, reward: r.reward, passed: r.passed, category: r.category })))
  }
  const passRate = verdicts.filter((v) => v.passed).length / verdicts.length
  return { verdicts, passRate, receiptDigests }
}

const HARNESSED_CONFIG = {
  model: 'reference-oracle@gemma-4-31b',
  tools: [...WAREHOUSE_ACTIONS],
  context: 'warehouse-gym',
  harness: `origin-rlkit@warehouse-${WAREHOUSE_VERSION}`,
}

function mintForOracle() {
  const harnessed = certify((t) => oraclePolicy(t))
  const cold = certify(() => alwaysFinishPolicy())
  const rslLevel = computeLicenseFromVerdicts(harnessed.verdicts).level.id
  const credential = mintCredential({
    agentConfig: HARNESSED_CONFIG,
    envBundleDigest: ENV_DIGEST,
    versions: VERSIONS,
    rslLevel,
    nTasks: finishTasks.length,
    coldPassRate: cold.passRate,
    harnessedPassRate: harnessed.passRate,
    receiptDigests: harnessed.receiptDigests,
  })
  return { credential, harnessed, cold }
}

describe('Crucible — config-bound certification issued by the deterministic oracle', () => {
  it('configDigest is deterministic and moves on ANY config change', () => {
    const base = configDigest(HARNESSED_CONFIG)
    expect(configDigest(HARNESSED_CONFIG)).toBe(base)
    expect(configDigest({ ...HARNESSED_CONFIG, model: 'other-model' })).not.toBe(base)
    expect(configDigest({ ...HARNESSED_CONFIG, tools: ['observe'] })).not.toBe(base)
    expect(configDigest({ ...HARNESSED_CONFIG, harness: 'other-harness' })).not.toBe(base)
  })

  it('a matching config verifies VALID (exit 0) and records a positive before/after lift', () => {
    const { credential, harnessed, cold } = mintForOracle()
    expect(verifyCredential({ credential, liveConfig: HARNESSED_CONFIG, envBundleDigest: ENV_DIGEST, versions: VERSIONS }).code).toBe(0)
    // the honest science claim: the harness lifts the same task set from cold-fail to pass.
    expect(harnessed.passRate).toBeGreaterThan(cold.passRate)
    expect(credential.lift).toBeCloseTo(harnessed.passRate - cold.passRate, 4)
    expect(credential.lift).toBeGreaterThan(0)
  })

  it('changing the agent config VOIDS the credential (exit 4)', () => {
    const { credential } = mintForOracle()
    const drifted = { ...HARNESSED_CONFIG, model: 'gpt-swap' } // same agent, different model
    expect(verifyCredential({ credential, liveConfig: drifted, envBundleDigest: ENV_DIGEST, versions: VERSIONS }).code).toBe(4)
    expect(verifyCredential({ credential, liveConfig: { ...HARNESSED_CONFIG, tools: ['observe', 'finish'] }, envBundleDigest: ENV_DIGEST, versions: VERSIONS }).code).toBe(4)
  })

  it('env / verifier drift VOIDS the credential (exit 4)', () => {
    const { credential } = mintForOracle()
    expect(verifyCredential({ credential, liveConfig: HARNESSED_CONFIG, envBundleDigest: 'b'.repeat(64), versions: VERSIONS }).code).toBe(4)
    expect(verifyCredential({ credential, liveConfig: HARNESSED_CONFIG, envBundleDigest: ENV_DIGEST, versions: { ...VERSIONS, verifier_version: '2.0.0' } }).code).toBe(4)
  })

  it('tampering the earned readiness is caught by the Sigil (exit 3)', () => {
    const { credential } = mintForOracle()
    credential.rsl_level = credential.rsl_level === 'L4' ? 'L1' : 'L4' // alter the earned level
    expect(verifyCredential({ credential, liveConfig: HARNESSED_CONFIG, envBundleDigest: ENV_DIGEST, versions: VERSIONS }).code).toBe(3)
  })

  it('a cold (unharnessed) config earns no better than a harnessed one — certification is earned, not granted', () => {
    const { harnessed, cold } = mintForOracle()
    const coldLevel = computeLicenseFromVerdicts(cold.verdicts).level.id
    const harnessedLevel = computeLicenseFromVerdicts(harnessed.verdicts).level.id
    expect(cold.passRate).toBe(0) // alwaysFinish fake-finishes → the gate zeroes it
    expect(coldLevel).not.toBe(harnessedLevel)
  })
})
