// Cloudflare Pages Function — GET /api/evidence/status
//
// The /app console makes a best-effort call for server-side evidence status.
// On the public deploy there is no evidence backend, so authenticated service callers
// receive a truthful 200 { ok: false }. The former in-app client (src/serverEpisodeClient.ts, removed as unreachable)
// treats a non-ok payload as "no data" (returns null) — exactly as it did on a
// 404 — but this clears the 404 error from the /app console.
import { authorizeService } from '../../../server/requestAuth.ts'

interface EvidenceStatusEnv {
  SERVICE_AUTH_TOKEN?: string
}

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

const unauthorized = (): Response => {
  const response = json({ ok: false, error: 'unauthorized' }, 401)
  response.headers.set('WWW-Authenticate', 'Bearer')
  return response
}

const respond = (ctx: { request: Request; env: EvidenceStatusEnv }): Response => {
  const decision = authorizeService(ctx.request.headers, ctx.env.SERVICE_AUTH_TOKEN)
  if (decision === 'not_configured') return json({ ok: false, error: 'auth_not_configured' }, 503)
  if (decision === 'unauthorized') return unauthorized()
  return json({ ok: false, status: 'unavailable' })
}

export const onRequestGet = (ctx: { request: Request; env: EvidenceStatusEnv }): Response =>
  respond(ctx)

export const onRequestHead = (ctx: { request: Request; env: EvidenceStatusEnv }): Response => {
  const response = respond(ctx)
  return new Response(null, { status: response.status, headers: response.headers })
}
