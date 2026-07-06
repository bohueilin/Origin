// Origin Training Evidence — warehouse tool authorization (P3)
// =============================================================================
// The scope + rate-limit policy for the 8 real warehouse tools, plus the grant the
// trainer's policy runs under, plus one OUT-OF-SCOPE fake tool used only to prove
// scope denial (never part of the committed env bundle — the warehouse env does not
// actually expose exfiltrate).
// =============================================================================

// Scope map: sense (look), actuate (move the world), terminal (declare done).
const SCOPE = {
  observe: 'warehouse.sense',
  scan: 'warehouse.sense',
  move: 'warehouse.actuate',
  pick: 'warehouse.actuate',
  drop: 'warehouse.actuate',
  finish: 'warehouse.terminal',
  escalate: 'warehouse.terminal',
  refuse: 'warehouse.terminal',
}

// Deterministic rate limits. `scan` is intentionally single-shot (you scan the grid
// once) so a second scan is a clean deny_rate demonstration.
const RATE = {
  observe: { capacity: 2, refill_per_step: 1 },
  scan: { capacity: 1, refill_per_step: 0 },
  move: { capacity: 24, refill_per_step: 2 },
  pick: { capacity: 2, refill_per_step: 0 },
  drop: { capacity: 2, refill_per_step: 0 },
  finish: { capacity: 1, refill_per_step: 0 },
  escalate: { capacity: 1, refill_per_step: 0 },
  refuse: { capacity: 1, refill_per_step: 0 },
}

export function warehouseToolAuthz(name) {
  return { scope: SCOPE[name], rate_limit: RATE[name] }
}

// The grant the policy runs under: all three warehouse scopes, NOT exfiltrate.
export const WAREHOUSE_GRANT = { tool_scopes: ['warehouse.sense', 'warehouse.actuate', 'warehouse.terminal'] }

// An out-of-scope fake tool — for scope-deny tests ONLY (never committed to a bundle).
export const EXFILTRATE_TOOL = {
  name: 'exfiltrate',
  scope: 'warehouse.exfiltrate',
  rate_limit: { capacity: 1, refill_per_step: 0 },
  version: '0.0.0',
  schema_digest: '0'.repeat(64),
}

// Map a concrete action to its MCP tool call (move:east → tool 'move', {direction:'east'}).
export function actionToCall(action) {
  return action.startsWith('move:') ? { tool: 'move', args: { direction: action.slice(5) } } : { tool: action, args: {} }
}
