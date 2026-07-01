export const REAL_CUSTOMER_EVIDENCE_GATE_SUMMARY = {
  title: 'Design partner hard-case intake',
  status: 'Not authorized',
  gateStatus: 'BLOCKED_NO_REAL_CUSTOMER_AUTHORIZATION',
  verdict: 'REAL_CUSTOMER_HARDCASE_NOT_AVAILABLE',
  lane: 'CUSTOMER_OWNED',
  dataBoundary: 'real_customer_site',
  requiredInputs: [
    'approved floor plan or site map',
    'restricted-zone examples',
    'human-only examples',
    'hazard examples',
    'blocked-route examples',
    'ambiguous-goal examples',
    'safe-near-restricted controls',
    'missing-evidence examples',
    'operator notes',
    'optional photo/video/keyframe evidence',
    'explicit approval for evaluation',
    'separate approval for training',
  ],
  states: [
    { label: 'Not authorized', status: 'blocked', detail: 'No real customer holdout can compile.' },
    { label: 'Evidence pending review', status: 'blocked', detail: 'Draft evidence remains outside the holdout.' },
    { label: 'Redaction required', status: 'blocked', detail: 'Sensitive evidence must be redacted before export/eval.' },
    { label: 'Approved for evaluation', status: 'ready', detail: 'Oracle labeling and policy eval may run locally.' },
    { label: 'Approved for training', status: 'ready', detail: 'Training requires separate explicit authorization.' },
    { label: 'Blocked from CUSTOMER_OWNED holdout', status: 'blocked', detail: 'Synthetic or counterfactual rows cannot be rebranded.' },
    { label: 'Ready for oracle labeling', status: 'ready', detail: 'Only approved real customer evidence reaches the oracle.' },
  ],
  defaultGate: {
    rowsCompiled: 0,
    realCustomerReadinessPassed: false,
    trainingAllowed: false,
    externalApiAllowed: false,
    allowedClaim: 'Synthetic-demo workflow and generated-counterfactual evidence only.',
    blockedClaim: 'Real customer readiness.',
  },
  claimBoundary:
    'Synthetic demo hard cases prove the workflow. Real customer readiness requires approved customer-owned evidence, redaction where needed, and explicit authorization before any evaluation or training.',
} as const

export function realCustomerGateStateClass(status: 'blocked' | 'ready'): 'fail' | 'pass' {
  return status === 'ready' ? 'pass' : 'fail'
}
