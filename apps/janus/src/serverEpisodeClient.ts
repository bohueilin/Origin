import type { EvidenceStatus, RecentRun, ServerEpisodeResponse } from './types'

// ----------------------------------------------------------------------------
// Frontend client for the server-owned episode path.
//
// The client sends ONLY { scenarioId, policyMode } and renders whatever the
// server returns. It never sends — and the server never trusts — hidden risk,
// the correct/ideal action, verifier result, reward, license level, or the
// catastrophic flag. Those are computed server-side and are authoritative.
// ----------------------------------------------------------------------------

export async function runServerEpisode(
  scenarioId: string,
  policyMode: 'mock' | 'nebius',
): Promise<ServerEpisodeResponse> {
  const resp = await fetch('/api/run-episode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenarioId, policyMode }),
  })

  type ServerOk = ServerEpisodeResponse & { ok: true }
  type ServerErr = { ok: false; error?: string }
  let data: ServerOk | ServerErr | null = null
  try {
    data = (await resp.json()) as ServerOk | ServerErr
  } catch {
    // Non-JSON / missing endpoint — treated as failure below.
  }

  if (!data || data.ok !== true) {
    throw new Error(data && 'error' in data && data.error ? data.error : 'Server episode unavailable')
  }
  return { trace: data.trace, license: data.license, persistence: data.persistence, runId: data.runId }
}

/** Best-effort fetch of recent server-owned episodes. Returns [] on any failure. */
export async function fetchRecentRuns(): Promise<RecentRun[]> {
  try {
    const resp = await fetch('/api/runs/recent')
    const data = (await resp.json()) as { ok?: boolean; runs?: RecentRun[] }
    return data?.ok && Array.isArray(data.runs) ? data.runs : []
  } catch {
    return []
  }
}

/**
 * Best-effort fetch of the compact server evidence status. Used on mount so a
 * reload shows backend proof (run id, episode count, latest ids) rather than
 * only local React state. Returns null if the endpoint is unreachable.
 */
export async function fetchEvidenceStatus(): Promise<EvidenceStatus | null> {
  try {
    const resp = await fetch('/api/evidence/status')
    const data = (await resp.json()) as ({ ok?: boolean } & EvidenceStatus) | null
    return data?.ok ? data : null
  } catch {
    return null
  }
}
