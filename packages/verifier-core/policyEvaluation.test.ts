import { describe, it, expect } from 'vitest'
import { canonical, sha256 } from '@origin/evidence/env-evidence'
import { buildPolicyEvaluation, replayPolicyEvaluation, verdictRows, NOT_TESTED, SHIPPED_BATTERIES } from './policyEvaluation.mjs'
import {
  supportTasks, supportOracle, verifySupportDecision, supportEnvDigest, SUPPORT_VERSIONS,
  supportPolicyFromParameters, validateSupportPolicyParameters,
} from './supportGym.mjs'
import {
  iamTasks, iamOracle, verifyIamDecision, iamEnvDigest, IAM_VERSIONS,
  iamPolicyFromParameters, validateIamPolicyParameters,
} from './iamGym.mjs'
import { missDirection } from './missDirection.mjs'
import { checkText } from '../../scripts/lib/banned.mjs' // the honesty-lint's banned-claim check

// The Action/Run 1.1.0 evaluation block and its replay. Each record below is built the way the
// /reference-check builder writes one: the verdict rows it digests are scored here by the gym
// itself, not by the module under test, so a replay "match" is checked against independent work.

type Params = Record<string, unknown>
type Decision = 'allow' | 'deny' | 'escalate'
type Gym = {
  tasks: { id: string }[]
  oracle: (task: never) => { decision: Decision }
  score: (task: never, decision: Decision) => { passed: boolean; catastrophic: boolean }
  policyFrom: (params: never) => (task: never) => Decision
  envDigest: () => string
  verifier: string
}
const GYMS: Record<'support' | 'iam', Gym> = {
  support: { tasks: supportTasks, oracle: supportOracle, score: verifySupportDecision, policyFrom: supportPolicyFromParameters, envDigest: supportEnvDigest, verifier: SUPPORT_VERSIONS.verifier_version },
  iam: { tasks: iamTasks, oracle: iamOracle, score: verifyIamDecision, policyFrom: iamPolicyFromParameters, envDigest: iamEnvDigest, verifier: IAM_VERSIONS.verifier_version },
} as unknown as Record<'support' | 'iam', Gym>

const digest = (value: unknown) => sha256(canonical(value))
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const BOOLS16 = Array.from({ length: 16 }, (_, n) => [0, 1, 2, 3].map((bit) => Boolean(n & (1 << bit))))
const CAPS = [50, 100, 250, 100000, 0, 15, 80, 95, 200, 450] // the UI's four options, then boundary caps
const SUPPORT_COMBOS = BOOLS16.flatMap(([denyPii, denyForbidden, denyTainted, requireApprovalHigh]) =>
  CAPS.map((refundCap) => ({ refundCap, denyPii, denyForbidden, denyTainted, requireApprovalHigh })))
const IAM_COMBOS = BOOLS16.flatMap(([honorRoleAllowlist, denyForbidden, denyTainted, escalateOnApproval]) =>
  (['low', 'medium', 'high', 'forbidden'] as const).map((autoAllowUpTo) => ({ honorRoleAllowlist, denyForbidden, denyTainted, escalateOnApproval, autoAllowUpTo })))
const COMBOS: ['support' | 'iam', Params][] = [
  ...SUPPORT_COMBOS.map((p) => ['support', p] as ['support', Params]),
  ...IAM_COMBOS.map((p) => ['iam', p] as ['iam', Params]),
]
const PERMISSIVE = { refundCap: 100000, denyPii: false, denyForbidden: false, denyTainted: false, requireApprovalHigh: false }

// The verdict rows /reference-check digests into source.oracle_verdict_digest, for given decisions.
function gymVerdictRows(scenario: 'support' | 'iam', decisions: Decision[]) {
  const gym = GYMS[scenario]
  return gym.tasks.map((task, i) => {
    const v = gym.score(task as never, decisions[i])
    return { id: task.id, selected_policy_decision: decisions[i], oracle_decision: gym.oracle(task as never).decision, passed: v.passed, catastrophic: v.catastrophic }
  })
}

function recordFor(scenario: 'support' | 'iam', parameters: Params) {
  const gym = GYMS[scenario]
  const policyFor = gym.policyFrom(parameters as never)
  const decisions = gym.tasks.map((task) => policyFor(task as never))
  const ids = gym.tasks.map((t) => t.id)
  return {
    subject: { policy_digest: digest(parameters), environment_digest: gym.envDigest(), verifier_version: gym.verifier },
    proposal: { proposed_effect: { scenario: scenario as string, selected_battery_task_ids: ids } },
    completeness: { expected_count: gym.tasks.length, covered_ids_digest: digest([...ids].sort()) },
    source: { oracle_verdict_digest: digest(gymVerdictRows(scenario, decisions)) },
    evaluation: buildPolicyEvaluation({ scenario, parameters } as never),
  }
}

// A forger with the public battery: flips one decision, then makes the summary and the verdict
// digest agree with the forged rows (and would re-sign with their own key).
function forgeDecision(scenario: 'support' | 'iam', record: ReturnType<typeof recordFor>, index: number, to: Decision) {
  const forged = clone(record)
  forged.evaluation.decisions[index].decision = to
  const decisions = forged.evaluation.decisions.map((row: { decision: Decision }) => row.decision)
  const rows = gymVerdictRows(scenario, decisions)
  const matched = rows.filter((r) => r.passed).length
  const over = rows.filter((r) => r.catastrophic).length
  forged.evaluation.summary = { matched, total: rows.length, over_grants: over, misses: rows.length - matched - over }
  forged.source.oracle_verdict_digest = digest(rows)
  return forged
}

describe('buildPolicyEvaluation — the five-key block', () => {
  it('states exactly battery, oracle_version, policy_parameters, decisions and summary', () => {
    const block = buildPolicyEvaluation({ scenario: 'support', parameters: PERMISSIVE })
    expect(Object.keys(block)).toEqual(['battery', 'oracle_version', 'policy_parameters', 'decisions', 'summary'])
    expect(block.battery).toEqual({ id: 'support', version: 'support-gym-v1' })
    expect(block.oracle_version).toBe('support-oracle-v1')
    expect(block.policy_parameters).toEqual(PERMISSIVE)
    expect(block.decisions.map((row) => row.id)).toEqual(supportTasks.map((t: { id: string }) => t.id))
    for (const row of block.decisions) expect(Object.keys(row)).toEqual(['id', 'decision', 'expected']) // no reason text
    expect(Object.keys(block.summary)).toEqual(['matched', 'total', 'over_grants', 'misses'])
  })

  it('the support Permissive preset states 4 of 12, 6 over-grants and 2 misses', () => {
    expect(buildPolicyEvaluation({ scenario: 'support', parameters: PERMISSIVE }).summary).toEqual({ matched: 4, total: 12, over_grants: 6, misses: 2 })
  })

  it('names the IAM battery and oracle', () => {
    const block = buildPolicyEvaluation({ scenario: 'iam', parameters: IAM_COMBOS[0] })
    expect(block.battery).toEqual({ id: 'iam', version: 'iam-gym-v1' })
    expect(block.oracle_version).toBe('iam-oracle-v1')
  })

  it('refuses an unknown scenario and parameters outside the exact key set', () => {
    expect(() => buildPolicyEvaluation({ scenario: 'warehouse', parameters: PERMISSIVE } as never)).toThrow(TypeError)
    expect(() => buildPolicyEvaluation({ scenario: 'support', parameters: { ...PERMISSIVE, extra: true } } as never)).toThrow(TypeError)
    expect(() => buildPolicyEvaluation({ scenario: 'iam', parameters: PERMISSIVE } as never)).toThrow(TypeError)
  })
})

describe('replayPolicyEvaluation — every parameter combination', () => {
  it(`build then replay matches, with counts and ids from the replayed rows (${COMBOS.length} combinations)`, () => {
    for (const [scenario, parameters] of COMBOS) {
      const record = recordFor(scenario, parameters)
      const replay = replayPolicyEvaluation(record)
      expect(replay.status, `${scenario} ${JSON.stringify(parameters)}`).toBe('match')
      if (replay.status !== 'match') continue
      expect(replay.diffs).toEqual([])
      const { over_grant_ids, miss_rows, ...counts } = replay.summary
      expect(counts).toEqual(record.evaluation.summary)
      expect(counts.matched + counts.over_grants + counts.misses).toBe(counts.total)
      expect(over_grant_ids).toHaveLength(counts.over_grants)
      expect(miss_rows).toHaveLength(counts.misses)
      for (const miss of miss_rows) {
        const row = record.evaluation.decisions.find((r) => r.id === miss.id)!
        expect(miss.direction).toBe(missDirection(row.decision, row.expected))
      }
    }
  })

  it('verdictRows() gives the rows the builder digests, scored independently by the gym', () => {
    for (const [scenario, parameters] of COMBOS) {
      const block = buildPolicyEvaluation({ scenario, parameters } as never)
      expect(verdictRows(block)).toEqual(gymVerdictRows(scenario, block.decisions.map((row) => row.decision)))
    }
    const unshipped = { ...buildPolicyEvaluation({ scenario: 'support', parameters: PERMISSIVE }), battery: { id: 'support', version: 'support-gym-v9' } }
    expect(() => verdictRows(unshipped as never)).toThrow(TypeError)
  })

  it('a decision flipped and made consistent everywhere else is a mismatch that names its id', () => {
    for (const [scenario, parameters] of COMBOS) {
      const record = recordFor(scenario, parameters)
      record.evaluation.decisions.forEach((row, index) => {
        for (const to of (['allow', 'deny', 'escalate'] as const).filter((d) => d !== row.decision)) {
          const replay = replayPolicyEvaluation(forgeDecision(scenario, record, index, to))
          expect(replay.status).toBe('mismatch')
          expect(replay.diffs).toEqual([{ kind: 'row', id: row.id, field: 'decision', stated: to, replayed: row.decision }])
        }
      })
    }
  })

  it('a decision flipped without updating anything else is a mismatch', () => {
    for (const [scenario, parameters] of COMBOS) {
      const record = recordFor(scenario, parameters)
      record.evaluation.decisions.forEach((row, index) => {
        const flipped = clone(record)
        flipped.evaluation.decisions[index].decision = row.decision === 'allow' ? 'deny' : 'allow'
        expect(replayPolicyEvaluation(flipped).status).toBe('mismatch')
      })
    }
  })
})

describe('replayPolicyEvaluation — named mismatches', () => {
  const field = (name: string) => ({ kind: 'field', field: name })

  it('parameters edited without updating subject.policy_digest', () => {
    const record = recordFor('support', PERMISSIVE)
    record.evaluation.policy_parameters = { ...PERMISSIVE, denyPii: true }
    expect(replayPolicyEvaluation(record)).toEqual({ status: 'mismatch', diffs: [field('subject.policy_digest')], summary: null })
  })

  it('a summary count edited without the rows', () => {
    const matchedEdited = recordFor('support', PERMISSIVE)
    matchedEdited.evaluation.summary = { matched: 5, total: 12, over_grants: 5, misses: 2 }
    expect(replayPolicyEvaluation(matchedEdited).diffs).toEqual([field('summary')])
    // matched and the sum still agree, so only the battery re-run catches it
    const overGrantsEdited = recordFor('support', PERMISSIVE)
    overGrantsEdited.evaluation.summary = { matched: 4, total: 12, over_grants: 5, misses: 3 }
    expect(replayPolicyEvaluation(overGrantsEdited)).toEqual({ status: 'mismatch', diffs: [field('summary')], summary: null })
  })

  it('the record against itself: oracle version, battery ids and expected count', () => {
    const oracle = recordFor('iam', IAM_COMBOS[5])
    oracle.subject.verifier_version = 'iam-oracle-v2'
    expect(replayPolicyEvaluation(oracle).diffs).toEqual([field('subject.verifier_version')])
    const ids = recordFor('iam', IAM_COMBOS[5])
    ids.proposal.proposed_effect.selected_battery_task_ids = [...ids.proposal.proposed_effect.selected_battery_task_ids].reverse()
    expect(replayPolicyEvaluation(ids).diffs).toEqual([field('proposal.proposed_effect.selected_battery_task_ids')])
    const count = recordFor('iam', IAM_COMBOS[5])
    count.completeness.expected_count = 11
    expect(replayPolicyEvaluation(count).diffs).toEqual([field('completeness.expected_count')])
  })

  it('the record against itself: the scenario it describes and the covered ids digest', () => {
    const scenario = recordFor('support', PERMISSIVE)
    scenario.proposal.proposed_effect.scenario = 'iam'
    expect(replayPolicyEvaluation(scenario)).toEqual({ status: 'mismatch', diffs: [field('proposal.proposed_effect.scenario')], summary: null })
    const covered = recordFor('support', PERMISSIVE)
    covered.completeness.covered_ids_digest = 'f'.repeat(64)
    expect(replayPolicyEvaluation(covered)).toEqual({ status: 'mismatch', diffs: [field('completeness.covered_ids_digest')], summary: null })
    // Both need no battery, so they are named even beside a battery this verifier does not ship.
    scenario.evaluation.battery.version = 'support-gym-v9'
    expect(replayPolicyEvaluation(scenario).status).toBe('mismatch')
  })

  it('against the shipped battery: environment digest, expected answers, verdict digest, ids and parameters', () => {
    const env = recordFor('support', PERMISSIVE)
    env.subject.environment_digest = 'f'.repeat(64)
    expect(replayPolicyEvaluation(env).diffs).toEqual([field('subject.environment_digest')])

    const expected = recordFor('support', PERMISSIVE)
    expected.evaluation.decisions[1].expected = 'allow' // sup-02: the oracle escalates
    expected.evaluation.summary = { matched: 5, total: 12, over_grants: 6, misses: 1 }
    expect(replayPolicyEvaluation(expected).diffs).toEqual([
      { kind: 'row', id: 'sup-02', field: 'expected', stated: 'allow', replayed: 'escalate' },
      field('source.oracle_verdict_digest'),
      field('summary'),
    ])

    const verdict = recordFor('support', PERMISSIVE)
    verdict.source.oracle_verdict_digest = 'e'.repeat(64)
    expect(replayPolicyEvaluation(verdict).diffs).toEqual([field('source.oracle_verdict_digest')])

    const subset = recordFor('support', PERMISSIVE)
    subset.evaluation.decisions = subset.evaluation.decisions.slice(1)
    subset.evaluation.summary = { matched: 3, total: 11, over_grants: 6, misses: 2 }
    subset.proposal.proposed_effect.selected_battery_task_ids = subset.proposal.proposed_effect.selected_battery_task_ids.slice(1)
    subset.completeness.expected_count = 11
    subset.completeness.covered_ids_digest = digest([...subset.proposal.proposed_effect.selected_battery_task_ids].sort())
    expect(replayPolicyEvaluation(subset).diffs).toEqual([field('decisions')])

    const params = recordFor('support', PERMISSIVE)
    params.evaluation.policy_parameters = { ...PERMISSIVE, refundCap: -1 }
    params.subject.policy_digest = digest(params.evaluation.policy_parameters)
    expect(replayPolicyEvaluation(params).diffs).toEqual([field('policy_parameters')])
  })

  it('a malformed block is a mismatch, not a crash', () => {
    for (const evaluation of [null, 'x', [], { ...recordFor('iam', IAM_COMBOS[0]).evaluation, decisions: 'x' }, { ...recordFor('iam', IAM_COMBOS[0]).evaluation, summary: { matched: -1 } }]) {
      expect(replayPolicyEvaluation({ ...recordFor('iam', IAM_COMBOS[0]), evaluation })).toEqual({ status: 'mismatch', diffs: [field('evaluation')], summary: null })
    }
  })
})

describe('replayPolicyEvaluation — availability', () => {
  it('an unknown battery version or battery is unavailable, naming it and what this verifier ships', () => {
    const version = recordFor('support', PERMISSIVE)
    version.evaluation.battery.version = 'support-gym-v9'
    const shipped = [{ name: 'support', version: 'support-gym-v1' }, { name: 'iam', version: 'iam-gym-v1' }]
    expect(replayPolicyEvaluation(version)).toEqual({
      status: 'unavailable', summary: null,
      diffs: [{ kind: 'unavailable', field: 'battery', named: { name: 'support', version: 'support-gym-v9' }, shipped }],
    })
    const battery = recordFor('support', PERMISSIVE)
    battery.evaluation.battery = { id: 'warehouse', version: 'warehouse-gym-v1' } as never
    battery.proposal.proposed_effect.scenario = 'warehouse'
    expect(replayPolicyEvaluation(battery).status).toBe('unavailable')
  })

  it('an unknown oracle and verifier version is unavailable', () => {
    const record = recordFor('support', PERMISSIVE)
    record.evaluation.oracle_version = 'support-oracle-v9'
    record.subject.verifier_version = 'support-oracle-v9'
    expect(replayPolicyEvaluation(record)).toEqual({
      status: 'unavailable', summary: null,
      diffs: [{ kind: 'unavailable', field: 'oracle_version', named: { name: 'oracle', version: 'support-oracle-v9' }, shipped: [{ name: 'oracle', version: 'support-oracle-v1' }] }],
    })
  })

  it('an oracle version this verifier ships for the other battery is a mismatch, not unavailable', () => {
    for (const [scenario, other] of [['support', 'iam-oracle-v1'], ['iam', 'support-oracle-v1']] as const) {
      const record = recordFor(scenario, scenario === 'support' ? PERMISSIVE : IAM_COMBOS[0])
      record.evaluation.oracle_version = other
      record.subject.verifier_version = other
      expect(replayPolicyEvaluation(record)).toEqual({ status: 'mismatch', diffs: [{ kind: 'field', field: 'evaluation.oracle_version' }], summary: null })
    }
  })

  it('the checks that need no battery run first: a wrong policy_digest beside an unknown battery is a mismatch', () => {
    const record = recordFor('support', PERMISSIVE)
    record.evaluation.battery.version = 'support-gym-v9'
    record.subject.policy_digest = 'a'.repeat(64)
    expect(replayPolicyEvaluation(record)).toEqual({ status: 'mismatch', diffs: [{ kind: 'field', field: 'subject.policy_digest' }], summary: null })
  })

  it('a record without a block is absent', () => {
    const legacy: Params = recordFor('support', PERMISSIVE)
    delete legacy.evaluation
    for (const value of [legacy, {}, null, undefined, 'x']) {
      expect(replayPolicyEvaluation(value)).toEqual({ status: 'absent', diffs: [], summary: null })
    }
  })

  it('the registry still lists every battery version shipped so far, with unchanged battery digests', () => {
    expect(SHIPPED_BATTERIES).toEqual(expect.arrayContaining([
      { id: 'support', version: 'support-gym-v1', oracle_version: 'support-oracle-v1' },
      { id: 'iam', version: 'iam-gym-v1', oracle_version: 'iam-oracle-v1' },
    ]))
    expect(supportEnvDigest()).toBe('b2b3c5a571e7925a7c9fa229e21a8caabfe4f524ac3a2ba0badc870faa6c9435')
    expect(iamEnvDigest()).toBe('310bfed3e4725b19fafc7db8cb710fae3771ad248775924703aac85af6fe2bb4')
  })
})

describe('parameter validators', () => {
  it('accept every combination above', () => {
    for (const p of SUPPORT_COMBOS) expect(validateSupportPolicyParameters(p)).toEqual({ ok: true, failures: [] })
    for (const p of IAM_COMBOS) expect(validateIamPolicyParameters(p)).toEqual({ ok: true, failures: [] })
  })

  it('reject extra or missing keys, non-booleans, a negative, fractional or unsafe refundCap, and non-objects', () => {
    const noCap: Params = { ...PERMISSIVE }
    delete noCap.refundCap
    for (const bad of [
      { ...PERMISSIVE, extra: true }, noCap, { ...PERMISSIVE, denyPii: 'false' }, { ...PERMISSIVE, denyTainted: 0 },
      { ...PERMISSIVE, refundCap: -1 }, { ...PERMISSIVE, refundCap: 2.5 }, { ...PERMISSIVE, refundCap: 2 ** 53 }, { ...PERMISSIVE, refundCap: '100' },
      null, [], 'x',
    ]) expect(validateSupportPolicyParameters(bad).ok, JSON.stringify(bad)).toBe(false)
  })

  it('reject an unknown autoAllowUpTo, extra keys and non-booleans', () => {
    const ok = IAM_COMBOS[0]
    for (const bad of [
      { ...ok, autoAllowUpTo: 'critical' }, { ...ok, autoAllowUpTo: 'toString' }, { ...ok, autoAllowUpTo: undefined },
      { ...ok, extra: 1 }, { ...ok, denyForbidden: 'yes' }, null, [],
    ]) expect(validateIamPolicyParameters(bad).ok, JSON.stringify(bad)).toBe(false)
  })
})

describe('NOT_TESTED — display text keyed by verifier version', () => {
  it('has an entry for every shipped oracle, in the published wording', () => {
    for (const b of SHIPPED_BATTERIES) {
      expect(NOT_TESTED[b.oracle_version]).toEqual([
        'named agent or model behavior', 'provider or real-system effects', 'requests outside this battery', 'whether this answer key encodes your policy',
      ])
    }
  })

  it('checkText() finds no banned claim in any entry', () => {
    for (const [version, entries] of Object.entries(NOT_TESTED)) {
      for (const text of [...entries, `Not tested: ${entries.join('; ')}.`]) expect(checkText(text), `${version}: ${text}`).toEqual([])
    }
  })
})
