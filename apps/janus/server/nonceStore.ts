// ----------------------------------------------------------------------------
// Durable one-shot purchase-nonce ledger (InsForge) — the production-grade backing
// for the Snaplii one-shot replay protection.
//
// snapliiHandler keeps an in-process Set as the fast path (catches same-instance
// concurrency with zero latency). This module adds the DURABLE source of truth: a
// UNIQUE index on `nonce` (migration 20260627000000) means the FIRST insert wins and a
// duplicate returns a unique violation → 'replayed'. So one-shot protection survives a
// server restart and holds across multiple instances.
//
// Fail-safe: if InsForge is unconfigured, unreachable, or the table is missing, every
// call returns 'unavailable' and the caller falls back to the in-process check (today's
// behavior) — durability degrades, it never blocks a legitimate purchase. Never throws,
// never logs the key. Mirrors insforgeStore's conflict-aware insert.
// ----------------------------------------------------------------------------

import type { InsforgeConfig } from './config.ts'

const TABLE = 'passport_purchase_nonces' // live InsForge table (migration 20260627000000) — external binding; renaming requires a new migration, NOT a code edit

export type NonceConsumeOutcome =
  | { status: 'consumed' } // first use — inserted now
  | { status: 'replayed' } // the unique index rejected it — already consumed (durable, cross-restart)
  | { status: 'unavailable' } // not configured / unreachable / table missing — caller falls back

function configured(cfg: InsforgeConfig): boolean {
  return Boolean(cfg.baseUrl && cfg.apiKey)
}

/** A non-2xx response that signals a unique-constraint conflict (mirrors insforgeStore). */
function isUniqueConflict(status: number, bodyText: string): boolean {
  if (status === 409) return true
  const t = bodyText.toLowerCase()
  return t.includes('23505') || t.includes('duplicate key') || t.includes('unique constraint') || t.includes('already exists')
}

/**
 * Atomically record (consume) a purchase nonce. First insert → 'consumed'; a duplicate that the
 * unique index rejects → 'replayed'. id / created_at are InsForge-managed, so we never send them.
 */
export async function consumeNonceDurable(
  nonce: string,
  amountCents: number,
  live: boolean,
  cfg: InsforgeConfig,
): Promise<NonceConsumeOutcome> {
  if (!configured(cfg)) return { status: 'unavailable' }
  const base = cfg.baseUrl!.replace(/\/+$/, '')
  const url = `${base}/api/database/records/${TABLE}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 8000)
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify([{ nonce, amount_cents: amountCents, live }]), // array body, as the data API requires
      signal: controller.signal,
    })
    if (resp.ok) return { status: 'consumed' }
    let bodyText = ''
    try {
      bodyText = await resp.text()
    } catch {
      // ignore — treat as no conflict markers.
    }
    if (isUniqueConflict(resp.status, bodyText)) return { status: 'replayed' }
    console.error(`[nonce] insert ${resp.status}`)
    return { status: 'unavailable' }
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.error('[nonce] insert failed:', aborted ? 'timeout' : 'unreachable')
    return { status: 'unavailable' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Release a nonce on a DEFINITE no-charge outcome, so the same approval can be retried. Best-effort:
 * a stuck row only blocks a retry of the SAME approval token, never a fresh approval (which mints a
 * new nonce). Never throws.
 */
export async function releaseNonceDurable(nonce: string, cfg: InsforgeConfig): Promise<void> {
  if (!configured(cfg)) return
  const base = cfg.baseUrl!.replace(/\/+$/, '')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), cfg.timeoutMs ?? 8000)
  try {
    await fetch(`${base}/api/database/records/${TABLE}?nonce=eq.${encodeURIComponent(nonce)}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${cfg.apiKey}` },
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = (err as { name?: string } | undefined)?.name === 'AbortError'
    console.warn('[nonce] release failed:', aborted ? 'timeout' : 'unreachable')
  } finally {
    clearTimeout(timer)
  }
}
