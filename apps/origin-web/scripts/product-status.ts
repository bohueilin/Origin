// One source for the Trust cards and both build-rendered posture diagrams.
export const PRODUCT_POSTURE = [
  { status: 'Available now', title: 'Browser-local evaluation', description: 'Run synthetic support or IAM tasks through deterministic policy logic. Bind the configuration, inspect the verdict, and download the evidence.', steps: ['Selected policy', 'Deterministic oracle'] },
  { status: 'Available now', title: 'Explicit artifact provenance', description: 'The public reference-check artifact is browser-session-signed and unpinned. Execution was not attempted. A valid signature does not establish trusted Origin issuance.', steps: ['Session-signed evidence', 'Offline re-verification'] },
  { status: 'Proposed architecture', title: 'Controlled execution', description: 'Permission checks, a controlled proxy, named approvals, and runtime enforcement are a proposed integration path. They are not evidence of a customer deployment.', steps: ['Runtime gate', 'Controlled tool-call proxy', 'Named approvals', 'Kill switch'] },
] as const
