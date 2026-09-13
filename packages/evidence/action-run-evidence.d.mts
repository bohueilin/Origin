export const ACTION_RUN_SCHEMA_VERSION: '1.0.0'
export const EXECUTION_MODES: readonly ['simulated', 'authorized_fixture', 'sandbox', 'customer_replay', 'shadow', 'live']
export const OUTCOME_STATUSES: readonly ['not_attempted', 'simulated', 'claimed', 'provider_confirmed', 'independently_verified', 'failed', 'unknown']

export interface ActionRunValidationVerdict {
  ok: boolean
  failures: string[]
  dimensions: {
    structure: boolean
    semantics: boolean
    integrity: boolean
    authorization_valid: boolean
    provider_bound: boolean
    completeness: boolean
    freshness: boolean
  }
}

export interface ActionRunEvidence {
  schema_version: '1.0.0'
  evidence_id: string
  issued_at: string
  execution_mode: (typeof EXECUTION_MODES)[number]
  identity: { principal_id: string; tenant_id: string | null; workload_id: string; on_behalf_of: string | null }
  subject: {
    run_id: string; action_id: string; model_digest: string; tools_digest: string; policy_digest: string
    environment_digest: string; evaluator_version: string; verifier_version: string; adapter_version: string | null
  }
  proposal: { action_type: string; proposed_effect: Record<string, unknown>; input_digest: string }
  authorization: {
    verdict: 'allow' | 'deny' | 'approval_required'; reason_codes: string[]; approval_id: string | null
    approved_by: string | null; nonce_digest: string | null; expires_at: string | null
  }
  outcome_attestation: {
    status: (typeof OUTCOME_STATUSES)[number]; attester: 'none' | 'origin' | 'provider' | 'independent_verifier'
    attested_at: string | null; statement_digest: string | null
  }
  provider_evidence: { provider: string | null; receipt_digest: string | null; readback_digest: string | null; readback_at: string | null }
  completeness: {
    coverage: 'complete' | 'partial' | 'unknown'; expected_count: number | null; observed_count: number; covered_ids_digest: string | null
    omissions: Array<{ id_digest: string; reason: string }>; duplicates: Array<{ id_digest: string; count: number }>
    freshness: { status: 'fresh' | 'stale' | 'unknown'; observed_at: string | null; max_age_ms: number | null }
  }
  source: { trace_id: string | null; audit_row_digest: string | null; oracle_verdict_digest: string | null }
  evidence_digest: string
  signature: { key_id: string; key_epoch: number; sigil: unknown } | null
}

export function actionRunEvidenceDigest(value: Record<string, unknown>): string
export function validateActionRunEvidence(value: unknown, options?: { now?: string | number | Date }): ActionRunValidationVerdict
export function buildActionRunEvidence(input: Omit<ActionRunEvidence, 'schema_version' | 'evidence_digest' | 'signature'>): ActionRunEvidence
