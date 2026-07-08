// Type surface for mcp-adapter.mjs — the thin, in-process MCP-shaped surface over
// the tool registry (P3). Transport is stubbed; the authorize-before-run CONTRACT is real.
// Hand-written declarations; keep in lockstep with mcp-adapter.mjs.

import type { ToolRegistry, ToolGrant, AuthzVerdictKind, RateLimit } from './tool-registry.mjs'

export interface McpToolInfo {
  name: string
  scope: string
  rate_limit: RateLimit
  version: string
  schema_digest: string | null
}

export interface McpCallResult {
  tool: string
  args: Record<string, unknown>
  step: number
  verdict: AuthzVerdictKind
  allow: boolean
  scope: string | null
}

export interface McpAdapter {
  /** MCP tools/list — the tool surface the policy may call. */
  listTools(): McpToolInfo[]
  /** MCP tools/call — authorize (fail-closed) then report the verdict; `step` drives the bucket. */
  callTool(name: string, args: Record<string, unknown> | null | undefined, opts: { step: number }): McpCallResult
}

export function createMcpAdapter(registry: ToolRegistry, grant: ToolGrant): McpAdapter
