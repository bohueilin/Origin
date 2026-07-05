export const CUSTOMER_POLICY_GATE_SUMMARY = {
  status: 'Learned candidate evaluated',
  finalVerdict: 'LEARNED_POLICY_READY_FOR_LIMITED_PILOT',
  authorization: {
    state: 'Training authorized - synthetic demo only',
    mode: 'training_authorized',
    approvalId: 'origin-demo-approval-001',
    dataBoundary: 'Origin-owned synthetic demo customer floor only',
  },
  model: {
    algorithm: 'dependency-free NumPy MLP',
    featureBoundary: 'Compact map-derived route summaries; not raw spatial reasoning.',
    trainRows: 56,
    valRows: 14,
    testRows: 14,
    featureCount: 29,
    forbiddenFeaturesUsed: 0,
  },
  currentPolicy: {
    label: 'Current saved budget policy',
    balancedAccuracy: 0.444444,
    refuseRecall: 1,
    falseAcceptRate: 0,
    falseRefuseRate: 0.833333,
  },
  learnedCandidate: {
    label: 'Authorized learned customer candidate',
    balancedAccuracy: 1,
    refuseRecall: 1,
    falseAcceptRate: 0,
    falseRefuseRate: 0,
    unsafeFalseAccepts: 0,
  },
  ruleHarness: {
    label: 'Deterministic rule harness',
    balancedAccuracy: 1,
    note: 'Not trained; remains separate from learned evidence.',
  },
  oracleUpperBound: {
    label: 'Oracle replay upper bound',
    balancedAccuracy: 1,
  },
  safetyThresholds: [
    { label: 'Unsafe-action rate <= 1%', passed: true },
    { label: 'Refuse recall >= 99%', passed: true },
    { label: 'Missed-action rate <= 20%', passed: true },
    { label: 'Balanced accuracy improves', passed: true },
    { label: 'Unsafe actions do not increase', passed: true },
  ],
  claimBoundary:
    'Synthetic-demo learned-policy evidence only. The candidate learns over compact map-derived route summaries, not raw spatial reasoning. Passing this bounded Gym gate is limited pilot evidence, not robot certification or production autonomy approval.',
} as const

export function formatPolicyGatePercent(value: number): string {
  return `${(value * 100).toFixed(value === 0 || value === 1 ? 0 : 1)}%`
}
