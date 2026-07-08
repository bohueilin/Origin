// ----------------------------------------------------------------------------
// "Agentic Journey Summary" email — sends the user a clean recap of their Request
// and the Results. The recipient is the SERVER-configured address only (never chosen
// by the browser), so this can't be used as an open relay. Sends via Resend when a key
// is set, otherwise returns the composed preview (simulation).
// ----------------------------------------------------------------------------

import type { EmailConfig } from './config.ts'

const DEFAULT_TIMEOUT = 12000

function timedFetch(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function clampLine(v: unknown, n: number): string {
  return String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, n)
}
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}
function maskEmail(e: string): string {
  const [u, d] = e.split('@')
  if (!d) return 'your email'
  return `${u.slice(0, 1)}•••@${d}`
}

interface Row {
  head: string
  detail: string
}

function composeHtml(scenario: string, request: string, rows: Row[]): string {
  const items = rows
    .map(
      (r) =>
        `<tr><td style="padding:12px 16px;border:1px solid #e9ebef;border-radius:12px;background:#ffffff;">` +
        `<div style="font:600 15px -apple-system,system-ui,sans-serif;color:#14171e;">${esc(r.head)}</div>` +
        `<div style="font:14px -apple-system,system-ui,sans-serif;color:#515a67;margin-top:2px;">${esc(r.detail)}</div>` +
        `</td></tr><tr><td style="height:8px;"></td></tr>`,
    )
    .join('')
  return (
    `<!doctype html><html><body style="margin:0;background:#f7f8fa;padding:28px 0;">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">` +
    `<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">` +
    `<tr><td style="padding:0 8px 18px;">` +
    `<div style="display:inline-block;width:34px;height:34px;border-radius:10px;background:linear-gradient(150deg,#7aa2ff,#3b62d6 60%,#2bd49b);vertical-align:middle;"></div>` +
    `<span style="font:700 19px -apple-system,system-ui,sans-serif;color:#14171e;vertical-align:middle;margin-left:10px;">Janus</span>` +
    `<span style="font:13px -apple-system,system-ui,sans-serif;color:#8b94a2;margin-left:8px;">Agentic Journey Summary</span>` +
    `</td></tr>` +
    `<tr><td style="background:#ffffff;border:1px solid #e9ebef;border-radius:18px;padding:24px 26px;">` +
    `<div style="font:700 11px -apple-system,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#8b94a2;">Your request</div>` +
    `<p style="font:600 18px/1.4 -apple-system,system-ui,sans-serif;color:#14171e;margin:6px 0 0;">${esc(request)}</p>` +
    `<div style="font:700 11px -apple-system,system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#0a7d52;margin:22px 0 10px;">What I did &middot; ${esc(scenario)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items}</table>` +
    `<p style="font:13px -apple-system,system-ui,sans-serif;color:#0a7d52;margin:8px 0 0;">Every real-world action ran only after you approved it.</p>` +
    `</td></tr>` +
    `<tr><td style="padding:16px 8px 0;font:12px -apple-system,system-ui,sans-serif;color:#8b94a2;">` +
    `Janus &middot; delegated autonomy you can trust. Credentials stayed brokered, scoped, and revocable.` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  )
}

export interface EmailResult {
  ok: boolean
  sent: boolean
  to: string
  preview: string
  error?: string
}

export async function sendJourneyEmail(body: unknown, cfg: EmailConfig): Promise<EmailResult> {
  const b = (body ?? {}) as Record<string, unknown>
  const scenario = clampLine(b.scenario, 80) || 'Your run'
  const request = clampLine(b.request, 600) || 'Your request'
  const rows: Row[] = (Array.isArray(b.results) ? b.results : [])
    .slice(0, 12)
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>
      return { head: clampLine(o.head, 90), detail: clampLine(o.detail, 220) }
    })
    .filter((r) => r.head)

  const html = composeHtml(scenario, request, rows)
  const previewText = `Agentic Journey Summary — ${scenario}. Request: ${request}. ${rows.map((r) => `${r.head} — ${r.detail}`).join(' · ')}`

  // Recipient is ALWAYS the server-configured address — never client-chosen.
  if (!cfg.to) {
    return { ok: true, sent: false, to: '(set SUMMARY_EMAIL)', preview: previewText }
  }
  const subject = `Your Janus journey — ${scenario}`

  // Provider 1 — InsForge managed transactional email (reuses InsForge creds; no extra key).
  if (cfg.insforgeBaseUrl && cfg.insforgeApiKey) {
    try {
      const resp = await timedFetch(`${cfg.insforgeBaseUrl.replace(/\/+$/, '')}/api/email/send-raw`, {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.insforgeApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ to: cfg.to, subject, html, from: cfg.from }),
      })
      if (resp.ok) return { ok: true, sent: true, to: maskEmail(cfg.to), preview: previewText }
      console.error(`[email] insforge ${resp.status}`)
    } catch (err) {
      console.error('[email] insforge failed:', (err as Error)?.name ?? 'error')
    }
  }

  // Provider 2 — Resend.
  if (cfg.resendApiKey) {
    try {
      const resp = await timedFetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${cfg.resendApiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: cfg.from, to: [cfg.to], subject, html }),
      })
      if (resp.ok) return { ok: true, sent: true, to: maskEmail(cfg.to), preview: previewText }
      console.error(`[email] resend ${resp.status}`)
    } catch (err) {
      console.error('[email] resend failed:', (err as Error)?.name ?? 'error')
    }
  }

  // No provider succeeded → graceful simulation (the composed preview is still returned).
  return { ok: true, sent: false, to: maskEmail(cfg.to), preview: previewText }
}
