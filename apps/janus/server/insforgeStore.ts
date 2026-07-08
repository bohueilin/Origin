// ----------------------------------------------------------------------------
// PROTOTYPE InsForge evidence store for the hackathon — NOT production-hardened.
//
// Runs ONLY in the Node process (the standalone Hono server, server/main.ts).
// The InsForge service key
// (INSFORGE_API_KEY, an `ins_...` admin key) lives here and is never sent to the
// browser. InsForge is EVIDENCE STORAGE ONLY — it never computes or overrides the
// deterministic verifier. Persistence is best-effort: this module never throws,
// and the app works fully when InsForge is unconfigured.
//
// Insert API (per docs): POST {BASE}/api/database/records/{table}
//   headers: Authorization: Bearer <key>, Content-Type: application/json,
//            Prefer: return=representation
//   body: an ARRAY of row objects; response: array of created rows incl. `id`.
// ----------------------------------------------------------------------------

export interface InsforgeConfig {
  baseUrl?: string
  apiKey?: string
  timeoutMs?: number
}

export type PersistOutcome =
  | { status: 'saved'; recordId: string | null }
  | { status: 'local_only' } // InsForge not configured
  | { status: 'unavailable'; code: string }

// Conflict-aware persistence outcome. `existing` means the unique index rejected
// this insert because an authoritative row for the same trace_id already exists;
// the existing row was re-read and is returned so the caller can replay it
// (first-write-wins) instead of letting the later action win.
export type PersistOnceOutcome =
  | { status: 'saved'; recordId: string | null }
  | { status: 'existing'; recordId: string | null; row: Record<string, unknown> }
  | { status: 'local_only' } // InsForge not configured
  | { status: 'unavailable'; code: string }

export type ReadOutcome =
  | { status: 'ok'; rows: Record<string, unknown>[] }
  | { status: 'local_only' } // InsForge not configured
  | { status: 'unavailable' } // network / timeout / non-2xx
  | { status: 'error' } // parse failure

/** The single audit table this milestone writes to. */
export const INSFORGE_TABLE = 'eval_episodes'

export function insforgeConfigured(cfg: InsforgeConfig): boolean {
  return Boolean(cfg.baseUrl && cfg.apiKey)
}

/** Persist one episode audit row. Never throws; returns a typed outcome. */
export async function persistEpisode(
  row: Record<string, unknown>,
  cfg: InsforgeConfig,
): Promise<PersistOutcome> {
  if (!insforgeConfigured(cfg)) {
    return { status: 'local_only' }
  }

  const base = cfg.baseUrl!.replace(/\/+$/, '')
  const url = `${base}/api/database/records/${INSFORGE_TABLE}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 8000)

  // InsForge reserves id / created_at / updated_at (it auto-manages them) and
  // rejects inserts that include them. Our digest already EXCLUDES created_at, so
  // dropping it here is safe; read-back uses InsForge's own created_at timestamp.
  const insertRow: Record<string, unknown> = { ...row }
  delete insertRow.id
  delete insertRow.created_at
  delete insertRow.updated_at

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
        prefer: 'return=representation',
      },
      body: JSON.stringify([insertRow]), // body must be an array, even for one record
      signal: controller.signal,
    })

    if (!resp.ok) {
      // Never surface upstream bodies or the key — log server-side only.
      console.error(`[insforge] insert ${resp.status} ${resp.statusText}`)
      return { status: 'unavailable', code: `http_${resp.status}` }
    }

    let recordId: string | null = null
    try {
      const data = (await resp.json()) as unknown
      if (Array.isArray(data)) {
        recordId = (data[0] as { id?: string } | undefined)?.id ?? null
      } else if (data && typeof data === 'object') {
        recordId = (data as { id?: string }).id ?? null
      }
    } catch {
      // saved, but response wasn't parseable — leave recordId null.
    }
    return { status: 'saved', recordId }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.error('[insforge] insert failed:', aborted ? 'timeout' : err)
    return { status: 'unavailable', code: aborted ? 'timeout' : 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * True when a non-2xx insert response indicates a unique-constraint conflict.
 * HTTP 409 is the canonical signal; some InsForge/Postgres stacks instead surface
 * the unique violation as a 4xx carrying SQLSTATE 23505 or a "duplicate key" /
 * "unique constraint" message. We only inspect the body for those conflict
 * markers — we never log it, and a DB error body never contains our API key.
 */
function isUniqueConflict(status: number, bodyText: string): boolean {
  if (status === 409) return true
  const t = bodyText.toLowerCase()
  return (
    t.includes('23505') ||
    t.includes('duplicate key') ||
    t.includes('unique constraint') ||
    t.includes('already exists')
  )
}

/**
 * Conflict-aware persist for gym episode idempotency. Inserts the row (array body,
 * as the data API requires). On a unique conflict — the storage boundary added in
 * migration 20260620080000 — it re-reads the existing authoritative row by
 * trace_id and returns it as `existing`, so the caller can replay the first
 * verdict instead of letting a later action win. Non-conflict failures stay
 * `unavailable`. Never throws, never surfaces the key.
 */
export async function persistEpisodeOnce(
  row: Record<string, unknown>,
  cfg: InsforgeConfig,
): Promise<PersistOnceOutcome> {
  if (!insforgeConfigured(cfg)) {
    return { status: 'local_only' }
  }

  const base = cfg.baseUrl!.replace(/\/+$/, '')
  const url = `${base}/api/database/records/${INSFORGE_TABLE}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 8000)

  // Same insert hygiene as persistEpisode: InsForge auto-manages id/created_at/
  // updated_at and rejects inserts that include them. created_at is excluded from
  // the digest, so dropping it here is safe.
  const insertRow: Record<string, unknown> = { ...row }
  delete insertRow.id
  delete insertRow.created_at
  delete insertRow.updated_at

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
        prefer: 'return=representation',
      },
      body: JSON.stringify([insertRow]), // body must be an array, even for one record
      signal: controller.signal,
    })

    if (resp.ok) {
      let recordId: string | null = null
      try {
        const data = (await resp.json()) as unknown
        if (Array.isArray(data)) {
          recordId = (data[0] as { id?: string } | undefined)?.id ?? null
        } else if (data && typeof data === 'object') {
          recordId = (data as { id?: string }).id ?? null
        }
      } catch {
        // saved, but response wasn't parseable — leave recordId null.
      }
      return { status: 'saved', recordId }
    }

    // Non-2xx: read the body (text, never logged) only to classify a conflict.
    let bodyText = ''
    try {
      bodyText = await resp.text()
    } catch {
      // ignore — treat as no conflict markers.
    }
    if (isUniqueConflict(resp.status, bodyText)) {
      // The unique index won the race: an authoritative row for this trace_id
      // already exists. Re-read it so the caller replays the first verdict.
      const traceId = typeof row.trace_id === 'string' ? row.trace_id : ''
      const read = traceId
        ? await fetchEvidenceByTraceId(cfg, traceId)
        : ({ status: 'unavailable' } as ReadOutcome)
      if (read.status === 'ok' && read.rows.length > 0) {
        const existing = read.rows[0]
        const recordId = existing.id != null ? String(existing.id) : null
        return { status: 'existing', recordId, row: existing }
      }
      // Conflict confirmed but the re-read failed — stay best-effort.
      console.error('[insforge] insert conflict; existing-row re-read failed')
      return { status: 'unavailable', code: 'conflict_reread_failed' }
    }

    console.error(`[insforge] insert ${resp.status} ${resp.statusText}`)
    return { status: 'unavailable', code: `http_${resp.status}` }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.error('[insforge] insert failed:', aborted ? 'timeout' : err)
    return { status: 'unavailable', code: aborted ? 'timeout' : 'unreachable' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Look up a single authoritative evidence row by trace_id. Best-effort and
 * read-only, same guarantees as fetchRecentEvidence (never throws, never surfaces
 * the key / raw errors / base URL). Used to rehydrate the winning row after a
 * unique-conflict insert.
 */
export async function fetchEvidenceByTraceId(
  cfg: InsforgeConfig,
  traceId: string,
): Promise<ReadOutcome> {
  if (!insforgeConfigured(cfg)) {
    return { status: 'local_only' }
  }

  const base = cfg.baseUrl!.replace(/\/+$/, '')
  const url =
    `${base}/api/database/records/${INSFORGE_TABLE}` +
    `?trace_authority=eq.server_authoritative_episode` +
    `&trace_id=eq.${encodeURIComponent(traceId)}&limit=1`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 8000)

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
    })
    if (!resp.ok) {
      console.error(`[insforge] trace lookup ${resp.status} ${resp.statusText}`)
      return { status: 'unavailable' }
    }
    const data = (await resp.json()) as unknown
    if (!Array.isArray(data)) {
      console.error('[insforge] trace lookup: unexpected response shape')
      return { status: 'error' }
    }
    return { status: 'ok', rows: data as Record<string, unknown>[] }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.error('[insforge] trace lookup failed:', aborted ? 'timeout' : err)
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Read back the newest server-authoritative evidence rows. Best-effort: never
 * throws, never surfaces the key / raw errors / base URL. Filters server-side to
 * trace_authority === 'server_authoritative_episode', newest first.
 */
export async function fetchRecentEvidence(
  cfg: InsforgeConfig,
  limit = 50,
  runId?: string,
): Promise<ReadOutcome> {
  if (!insforgeConfigured(cfg)) {
    return { status: 'local_only' }
  }

  const base = cfg.baseUrl!.replace(/\/+$/, '')
  let query =
    `?trace_authority=eq.server_authoritative_episode` +
    `&order=created_at.desc&limit=${Math.max(1, Math.min(1000, limit))}`
  if (runId) query += `&run_id=eq.${encodeURIComponent(runId)}`
  const url = `${base}/api/database/records/${INSFORGE_TABLE}${query}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 8000)

  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
    })
    if (!resp.ok) {
      console.error(`[insforge] read ${resp.status} ${resp.statusText}`)
      return { status: 'unavailable' }
    }
    const data = (await resp.json()) as unknown
    if (!Array.isArray(data)) {
      console.error('[insforge] read: unexpected response shape')
      return { status: 'error' }
    }
    return { status: 'ok', rows: data as Record<string, unknown>[] }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.error('[insforge] read failed:', aborted ? 'timeout' : err)
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}
