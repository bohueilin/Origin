import type { AgentDecision, ModelPolicyView } from './types'

// ----------------------------------------------------------------------------
// Frontend client for the server-side Nebius boundary.
//
// The browser never sees the API key — it only POSTs the agent's visible view to
// /api/nebius-action and receives a normalized decision back. On any failure
// (no key, timeout, upstream error, missing endpoint) this throws, and the
// caller falls back to the local mock policy.
// ----------------------------------------------------------------------------

interface ServerOk {
  ok: true
  decision: {
    action: AgentDecision['action']
    rationale: string
    requestedInfo: string
    confidence: number
  }
  model: string
}
interface ServerErr {
  ok: false
  code: string
  error: string
}

export async function fetchNebiusAction(view: ModelPolicyView): Promise<AgentDecision> {
  const resp = await fetch('/api/nebius-action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ view }),
  })

  // The endpoint may be absent (e.g. static preview) or return an error payload.
  let data: ServerOk | ServerErr | null = null
  try {
    data = (await resp.json()) as ServerOk | ServerErr
  } catch {
    // Non-JSON / missing endpoint — leave data null; treated as unavailable below.
  }

  if (!data || data.ok !== true) {
    throw new Error(data && 'error' in data ? data.error : 'Nebius unavailable')
  }

  return {
    action: data.decision.action,
    confidence: data.decision.confidence,
    rationale: data.decision.rationale,
    requestedInfo: data.decision.requestedInfo,
    source: 'nebius',
    model: data.model,
  }
}
