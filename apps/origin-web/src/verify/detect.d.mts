// Type surface for detect.mjs — the /verify detection + verification core.
// Hand-written declarations (the runtime is plain .mjs, shared with the Node
// self-test), same discipline as the @origin/verifier-core .d.mts files.

export type ArtifactKind = 'action_run_evidence' | 'sigil' | 'credential' | 'receipt' | 'trace' | 'inclusion' | 'unknown'

export type ReportTone = 'ok' | 'bad' | 'info'

export interface ReportLine {
  tone: ReportTone
  label: string
  text: string
}

/**
 * The stated result of an Action/Run record, shown above the log: reproduced (a 1.1.0 record whose
 * replay matches), outside (the same, past its freshness window or dated in the future; shown
 * greyed), mismatch, unavailable (a battery or oracle this verifier does not ship; no counts), or
 * absent (a 1.0.0 record states none).
 */
export interface ReportResult {
  status: 'reproduced' | 'outside' | 'mismatch' | 'unavailable' | 'absent'
  /** Bold lead-in, when the block has one. */
  label: string | null
  text: string
  /** "Not tested: …" beside a reproduced result; null otherwise. */
  notTested: string | null
}

export interface VerifyReport {
  kind: ArtifactKind
  ok: boolean
  verdict: 'VALID' | 'VOID' | 'UNTRUSTED' | 'UNRECOGNIZED'
  /** The SDK verdict code where the verifier defines one (Sigil 0–4, credential 0/3/4, receipt 0/3, trace 0/2); null otherwise, including a TR-A002 check that fails on an intact chain. */
  code: number | null
  headline: string
  lines: ReportLine[]
  /** Action/Run only: the stated result, once structure, digest and signature pass; null when hidden, including reproduced counts on a record that states itself stale or unknown. */
  result?: ReportResult | null
  /** What this format's verdict means, printed beside VALID and UNTRUSTED only; null otherwise. */
  formatScope?: string | null
  /** The honest offline scope: what this verdict does and does not prove. */
  scope: string
}

export const KIND_LABELS: Record<ArtifactKind, string>

export function detectArtifact(value: unknown): ArtifactKind
export function parseArtifact(text: string): { ok: true; value: unknown } | { ok: false; error: string }
export function verifyArtifact(value: unknown, opts?: { expectedThumbprint?: string; expectedThumbprints?: Record<string, Record<number, string>>; now?: string | number | Date }): Promise<VerifyReport>
export function tamperArtifact(kind: ArtifactKind, artifact: unknown): { value: unknown; note: string }
