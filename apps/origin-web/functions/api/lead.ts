// Cloudflare Pages Function — POST /api/lead
//
// Captures a demo/pilot lead and forwards it to whatever channel is configured
// via environment variables (set them in the Pages project → Settings → Env vars):
//   LEAD_WEBHOOK_URL   a Slack- or Discord-compatible incoming webhook (simplest)
//   RESEND_API_KEY + LEAD_TO_EMAIL [+ LEAD_FROM_EMAIL]   send email via Resend
//
// Degrades gracefully: with no provider configured it returns { delivered: false }
// and the client falls back to composing a mailto: — so demand is never silently
// dropped. Same file-based-routing dir as the InsForge Deno functions, but this is
// the only Pages-routable handler (scoped by public/_routes.json to /api/*).

interface LeadEnv {
  LEAD_WEBHOOK_URL?: string
  RESEND_API_KEY?: string
  LEAD_TO_EMAIL?: string
  LEAD_FROM_EMAIL?: string
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })

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

  return json({ ok: true, delivered })
}

// Friendly response for accidental GETs / health checks.
export const onRequestGet = (): Response =>
  json({ ok: true, service: 'origin-lead', method: 'POST only' })
