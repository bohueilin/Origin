// Cloudflare Pages Function — GET /api/evidence/status
//
// The /app console makes a best-effort call for server-side evidence status.
// On the public deploy there is no evidence backend, so return a benign 200
// { ok: false }. The client (src/serverEpisodeClient.ts:fetchEvidenceStatus)
// treats a non-ok payload as "no data" (returns null) — exactly as it did on a
// 404 — but this clears the 404 error from the /app console.
export const onRequestGet = (): Response =>
  new Response(JSON.stringify({ ok: false, status: 'unavailable' }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
