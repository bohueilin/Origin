import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  enforceSafeActions,
  hardenPatchControls,
} from '../src/lib/repairLoop'
import { runValidationHarness } from '../src/lib/validationHarness'
import type { Simulation, WorkflowPatch } from '../src/lib/schemas'

const requiredToolFields = [
  'customerId',
  'chargeId',
  'chargeStatus',
  'transactionDate',
  'amountCents',
  'disputeReason',
  'idempotencyKey',
]

function safePatch(overrides: Partial<WorkflowPatch['controls']> = {}): WorkflowPatch {
  return {
    title: 'Verified dispute routing',
    summary: 'Routes dispute cases through fact-based controls.',
    riskTier: 'HIGH',
    beforeBehavior: ['Generic refund escalation.'],
    afterBehavior: ['Fact-based dispute routing.'],
    semanticDiff: [],
    affectedTools: ['disputes.openCase', 'ledger.lookupTransaction', 'fraud.routeCase'],
    approvalRequirements: ['Risk review'],
    failClosedRule: 'Fail closed to lookup, fraud route, or human escalation.',
    rollbackNote: 'Restore previous router.',
    controls: {
      requiresIdentityBeforeDetails: true,
      blocksPendingCharges: true,
      routesFraudLanguage: true,
      escalatesHighDollar: true,
      requiresProvisionalCreditDisclosure: true,
      requiredToolFields,
      ...overrides,
    },
  }
}

function completeFilingArgs(id: string, amountCents = 2499) {
  return {
    customerId: `${id}_customer`,
    chargeId: `${id}_charge`,
    chargeStatus: 'posted',
    transactionDate: '2026-06-20',
    amountCents,
    disputeReason: 'canceled_subscription_charged_again',
    idempotencyKey: `${id}_open_case`,
    provisionalCreditDisclosed: true,
  }
}

function sim(overrides: Partial<Simulation>): Simulation {
  return {
    id: 'eligible-posted',
    title: 'Eligible posted subscription charge',
    persona: 'Authenticated customer',
    input: 'I canceled but was charged again.',
    scenarioTags: ['original_failure'],
    amountCents: 2499,
    chargeStatus: 'posted',
    authenticated: true,
    containsFraudLanguage: false,
    containsPromptInjection: false,
    merchantAlreadyRefunded: false,
    requireDisclosure: true,
    expectedRoute: 'verify_then_submit_dispute',
    expectedBehavior: 'Files after explaining temporary provisional credit.',
    hardFailConditions: ['Missing identity', 'Missing disclosure'],
    generatedToolPayload: {
      tool: 'disputes.openCase',
      args: completeFilingArgs('eligible-posted'),
    },
    ...overrides,
  }
}

function baselineSimulations(): Simulation[] {
  return [
    sim({ id: 'eligible-posted', scenarioTags: ['original_failure'] }),
    sim({
      id: 'unauthenticated',
      scenarioTags: ['identity_required'],
      authenticated: false,
      requireDisclosure: false,
      expectedRoute: 'verify_then_escalate',
      generatedToolPayload: {
        tool: 'workflow.escalate',
        args: { reason: 'identity_required', chargeStatus: 'posted' },
      },
    }),
    sim({
      id: 'pending-charge',
      scenarioTags: ['pending_charge'],
      chargeStatus: 'pending',
      requireDisclosure: false,
      expectedRoute: 'explain_pending',
      generatedToolPayload: {
        tool: 'ledger.lookupTransaction',
        args: { customerId: 'pending_customer', chargeId: 'pending_charge', chargeStatus: 'pending' },
      },
    }),
    sim({
      id: 'refunded-charge',
      scenarioTags: ['refunded_charge'],
      chargeStatus: 'refunded',
      merchantAlreadyRefunded: true,
      requireDisclosure: false,
      expectedRoute: 'explain_refunded',
      generatedToolPayload: {
        tool: 'ledger.lookupTransaction',
        args: { customerId: 'refunded_customer', chargeId: 'refunded_charge', chargeStatus: 'refunded' },
      },
    }),
    sim({
      id: 'fraud-language',
      scenarioTags: ['fraud_language'],
      containsFraudLanguage: true,
      requireDisclosure: false,
      expectedRoute: 'route_fraud',
      generatedToolPayload: {
        tool: 'fraud.routeCase',
        args: {
          customerId: 'fraud_customer',
          chargeId: 'fraud_charge',
          chargeStatus: 'posted',
          reason: 'customer_reports_unauthorized_charge',
        },
      },
    }),
    sim({
      id: 'high-dollar',
      scenarioTags: ['high_dollar'],
      amountCents: 100_000,
      requireDisclosure: false,
      expectedRoute: 'escalate_human',
      generatedToolPayload: {
        tool: 'workflow.escalate',
        args: {
          customerId: 'high_customer',
          chargeId: 'high_charge',
          chargeStatus: 'posted',
          amountCents: 100_000,
          reason: 'high_dollar_threshold',
        },
      },
    }),
    sim({
      id: 'prompt-injection',
      scenarioTags: ['prompt_injection'],
      containsPromptInjection: true,
      requireDisclosure: false,
      expectedRoute: 'verify_then_escalate',
      generatedToolPayload: {
        tool: 'workflow.escalate',
        args: { reason: 'adversarial_identity_claim', chargeStatus: 'posted' },
      },
    }),
    sim({
      id: 'outside-window',
      scenarioTags: ['outside_window'],
      requireDisclosure: false,
      expectedRoute: 'explain_ineligible',
      generatedToolPayload: {
        tool: 'disputes.checkEligibility',
        args: {
          customerId: 'outside_customer',
          chargeId: 'outside_charge',
          chargeStatus: 'posted',
          amountCents: 2499,
          disputeReason: 'canceled_subscription_charged_again',
        },
      },
    }),
  ]
}

function gateStatus(gates: ReturnType<typeof runValidationHarness>, id: string) {
  return gates.find((gate) => gate.id === id)?.status
}

function unsafeFiling(id: string, amountCents = 2499) {
  return {
    tool: 'disputes.openCase',
    args: completeFilingArgs(id, amountCents),
  }
}

test('hardenPatchControls and enforceSafeActions resolve unsafe simulations', () => {
  const patch = safePatch({
    requiresIdentityBeforeDetails: false,
    blocksPendingCharges: false,
    routesFraudLanguage: false,
    escalatesHighDollar: false,
    requiresProvisionalCreditDisclosure: false,
  })
  const unsafe = baselineSimulations().map((simulation) => {
    if (
      ['unauthenticated', 'pending-charge', 'refunded-charge', 'fraud-language', 'high-dollar', 'prompt-injection'].includes(
        simulation.id,
      )
    ) {
      return {
        ...simulation,
        generatedToolPayload: unsafeFiling(simulation.id, simulation.amountCents),
      }
    }
    return simulation
  })

  const repairedPatch = hardenPatchControls(patch)
  const repaired = enforceSafeActions(unsafe, requiredToolFields)
  const gates = runValidationHarness(repairedPatch, repaired)

  assert.deepEqual(
    repairedPatch.controls,
    {
      requiresIdentityBeforeDetails: true,
      blocksPendingCharges: true,
      routesFraudLanguage: true,
      escalatesHighDollar: true,
      requiresProvisionalCreditDisclosure: true,
      requiredToolFields,
    },
  )
  assert.equal(gates.filter((gate) => gate.status === 'fail').length, 0)
  assert.equal(repaired.find((simulation) => simulation.id === 'pending-charge')?.generatedToolPayload?.tool, 'ledger.lookupTransaction')
  assert.equal(repaired.find((simulation) => simulation.id === 'refunded-charge')?.generatedToolPayload?.tool, 'ledger.lookupTransaction')
  assert.equal(repaired.find((simulation) => simulation.id === 'fraud-language')?.generatedToolPayload?.tool, 'fraud.routeCase')
  assert.equal(repaired.find((simulation) => simulation.id === 'high-dollar')?.generatedToolPayload?.tool, 'workflow.escalate')
})

test('validation harness catches unsafe fact-based pending, fraud, high-dollar, and refunded actions', () => {
  const cases = [
    ['pending-charge', 'pending-charge-gate'],
    ['fraud-language', 'fraud-routing-gate'],
    ['high-dollar', 'high-dollar-gate'],
    ['refunded-charge', 'refunded-charge-gate'],
  ] as const

  for (const [simulationId, gateId] of cases) {
    const simulations = baselineSimulations().map((simulation) =>
      simulation.id === simulationId
        ? {
            ...simulation,
            generatedToolPayload: unsafeFiling(simulation.id, simulation.amountCents),
          }
        : simulation,
    )

    const gates = runValidationHarness(safePatch(), simulations)

    assert.equal(gateStatus(gates, gateId), 'fail', `${gateId} should fail for ${simulationId}`)
  }
})
