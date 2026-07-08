// Type surface for warehouse-tools.mjs — the scope + rate-limit policy for the 8
// real warehouse tools, the trainer's grant, and the out-of-scope EXFILTRATE_TOOL
// (scope-deny tests only — never committed to a bundle).
// Hand-written declarations; keep in lockstep with warehouse-tools.mjs.

import type { RateLimit, ToolGrant } from '@origin/verifier-core/tool-registry'

/** Known warehouse tool names return their pinned authz; unknown names yield undefined fields. */
export function warehouseToolAuthz(name: string): { scope: string | undefined; rate_limit: RateLimit | undefined }

export const WAREHOUSE_GRANT: ToolGrant

export const EXFILTRATE_TOOL: {
  name: string
  scope: string
  rate_limit: RateLimit
  version: string
  schema_digest: string
}

/** Map a concrete action to its MCP tool call (move:east → tool 'move', {direction:'east'}). */
export function actionToCall(action: string): { tool: string; args: Record<string, string> }
