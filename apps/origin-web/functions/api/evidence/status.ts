// Explicit tombstone for a retired stub. No client consumes this route and the
// public Pages deployment has no server-side evidence-status service.
const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' }
export const onRequestGet = (): Response => new Response(JSON.stringify({
  ok: false, status: 'retired', error: 'evidence_status_retired',
}), { status: 410, headers })
export const onRequestHead = (): Response => new Response(null, { status: 410, headers })
