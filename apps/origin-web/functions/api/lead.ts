// Cloudflare Pages Function — POST /api/lead
//
// Captures a demo/pilot lead. Two INDEPENDENT outcomes, reported separately:
//
//   stored     the row is in `public.leads`, which is what the admin queue reads
//   delivered  a human was notified via webhook or email
//
// They used to be one flag. The handler forwarded to a channel and returned
// `{ delivered: true }` with nothing written anywhere — a live self-test sent an
// email and left the admin queue empty. An emailed lead is not a queue you can
// work, and "delivered" was quietly standing in for "received". Persistence now
// runs first and does not depend on delivery; delivery does not depend on it.
//
// Configure via the Pages project → Settings → Env vars:
//   INSFORGE_BASE_URL + INSFORGE_API_KEY   persist to the leads table (server-only)
//   LEAD_WEBHOOK_URL                       Slack/Discord-compatible incoming webhook
//   RESEND_API_KEY + LEAD_TO_EMAIL [+ LEAD_FROM_EMAIL]   send email via Resend
//
// Degrades gracefully in every direction: with nothing configured it returns
// stored:false + delivered:false and the client falls back to composing a mailto:,
// so demand is never silently dropped. A database outage never fails the visitor's
// form. Same file-based-routing dir as the InsForge Deno functions, but this is the
// only Pages-routable handler (scoped by public/_routes.json to /api/*).

interface LeadEnv {
  LEAD_WEBHOOK_URL?: string
  RESEND_API_KEY?: string
  LEAD_TO_EMAIL?: string
  LEAD_FROM_EMAIL?: string
  INSFORGE_BASE_URL?: string
  INSFORGE_API_KEY?: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

// Mirrors the CHECK constraints in migrations/20260804023516_admin-portal-schema.sql.
// Postgres REJECTS an over-long value rather than truncating it, so clipping here is
// what keeps a verbose visitor from silently losing their request.
const COL_MAX = { name: 200, email: 320, company: 200, blocker: 8000, intent: 40, cta_source: 120, page_path: 200 } as const

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

/**
 * Write the lead to `public.leads` with the server-side admin key.
 *
 * Deliberately NOT written from the browser with the anon key: the table grants no
 * client INSERT, so the only writer is this handler — which means the row is always
 * server-validated and clipped, and an anon caller cannot inject rows directly.
 *
 * Best-effort by contract: never throws, never surfaces the key or the upstream body.
 * A false return means "not stored", which the caller reports honestly rather than
 * turning into a 500 in front of the visitor.
 */
async function storeLead(row: Record<string, string>, env: LeadEnv): Promise<boolean> {
  if (!env.INSFORGE_BASE_URL || !env.INSFORGE_API_KEY) return false
  const base = env.INSFORGE_BASE_URL.replace(/\/+$/, '')
  try {
    const r = await fetch(`${base}/api/database/records/leads`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.INSFORGE_API_KEY}`,
        prefer: 'return=representation',
      },
      // The data API takes an array body even for a single row. `id`, `created_at`
      // and `status` are database-managed and rejected if sent.
      body: JSON.stringify([row]),
    })
    if (!r.ok) console.error(`[lead] store ${r.status} ${r.statusText}`)
    return r.ok
  } catch (err) {
    console.error('[lead] store failed:', err)
    return false
  }
}

export const onRequestPost = async (ctx: { request: Request; env: LeadEnv }): Promise<Response> => {
  const { request, env } = ctx

  let data: Record<string, string>
  try {
    data = (await request.json()) as Record<string, string>
  } catch {
    return json({ ok: false, error: 'bad_json' }, 400)
  }

  // Honeypot: a filled hidden field means a bot — accept silently, deliver nothing.
  if ((data.company_website || '').trim() !== '') return json({ ok: true, delivered: true })

  const name = (data.name || '').trim()
  const email = (data.email || '').trim()
  if (!name || !EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid' }, 422)

  const intent = (data.intent || 'demo').slice(0, 40)
  const clip = (k: string, n: number) => (data[k] || '').slice(0, n)
  const text = [
    `New Origin lead — ${intent}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${clip('company', 200)}`,
    `Role: ${clip('role', 100)}`,
    `Agent: ${clip('agent', 400)}`,
    `Touches: ${clip('touches', 300)}`,
    `Blocker: ${clip('blocker', 600)}`,
    `Signs off: ${clip('signoff', 200)}`,
    `Workaround: ${clip('workaround', 200)}`,
    `Urgency: ${clip('urgency', 200)}`,
    `Source: ${clip('cta_source', 80)} · ${clip('page_path', 120)} · role_path=${clip('role_path', 40)} · ${clip('opened_at', 40)}`,
  ].join('\n')

  // Persist FIRST. The queue is the system of record; notification is a courtesy on
  // top of it, and a broken courtesy must not cost us the request.
  const stored = await storeLead(
    {
      name: name.slice(0, COL_MAX.name),
      email: email.slice(0, COL_MAX.email),
      company: clip('company', COL_MAX.company),
      blocker: clip('blocker', COL_MAX.blocker),
      intent: intent.slice(0, COL_MAX.intent),
      cta_source: clip('cta_source', COL_MAX.cta_source),
      page_path: clip('page_path', COL_MAX.page_path),
    },
    env,
  )

  let delivered = false
  try {
    if (env.LEAD_WEBHOOK_URL) {
      // `text` is the Slack field, `content` is the Discord field — send both;
      // each service ignores the key it doesn't use.
      const r = await fetch(env.LEAD_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, content: text }),
      })
      delivered = r.ok
    } else if (env.RESEND_API_KEY && env.LEAD_TO_EMAIL) {
      const r = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${env.RESEND_API_KEY}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: env.LEAD_FROM_EMAIL || 'Origin <onboarding@resend.dev>',
          to: [env.LEAD_TO_EMAIL],
          reply_to: email,
          subject: `Origin lead — ${intent}`,
          text,
        }),
      })
      delivered = r.ok
    }
  } catch {
    delivered = false
  }

  return json({ ok: true, stored, delivered })
}

// Friendly response for accidental GETs / health checks.
export const onRequestGet = (): Response =>
  json({ ok: true, service: 'origin-lead', method: 'POST only' })
