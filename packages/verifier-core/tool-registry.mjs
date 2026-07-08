// Origin Training Evidence — tool registry + deterministic rate limiting (P3)
// =============================================================================
// A scoped, rate-limited tool registry. A tool call is authorized BEFORE it runs
// (fail-closed, the passport ToolRouter pattern): a scope check against the grant,
// then a DETERMINISTIC step-indexed token bucket (never wall-clock, so verdicts
// reproduce in vitest). The registry entries are pinned into the EnvironmentBundle
// as bundle.tools[] (schema_digest from P1 + scope/rate_limit here); registry_digest
// (the authz projection) folds into env_bundle_digest.
//
// Verdicts: 'allow' · 'deny_scope' · 'deny_rate' · 'unknown_tool'. Only an allowed
// call produces an action.applied event, so a denial can never widen the score-
// authoritative action trace (Goodhart guard).
// =============================================================================

export { registryDigest } from '@origin/evidence/env-manifest'

// A deterministic token bucket. tokens refill by refill_per_step per elapsed step
// (capped at capacity); each authorized call consumes one. `step` is a call index,
// not wall-clock — the same call sequence always yields the same verdicts.
export function makeBucket(capacity, refillPerStep) {
  let tokens = capacity
  let lastStep = 0
  return {
    tryConsume(step) {
      tokens = Math.min(capacity, tokens + refillPerStep * Math.max(0, step - lastStep))
      lastStep = step
      if (tokens >= 1) {
        tokens -= 1
        return true
      }
      return false
    },
    peek() {
      return tokens
    },
  }
}

// tools: [{ name, scope, rate_limit: { capacity, refill_per_step }, version?, schema_digest? }]
export function buildRegistry(tools) {
  const byName = new Map()
  for (const t of tools) {
    byName.set(t.name, { tool: t, bucket: makeBucket(t.rate_limit.capacity, t.rate_limit.refill_per_step) })
  }
  return {
    tools,
    has: (name) => byName.has(name),
    get: (name) => byName.get(name)?.tool,
    // authorize a single call at call-index `step`. Fail-closed + deterministic.
    authorize(name, grant, step) {
      const entry = byName.get(name)
      if (!entry) return { verdict: 'unknown_tool', allow: false, scope: null }
      if (!grant.tool_scopes.includes(entry.tool.scope)) return { verdict: 'deny_scope', allow: false, scope: entry.tool.scope }
      if (!entry.bucket.tryConsume(step)) return { verdict: 'deny_rate', allow: false, scope: entry.tool.scope }
      return { verdict: 'allow', allow: true, scope: entry.tool.scope }
    },
  }
}
