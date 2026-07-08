// ----------------------------------------------------------------------------
// Approval-to-phone — turns a pending Janus approval into a REAL notification on
// the user's phone (ntfy push, free + no account; Twilio SMS optional) carrying an
// "Approve" action. A phone tap flips an in-process pending record; the web client
// polls it and advances the run. The user can equally approve in-app.
//
// SECURITY: this is a UX signal, NOT money authority. A real purchase still requires
// the full Snaplii quote → authorize → purchase chain (one-shot HMAC, server-side key,
// hard caps). A phone "approve" only nudges the user's own browser to proceed within
// those same rails. The approve link is protected by an unguessable, one-shot, short-TTL
// id and is the ONLY notify route that is intentionally reachable cross-origin (the phone).
// ----------------------------------------------------------------------------

import crypto from 'node:crypto'
import type { NotifyConfig } from './config.ts'

const DEFAULT_TIMEOUT = 12000
const TTL_MS = 10 * 60 * 1000

export type PendingStatus = 'pending' | 'approved' | 'denied' | 'expired'
interface Pending {
  status: PendingStatus
  title: string
  createdAt: number
  expiresAt: number
  channel: string
}
// In-process only — correct for a single instance (mirrors the wallet ledger note).
const pending = new Map<string, Pending>()

function timedFetch(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

function sweep(now: number): void {
  for (const [k, v] of pending) if (v.expiresAt < now) pending.delete(k)
}

function maskPhone(p?: string): string {
  if (!p) return 'your phone'
  const d = p.replace(/\D/g, '')
  return d.length >= 4 ? `•••-•••-${d.slice(-4)}` : 'your phone'
}

// A real human tapping the push opens a normal mobile/desktop browser (UA contains "Mozilla"
// and none of the bot/prefetch tokens). Link-preview crawlers, ntfy's own fetch, and CLI tools
// are screened OUT so they can never auto-approve by merely fetching the link.
function looksLikeRealBrowser(ua: string): boolean {
  const s = (ua || '').toLowerCase()
  if (!s) return false
  const bots = ['bot', 'crawl', 'spider', 'preview', 'facebookexternalhit', 'whatsapp', 'telegram',
    'slack', 'discord', 'twitter', 'curl', 'wget', 'python-requests', 'go-http', 'okhttp', 'ntfy', 'headless', 'libwww']
  if (bots.some((b) => s.includes(b))) return false
  return s.includes('mozilla')
}

function clamp(v: unknown, n: number): string {
  // Strip CR/LF AND Unicode line separators (U+2028/U+2029) so titles can never break ntfy
  // headers or smuggle line breaks into the SMS body.
  return String(v ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').slice(0, n)
}

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

// HTTP header values must be ASCII. A real user intent often carries non-ASCII — em-dashes,
// smart quotes, ellipsis, accented letters, emoji — and any of those in the ntfy `Title` header
// makes fetch throw a TypeError, so the push SILENTLY falls back to simulation. Transliterate the
// common punctuation and strip whatever remains, so a real title can never drop the notification.
// (Only the header is folded; the full UTF-8 detail still rides in the notification body/summary.)
export function asciiHeader(s: string): string {
  return String(s ?? '')
    .replace(/[‐-―]/g, '-') // hyphens / en– / em— dashes
    .replace(/[‘’‚‛]/g, "'") // single curly quotes
    .replace(/[“”„‟]/g, '"') // double curly quotes
    .replace(/…/g, '...') // ellipsis
    .replace(/[^\x20-\x7E]/g, '') // drop any remaining non-ASCII (accents, emoji)
    .trim()
}

// ---- channels --------------------------------------------------------------

async function pushNtfy(cfg: NotifyConfig, m: { title: string; summary: string; amount: number | null; approveUrl: string }): Promise<boolean> {
  if (!cfg.ntfyTopic) return false
  try {
    // ntfy headers must be ASCII — fold the (user-derived) title to ASCII so a non-ASCII char can
    // never throw and silently drop the push; the full detail still rides in the body below.
    const headers: Record<string, string> = {
      Title: asciiHeader(m.amount ? `${m.title} - $${m.amount.toFixed(2)}` : m.title) || 'Approval needed',
      Priority: 'high',
      Tags: m.amount ? 'lock,dollar' : 'lock',
    }
    // A `view` action opens the approve URL in the phone's browser → the GET route marks the
    // approval and shows a branded "Approved ✓" page. More reliable than an in-app http POST,
    // and the web's status poll picks it up within ~1s. The URL is ASCII-folded for the SAME reason
    // as Title: a non-ASCII/CRLF char in PUBLIC_BASE_URL would otherwise throw and silently drop the push.
    const safeUrl = asciiHeader(m.approveUrl)
    if (safeUrl) headers.Actions = `view, Approve, ${safeUrl}`
    const resp = await timedFetch(`${cfg.ntfyBaseUrl}/${encodeURIComponent(cfg.ntfyTopic)}`, {
      method: 'POST',
      headers,
      body: m.summary,
    })
    if (!resp.ok) console.error(`[notify] ntfy ${resp.status}`)
    return resp.ok
  } catch (err) {
    console.error('[notify] ntfy failed:', (err as Error)?.name ?? 'error')
    return false
  }
}

async function sendSms(cfg: NotifyConfig, m: { title: string; amount: number | null; approveUrl: string }): Promise<boolean> {
  if (!(cfg.twilioAccountSid && cfg.twilioAuthToken && cfg.twilioFrom && cfg.approvalPhone)) return false
  try {
    const tail = m.approveUrl ? ` Approve: ${m.approveUrl}` : ' Open Janus to approve.'
    const body = `${m.title}${m.amount ? ` ($${m.amount.toFixed(2)})` : ''}.${tail}`
    const auth = Buffer.from(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`).toString('base64')
    const params = new URLSearchParams({ To: cfg.approvalPhone, From: cfg.twilioFrom, Body: body })
    const resp = await timedFetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`, {
      method: 'POST',
      headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!resp.ok) console.error(`[notify] twilio ${resp.status}`)
    return resp.ok
  } catch (err) {
    console.error('[notify] twilio failed:', (err as Error)?.name ?? 'error')
    return false
  }
}

// ---- request / status / approve --------------------------------------------

export interface NotifyRequestResult {
  ok: boolean
  id: string
  channel: 'push' | 'sms' | 'push+sms' | 'simulation'
  target: string
  pushed: boolean
  approvable_from_phone: boolean
  /** The ntfy topic to subscribe to (so the UI can help the user wire up their phone). */
  topic: string | null
  /** A URL the phone can open to subscribe/see this topic (ntfy.sh/<topic>). */
  subscribe_url: string | null
}
export async function requestApproval(body: unknown, cfg: NotifyConfig): Promise<NotifyRequestResult> {
  const b = (body ?? {}) as Record<string, unknown>
  const title = clamp(b.title, 80) || 'Approval needed'
  const summary = clamp(b.summary, 280) || title
  const rawAmount = Number(b.amount)
  const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : null
  const now = Date.now()
  sweep(now)

  // We mint our OWN id — a client value is never trusted as the approve secret.
  const id = crypto.randomUUID()
  const approveUrl = cfg.publicBaseUrl ? `${cfg.publicBaseUrl}/api/passport/notify/phone-approve?id=${id}` : ''

  const got: string[] = []
  if (await pushNtfy(cfg, { title, summary, amount, approveUrl })) got.push('push')
  if (await sendSms(cfg, { title, amount, approveUrl })) got.push('sms')

  const channel: NotifyRequestResult['channel'] =
    got.includes('push') && got.includes('sms') ? 'push+sms' : got.includes('push') ? 'push' : got.includes('sms') ? 'sms' : 'simulation'

  pending.set(id, { status: 'pending', title, createdAt: now, expiresAt: now + TTL_MS, channel })
  const topic = cfg.ntfyTopic || null
  const subscribe_url = topic ? `${cfg.ntfyBaseUrl}/${encodeURIComponent(topic)}` : null
  return {
    ok: true,
    id,
    channel,
    target: maskPhone(cfg.approvalPhone),
    pushed: channel !== 'simulation',
    approvable_from_phone: channel !== 'simulation' && Boolean(approveUrl),
    topic,
    subscribe_url,
  }
}

export function approvalStatus(id: string): { ok: boolean; status: PendingStatus } {
  sweep(Date.now())
  const rec = id ? pending.get(id) : undefined
  if (!rec) return { ok: false, status: 'expired' }
  return { ok: true, status: rec.status }
}

export interface PhoneApproveResult {
  ok: boolean
  status: PendingStatus
  html: string
}
export function phoneApprove(id: string): PhoneApproveResult {
  sweep(Date.now())
  const rec = id ? pending.get(id) : undefined
  if (!rec) {
    return { ok: false, status: 'expired', html: page('Link expired', 'This approval link is no longer valid. Approve in the Janus app instead.') }
  }
  if (rec.status === 'pending') rec.status = 'approved' // one-shot: a second tap is a no-op
  return { ok: true, status: rec.status, html: page('Approved ✓', `“${rec.title}” is approved. Head back to Janus — it’s continuing now.`) }
}

/**
 * GET handler for the phone link — SINGLE-ACTION for a real tap. A genuine browser tap approves
 * immediately and shows the branded "Approved" page (one tap, the smooth demo path). Anything that
 * looks like a bot/prefetch/link-preview fetch gets the side-effect-free confirm page instead, whose
 * explicit POST button is the only way IT can approve — so crawlers can never auto-approve. The id
 * is unguessable, one-shot, and short-TTL, so a real tap approving on GET is safe.
 */
export function phoneApproveViaGet(id: string, ua: string): { ok: boolean; status?: PendingStatus; html: string } {
  sweep(Date.now())
  const rec = id ? pending.get(id) : undefined
  if (!rec) return { ok: false, html: page('Link expired', 'This approval link is no longer valid. Approve in the Janus app instead.') }
  if (rec.status === 'approved') return { ok: true, status: 'approved', html: page('Approved ✓', `“${rec.title}” is already approved. Head back to Janus — it’s continuing now.`) }
  if (looksLikeRealBrowser(ua)) {
    if (rec.status === 'pending') rec.status = 'approved'
    return { ok: true, status: 'approved', html: page('Approved ✓', `“${rec.title}” is approved — your agent is completing the purchase now. You can close this tab.`) }
  }
  return { ok: true, html: confirmPage(rec.title) }
}

// The confirm page: a button that POSTs to the same URL (form action="" preserves ?id=).
function confirmPage(title: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Janus</title><style>body{font:16px -apple-system,system-ui,sans-serif;background:#0b0d12;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.c{max-width:340px;text-align:center;padding:28px}.m{width:46px;height:46px;border-radius:13px;margin:0 auto 18px;background:linear-gradient(150deg,#7aa2ff,#3b62d6 60%,#2bd49b)}.h{font-size:22px;font-weight:700;margin:0 0 6px}.t{font-size:17px;color:#fff;margin:0 0 22px}.b{font:700 16px -apple-system,system-ui,sans-serif;background:#2bd49b;color:#06251a;border:0;border-radius:12px;padding:15px 0;width:100%;cursor:pointer}.p{color:#7e8794;margin:18px 0 0;font-size:13px}</style></head><body><div class="c"><div class="m"></div><p class="h">Approve this action?</p><p class="t">${esc(title)}</p><form method="post" action=""><button class="b" type="submit">Approve</button></form><p class="p">Janus · expires in 10 min</p></div></body></html>`
}

// Both interpolations are escaped — no caller can ever inject markup into this page.
function page(heading: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Janus</title><style>body{font:16px -apple-system,system-ui,sans-serif;background:#0b0d12;color:#fff;display:grid;place-items:center;min-height:100vh;margin:0}.c{max-width:340px;text-align:center;padding:28px}.m{width:46px;height:46px;border-radius:13px;margin:0 auto 18px;background:linear-gradient(150deg,#7aa2ff,#3b62d6 60%,#2bd49b)}.h{font-size:26px;font-weight:700;margin:0 0 10px}.p{color:#aeb6c2;margin:0;line-height:1.5}</style></head><body><div class="c"><div class="m"></div><p class="h">${esc(heading)}</p><p class="p">${esc(body)}</p></div></body></html>`
}
