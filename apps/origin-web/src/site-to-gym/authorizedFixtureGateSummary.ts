export const AUTHORIZED_FIXTURE_GATE_SUMMARY = {
  title: 'Approval path demo',
  status: 'Authorized fixture evaluated',
  defaultRealCustomerGateStatus: 'BLOCKED_NO_REAL_CUSTOMER_AUTHORIZATION',
  authorizedFixtureStatus: 'AUTHORIZED_FIXTURE_EVALUATED',
  dataBoundary: 'authorized_local_fixture_not_real_customer_data',
  lane: 'CUSTOMER_OWNED',
  licenseClass: 'customer_owned',
  authorizedFixtureIsRealCustomerData: false,
  realCustomerReadinessPassed: false,
  trainingAllowed: false,
  externalApiAllowed: false,
  oracleDivergence: 0,
  rows: 7,
  labelMix: { finish: 1, escalate: 3, refuse: 3 },
  evidenceReview: {
    included: 5,
    excluded: 5,
    compiledHardCases: 7,
    blockedHardCases: 6,
    redactionRequiredAndSatisfied: 2,
    missingShaBlocked: true,
    pendingRedactionBlocked: true,
  },
  policyEval: {
    headlinePolicy: 'robustness_curriculum_candidate',
    balancedAccuracy: 1,
    refuseRecall: 1,
    falseAcceptRate: 0,
    falseRefuseRate: 0,
  },
  blockedInputs: [
    'draft evidence',
    'rejected evidence',
    'pending-redaction evidence',
    'approved evidence without SHA',
    'synthetic demo row in real path',
    'counterfactual row in customer-owned path',
  ],
  allowedClaim: 'Positive authorization gate mechanics verified with local fixture.',
  blockedClaim: 'Real customer readiness.',
  claimBoundary:
    'Authorized fixture is a local positive-path test for approval, redaction, SHA provenance, oracle labeling, audit, and policy evaluation. It is not real customer data, does not pass real customer readiness, and is bounded Gym evidence only.',
} as const

export function formatAuthorizedFixturePercent(value: number): string {
  return `${(value * 100).toFixed(value === 0 || value === 1 ? 0 : 1)}%`
}
