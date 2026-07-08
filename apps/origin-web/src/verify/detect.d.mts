// Type surface for detect.mjs — the /verify detection + verification core.
// Hand-written declarations (the runtime is plain .mjs, shared with the Node
// self-test), same discipline as the @origin/verifier-core .d.mts files.

export type ArtifactKind = 'sigil' | 'credential' | 'receipt' | 'trace' | 'inclusion' | 'unknown'

export type ReportTone = 'ok' | 'bad' | 'info'

export interface ReportLine {
  tone: ReportTone
  label: string
  text: string
}

export interface VerifyReport {
  kind: ArtifactKind
  ok: boolean
  verdict: 'VALID' | 'VOID' | 'UNRECOGNIZED'
  /** The SDK verdict code where the verifier defines one (Sigil 0–4, credential 0/3/4, receipt 0/3, trace 0/2); null otherwise. */
  code: number | null
  headline: string
  lines: ReportLine[]
  /** The honest offline scope: what this verdict does and does not prove. */
  scope: string
}

export const KIND_LABELS: Record<ArtifactKind, string>

export function detectArtifact(value: unknown): ArtifactKind
export function parseArtifact(text: string): { ok: true; value: unknown } | { ok: false; error: string }
export function verifyArtifact(value: unknown, opts?: { expectedThumbprint?: string }): Promise<VerifyReport>
export function tamperArtifact(kind: ArtifactKind, artifact: unknown): { value: unknown; note: string }
