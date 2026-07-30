// Cloudflare Pages Function — POST /api/foundry/parse-floor
//
// The deployed twin of the Hono route in server/app.ts. foundry.html shipped on
// Pages, but /api/foundry/* had no Function behind it, so the Perceiver was dark
// on the live site (same root cause as the /api/lead outage). This adapter is
// deliberately thin: size-guard the body, build a CerebrasConfig from the Pages
// env, and hand off to the SAME handleParseFloor the local server uses — one
// parse path (gate included), two runtimes.
//
// Env (Pages project → Settings → Environment variables):
//   CEREBRAS_API_KEY    required for real parses; absent → the handler refuses
//                       uploads honestly (fallback 'no_key') and demo mode still works.
//   CEREBRAS_MODEL      optional override (default gemma-4-31b).
//   CEREBRAS_BASE_URL   optional override.
//
// NOTE for the deploy workflow: this file imports ../../../server + ../../../src,
// so the staging step must copy those trees next to functions/ in the deploy CWD
// (wrangler bundles relative imports; only files under functions/ become routes).

import { handleParseFloor } from '../../../server/foundryHandler.ts'
import type { CerebrasConfig } from '../../../server/config.ts'

interface ParseFloorEnv {
  CEREBRAS_API_KEY?: string
  CEREBRAS_MODEL?: string
  CEREBRAS_BASE_URL?: string
}

// The handler refuses data URIs over 10MB; anything larger than that plus JSON
// envelope headroom is junk — reject before JSON.parse allocates for it.
const MAX_BODY = 10_500_000

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

export const onRequestPost = async (ctx: { request: Request; env: ParseFloorEnv }): Promise<Response> => {
  const raw = await ctx.request.text()
  if (raw.length > MAX_BODY) {
    return json({ ok: false, error: 'Body too large — images are capped at ~7MB.' }, 413)
  }
  let body: { imageDataUri?: string; hint?: string }
  try {
    const parsed: unknown = JSON.parse(raw.length ? raw : '{}')
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
    body = parsed as { imageDataUri?: string; hint?: string }
  } catch {
    return json({ ok: false, error: 'Body must be a JSON object.' }, 400)
  }
  const cfg: CerebrasConfig = {
    apiKey: ctx.env.CEREBRAS_API_KEY,
    model: ctx.env.CEREBRAS_MODEL || 'gemma-4-31b',
    baseUrl: (ctx.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1').replace(/\/+$/, ''),
  }
  return json(await handleParseFloor(body, cfg))
}
