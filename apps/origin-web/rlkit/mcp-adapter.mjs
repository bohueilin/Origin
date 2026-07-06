// Origin Training Evidence — MCP-shaped adapter (P3)
// =============================================================================
// A thin, in-process MCP-shaped surface over the tool registry: listTools() and
// callTool(). The TRANSPORT is stubbed (no live MCP server — that's P1); the
// CONTRACT is real. Each callTool authorizes BEFORE running and returns a verdict
// the caller records as tool.call / tool.result trace events.
// =============================================================================

export function createMcpAdapter(registry, grant) {
  return {
    // MCP tools/list — the tool surface the policy may call.
    listTools() {
      return registry.tools.map((t) => ({
        name: t.name,
        scope: t.scope,
        rate_limit: t.rate_limit,
        version: t.version ?? '1.0.0',
        schema_digest: t.schema_digest ?? null,
      }))
    },
    // MCP tools/call — authorize (fail-closed) then report the verdict. `step` is the
    // deterministic call index driving the rate-limit bucket.
    callTool(name, args, { step }) {
      const v = registry.authorize(name, grant, step)
      return { tool: name, args: args ?? {}, step, verdict: v.verdict, allow: v.allow, scope: v.scope }
    },
  }
}
