// Redaction backstop. Two jobs:
//  1. redact(value) — scrub anything that looks like a secret before it can reach a log,
//     an audit detail, or the UI.
//  2. assertNoSecret(value) — a hard agent-boundary check used in tests + the broker to
//     guarantee a raw secret never escapes into a summary/handle.
//
// The mock secret value is defined ONCE here as a sentinel so tests can assert it never
// appears anywhere (logs, traces, handles, UI data).

// Sentinel placeholder used only inside the mock vault. It is deliberately NOT shaped like a
// real credential (no `sk-`/JWT pattern) and is self-documenting, so a bundle secret-scan stays
// clean. Its sole purpose is to be a tracer: if this exact string ever appears in a handle,
// summary, audit event, or the UI, a leak test fails. It is never rendered, logged, or returned.
export const MOCK_SECRET_SENTINEL = 'MOCK_VAULT_VALUE__never_returned__never_logged'

const SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{12,}/g, // api-key-ish
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\b/g, // jwt-ish
  /\b(?:[a-z]+\s){11,23}[a-z]+\b/gi, // BIP-39-ish mnemonic run (12-24 words) — best-effort
]

const SECRET_KEY_RE = /(password|passwd|secret|token|api[_-]?key|private[_-]?key|seed|mnemonic|cvv|ssn|credential)/i

/** Recursively redact secret-looking values. Returns a safe-to-render copy. */
export function redact<T>(value: T): T {
  if (typeof value === 'string') return redactString(value) as unknown as T
  if (Array.isArray(value)) return value.map((v) => redact(v)) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : redact(v)
    }
    return out as unknown as T
  }
  return value
}

function redactString(s: string): string {
  if (s.includes(MOCK_SECRET_SENTINEL)) return '[redacted]'
  let out = s
  for (const re of SECRET_PATTERNS) out = out.replace(re, '[redacted]')
  return out
}

// Non-global, prose-safe subset used as the throw-on-leak backstop. (We deliberately omit
// the mnemonic-run pattern here — it can match ordinary prose; redact() handles that case by
// scrubbing, and this assertion only fires on unambiguous credential shapes.)
const STRICT_SECRET_PATTERNS: RegExp[] = [
  /sk-[A-Za-z0-9_-]{12,}/, // api-key-ish
  /\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{24,}\b/, // jwt-ish
]

/**
 * Throw if a raw secret slipped through. A real backstop: fires on the mock tracer AND on any
 * unambiguous credential-shaped value. Intended to run AFTER redact(), so it never fires on
 * legitimate data — only when redaction was skipped or a new leak path appears.
 */
export function assertNoSecret(value: unknown, where: string): void {
  const json = JSON.stringify(value ?? null)
  if (json.includes(MOCK_SECRET_SENTINEL)) {
    throw new Error(`Secret leak detected at ${where}`)
  }
  for (const re of STRICT_SECRET_PATTERNS) {
    if (re.test(json)) throw new Error(`Secret-shaped value detected at ${where}`)
  }
}
