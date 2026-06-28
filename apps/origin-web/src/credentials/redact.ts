// Secret redaction. Audit logs and agent-facing payloads must never contain secrets.
// Two layers: (1) redact by key name, (2) a hard assertion that a known secret value
// does not appear anywhere in a payload (the agent-boundary backstop — fail closed).

const SECRET_KEY = /(pass(word|wd)?|secret|token|api[_-]?key|priv(ate)?[_-]?key|seed|mnemonic|cookie|authorization|auth_?token|refresh|credential|bearer)/i

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8 || value == null) return value
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY.test(k) ? '[redacted]' : redact(v, depth + 1)
    }
    return out
  }
  return value
}

/** Throw if any known secret value appears in `payload`. Used to gate anything that
 *  crosses the agent boundary, so a provider bug can never leak a credential. */
export function assertNoSecret(payload: unknown, secrets: Array<string | null | undefined>): void {
  const haystack = JSON.stringify(payload ?? null)
  for (const secret of secrets) {
    if (secret && secret.length >= 4 && haystack.includes(secret)) {
      throw new Error('credential-broker: secret leak blocked at the agent boundary')
    }
  }
}
