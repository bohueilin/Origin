// ----------------------------------------------------------------------------
// Discord group message — posts the game-plan to the user's Discord via an incoming
// webhook (no bot token needed). The message is composed SERVER-SIDE from a fixed
// template + the demo context, so the browser can never push arbitrary content through
// the webhook. With no webhook configured it returns a simulated preview of the exact
// message it would post.
// ----------------------------------------------------------------------------

import type { DemoConfig, DiscordConfig } from './config.ts'

const DEFAULT_TIMEOUT = 12000

function timedFetch(url: string, init: RequestInit, timeoutMs = DEFAULT_TIMEOUT): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

// Sanitize client-passed fields before they reach Discord: drop line separators (incl. the
// Unicode U+2028/U+2029) AND Discord markdown / mention / link control chars, so time/place
// can never inject bold/spoiler/blockquote/`<@id>`/`[text](url)` into the posted message.
function clamp(v: unknown, n: number): string {
  return String(v ?? '')
    .replace(/[\r\n\u2028\u2029]+/g, ' ')
    .replace(/[`*_~|<>[\]\\]/g, '')
    .slice(0, n)
}

/**
 * Only post to a genuine Discord *webhook* endpoint (defense in depth — the URL is server-config).
 * Requires the /api/webhooks/ path too, so a pasted channel link (discord.com/channels/...) is
 * rejected and we fall back to the simulated preview instead of POSTing to the wrong endpoint.
 */
function isDiscordWebhook(url: string): boolean {
  try {
    const h = new URL(url)
    return (
      h.protocol === 'https:' &&
      /(^|\.)(discord\.com|discordapp\.com)$/.test(h.hostname) &&
      /^\/api\/webhooks\/\d+\/[\w-]+/.test(h.pathname)
    )
  } catch {
    return false
  }
}

function compose(body: unknown, demo: DemoConfig): string {
  const b = (body ?? {}) as Record<string, unknown>
  const time = clamp(b.time, 60) || demo.gamePlan
  const place = clamp(b.place, 120) || demo.deliveryAddress
  return [
    `🎮 **FIFA catch-up night** — ${time} at ${place}.`,
    `Food's handled (DoorDash, arriving ~${demo.orderEta}). Spoiler-free zone — come thru! 🌯⚽`,
  ].join('\n')
}

export interface DiscordResult {
  ok: boolean
  simulated: boolean
  channel: string
  preview: string
  error?: string
}

export async function sendDiscord(body: unknown, cfg: DiscordConfig, demo: DemoConfig): Promise<DiscordResult> {
  const content = compose(body, demo)
  if (!cfg.webhookUrl || !isDiscordWebhook(cfg.webhookUrl)) {
    return { ok: true, simulated: true, channel: cfg.channelLabel, preview: content }
  }
  try {
    const resp = await timedFetch(cfg.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, username: 'Janus · Concierge', allowed_mentions: { parse: [] } }),
    })
    if (!resp.ok) {
      console.error(`[discord] ${resp.status}`)
      return { ok: false, simulated: false, channel: cfg.channelLabel, preview: content, error: 'Discord rejected the message.' }
    }
    return { ok: true, simulated: false, channel: cfg.channelLabel, preview: content }
  } catch (err) {
    console.error('[discord] failed:', (err as Error)?.name ?? 'error')
    return { ok: false, simulated: false, channel: cfg.channelLabel, preview: content, error: 'Could not reach Discord.' }
  }
}
