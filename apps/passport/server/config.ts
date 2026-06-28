// ----------------------------------------------------------------------------
// Typed configuration for the standalone server.
//
// Loads from process.env, falling back to a .env.local file (dependency-free, so
// no dotenv needed). Validates required values and collects human-readable
// warnings instead of crashing — the server should boot in a degraded mode
// (e.g. no InsForge) for local dev, and fail loudly only on hard prod errors.
// ----------------------------------------------------------------------------

import fs from 'node:fs'
import path from 'node:path'

export interface NebiusConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface InsforgeConfig {
  baseUrl?: string
  apiKey?: string
  /** Per-request timeout (ms) for InsForge fetches. Defaults to 8000 in the stores. */
  timeoutMs?: number
}

/** GMI Cloud — OpenAI-compatible serverless inference (the agent's brain). */
export interface GmiConfig {
  apiKey?: string
  model?: string
  baseUrl?: string
}

/** Snaplii — real, scoped agent payments. Key is server-side only. */
export interface SnapliiConfig {
  apiKey?: string
  baseUrl: string
  /** Server-enforced ceiling per single purchase (USD), independent of Snaplii's own cap. */
  perBuyCapUsd: number
  /** Server-enforced ceiling for total approved spend this process (USD). */
  dailyCapUsd: number
  /** When false (default), an approved purchase is SIMULATED — no real money moves. */
  live: boolean
}

/**
 * Approval-to-phone. ntfy.sh delivers a REAL push to the user's phone with no account
 * (just install the ntfy app and subscribe to a topic); Twilio SMS is an optional add-on.
 * Both are best-effort: with neither configured the UI shows a clear "simulation" state.
 */
export interface NotifyConfig {
  ntfyBaseUrl: string
  ntfyTopic?: string
  twilioAccountSid?: string
  twilioAuthToken?: string
  twilioFrom?: string
  /** The phone to notify (the user's own number). Masked everywhere it surfaces. */
  approvalPhone?: string
  /** Publicly reachable base URL (a tunnel) so the phone's "Approve" tap can reach the server. */
  publicBaseUrl?: string
}

/** Discord — real group message via an incoming webhook (no bot token needed). */
export interface DiscordConfig {
  webhookUrl?: string
  channelLabel: string
}

/**
 * Email — sends the "Agentic Journey Summary" to the user's OWN address (server-configured;
 * the browser never picks the recipient, so this can't be an open relay). Provider preference:
 * InsForge managed email (reuses InsForge creds, no extra key) → Resend → simulation.
 */
export interface EmailConfig {
  insforgeBaseUrl?: string
  insforgeApiKey?: string
  resendApiKey?: string
  from: string
  /** The single allowed recipient — the user's own email. Unset → simulation (preview only). */
  to?: string
}

/**
 * Concrete order / place context shown to the user. DoorDash has no public consumer API,
 * so the food order itself is prepared/simulated — these are the real values we present and,
 * for the address, share to Discord. Override any of them via .env.local.
 */
export interface DemoConfig {
  deliveryAddress: string
  orderVendor: string
  orderItems: string[]
  orderTotalUsd: number
  orderEta: string
  gamePlan: string
}

/**
 * 1Password — the access layer. The server holds a SERVICE ACCOUNT token (`ops_…`) and resolves
 * `op://vault/item/field` references at runtime via @1password/sdk, ONLY at the tool boundary. The
 * token never leaves the server; agents/clients only ever get opaque, task-scoped lease handles.
 */
export interface OnePasswordConfig {
  serviceAccountToken?: string
  vault?: string
  integrationName: string
  integrationVersion: string
}

export interface AppConfig {
  port: number
  isProd: boolean
  nebius: NebiusConfig
  insforge: InsforgeConfig
  gmi: GmiConfig
  snaplii: SnapliiConfig
  notify: NotifyConfig
  discord: DiscordConfig
  email: EmailConfig
  onepassword: OnePasswordConfig
  demo: DemoConfig
  /** HMAC secret for signing stateless episode tokens + purchase-approval tokens. */
  episodeSecret: string
  /** True when episodeSecret is the insecure dev default — real money is refused in this case. */
  episodeSecretIsDev: boolean
  /**
   * Extra browser origins (besides localhost) allowed to call the CSRF-guarded /api/passport/*
   * routes — used when a deployed frontend (e.g. a Cloudflare Pages site) calls this server through
   * a tunnel. An entry beginning with '.' is a hostname-suffix match, so one line covers every
   * Pages preview alias (e.g. '.origin-physical-ai.pages.dev').
   */
  webOrigins: string[]
  /** Non-fatal configuration warnings to log at startup. */
  warnings: string[]
}

const DEV_EPISODE_SECRET = 'dev-insecure-episode-secret-change-me'

/** Parse a .env.local file into a flat map. Returns {} if absent. */
function readDotEnvLocal(cwd: string): Record<string, string> {
  const file = path.join(cwd, '.env.local')
  if (!fs.existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
  }
  return out
}

export function loadConfig(cwd: string = process.cwd()): AppConfig {
  const file = readDotEnvLocal(cwd)
  // process.env always wins over .env.local (prod injects real env).
  const get = (k: string): string | undefined => process.env[k] ?? file[k] ?? undefined

  const isProd = (get('NODE_ENV') ?? 'development') === 'production'
  const warnings: string[] = []

  const nebius: NebiusConfig = {
    apiKey: get('NEBIUS_API_KEY'),
    model: get('NEBIUS_MODEL'),
    baseUrl: get('NEBIUS_BASE_URL'),
  }
  const insforge: InsforgeConfig = {
    baseUrl: get('INSFORGE_BASE_URL'),
    apiKey: get('INSFORGE_API_KEY'),
  }

  const gmi: GmiConfig = {
    apiKey: get('GMI_API_KEY'),
    model: get('GMI_MODEL'),
    baseUrl: get('GMI_BASE_URL'),
  }
  // Caps are a real-money safety ceiling — a malformed value must FAIL CLOSED (0 = deny),
  // never silently become NaN (which would disable the cap) or absurdly large.
  const cap = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw ?? fallback)
    return Number.isFinite(n) && n > 0 && n <= 100000 ? n : 0
  }
  const snaplii: SnapliiConfig = {
    apiKey: get('SNAPLII_API_KEY'),
    baseUrl: (get('SNAPLII_BASE_URL') ?? 'https://aipayment.snaplii.com').replace(/\/+$/, ''),
    perBuyCapUsd: cap(get('SNAPLII_PER_BUY_CAP_USD'), 60),
    dailyCapUsd: cap(get('SNAPLII_DAILY_CAP_USD'), 120),
    live: get('SNAPLII_LIVE') === '1',
  }
  if (snaplii.live && (snaplii.perBuyCapUsd === 0 || snaplii.dailyCapUsd === 0)) {
    warnings.push('SNAPLII spend cap is invalid (<=0) — all purchases will be denied. Fix SNAPLII_*_CAP_USD.')
  }

  // PUBLIC_BASE_URL becomes the phone "Approve" link + the ntfy Actions header. Validate it as a
  // plain ASCII http(s) URL so a mistyped/Unicode value fails LOUDLY here instead of silently
  // throwing on the ntfy header and dropping every push (the asciiHeader fold is the last-line backstop).
  const isAsciiHttpUrl = (s: string): boolean => {
    if (!/^[\x20-\x7E]+$/.test(s)) return false
    try {
      const u = new URL(s)
      return u.protocol === 'https:' || u.protocol === 'http:'
    } catch {
      return false
    }
  }
  const rawPublicBase = (get('PUBLIC_BASE_URL') ?? '').replace(/\/+$/, '')
  let publicBaseUrl: string | undefined
  if (rawPublicBase) {
    if (isAsciiHttpUrl(rawPublicBase)) {
      publicBaseUrl = rawPublicBase
    } else {
      warnings.push(`PUBLIC_BASE_URL is not a valid ASCII http(s) URL ("${rawPublicBase}") — ignoring it; the phone "Approve" link will be unavailable until it is fixed.`)
    }
  }
  const notify: NotifyConfig = {
    ntfyBaseUrl: (get('NTFY_BASE_URL') ?? 'https://ntfy.sh').replace(/\/+$/, ''),
    ntfyTopic: get('NTFY_TOPIC') || undefined,
    twilioAccountSid: get('TWILIO_ACCOUNT_SID') || undefined,
    twilioAuthToken: get('TWILIO_AUTH_TOKEN') || undefined,
    twilioFrom: get('TWILIO_FROM') || undefined,
    approvalPhone: get('APPROVAL_PHONE') || undefined,
    publicBaseUrl,
  }
  const discord: DiscordConfig = {
    webhookUrl: get('DISCORD_WEBHOOK_URL') || undefined,
    channelLabel: get('DISCORD_CHANNEL_LABEL') || 'Game Night',
  }
  const email: EmailConfig = {
    insforgeBaseUrl: insforge.baseUrl,
    insforgeApiKey: insforge.apiKey,
    resendApiKey: get('RESEND_API_KEY') || undefined,
    from: get('EMAIL_FROM') || 'Passport',
    to: get('SUMMARY_EMAIL') || undefined,
  }
  const onepassword: OnePasswordConfig = {
    serviceAccountToken: get('OP_SERVICE_ACCOUNT_TOKEN') || undefined,
    vault: get('OP_VAULT') || undefined,
    integrationName: 'Passport',
    integrationVersion: 'v1.0.0',
  }
  if (!onepassword.serviceAccountToken) {
    warnings.push('1Password is not configured — the secret broker falls back to the in-memory mock. Set OP_SERVICE_ACCOUNT_TOKEN (+ OP_VAULT) to broker real credentials.')
  }
  // Origins (besides localhost) allowed to call the guarded /api/passport/* routes. Set this to the
  // deployed site's host when a Pages frontend reaches this server through a tunnel.
  const webOrigins = (get('EXTRA_WEB_ORIGINS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const emailProvider = email.insforgeApiKey && email.insforgeBaseUrl ? 'InsForge' : email.resendApiKey ? 'Resend' : null
  if (!emailProvider || !email.to) {
    warnings.push('Email summary is simulated — set SUMMARY_EMAIL (your own address) + an email provider (InsForge creds or RESEND_API_KEY) to actually send.')
  }
  // A positive USD amount, else the fallback (never NaN/<=0).
  const usd = (raw: string | undefined, fallback: number): number => {
    const n = Number(raw ?? fallback)
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : fallback
  }
  const items = (get('DEMO_ORDER_ITEMS') ?? '2 Carne Asada Burritos · Chips & Guac · 2 Mexican Cokes')
    .split(/[·,]/)
    .map((s) => s.trim())
    .filter(Boolean)
  const demo: DemoConfig = {
    deliveryAddress: get('DELIVERY_ADDRESS') || 'Home',
    orderVendor: get('DEMO_ORDER_VENDOR') || 'La Taqueria · DoorDash',
    orderItems: items.length ? items : ['Your usual order'],
    orderTotalUsd: usd(get('DEMO_ORDER_TOTAL_USD'), 15),
    orderEta: get('DEMO_ORDER_ETA') || '7:00 PM',
    gamePlan: get('DEMO_GAME_PLAN') || 'Thursday 6:30 PM',
  }
  if (!notify.ntfyTopic && !(notify.twilioAccountSid && notify.twilioAuthToken && notify.twilioFrom && notify.approvalPhone)) {
    warnings.push('No phone-approval channel set — approvals run in simulation (set NTFY_TOPIC for free real push, or TWILIO_* + APPROVAL_PHONE for SMS).')
  } else if (!notify.publicBaseUrl) {
    warnings.push('PUBLIC_BASE_URL not set — the phone push will arrive, but its "Approve" tap cannot reach this server. Approve in-app, or set a tunnel URL.')
  }
  if (!discord.webhookUrl) warnings.push('DISCORD_WEBHOOK_URL not set — the Discord share is simulated (shows the exact message it would post).')

  if (!nebius.apiKey) warnings.push('NEBIUS_API_KEY not set — the Nebius reference agent will be unavailable.')
  if (!insforge.baseUrl || !insforge.apiKey) {
    warnings.push('INSFORGE_* not set — per-run license history falls back to in-memory (single instance).')
  }
  if (!gmi.apiKey) warnings.push('GMI_API_KEY not set — voice intent falls back to deterministic keyword matching.')
  if (!snaplii.apiKey) warnings.push('SNAPLII_API_KEY not set — the wallet runs in mock mode (no real purchases).')

  let episodeSecret = get('EPISODE_SIGNING_SECRET') ?? ''
  let episodeSecretIsDev = false
  if (!episodeSecret) {
    if (isProd) {
      throw new Error('EPISODE_SIGNING_SECRET is required in production (signs stateless episode tokens).')
    }
    episodeSecret = DEV_EPISODE_SECRET
    episodeSecretIsDev = true
    warnings.push('EPISODE_SIGNING_SECRET not set — using an insecure dev secret. Do NOT use in production.')
  }
  if (snaplii.live && episodeSecretIsDev) {
    warnings.push('SNAPLII_LIVE=1 with the insecure dev signing secret — real purchases will be REFUSED. Set EPISODE_SIGNING_SECRET.')
  }

  const port = Number(get('PORT') ?? '8787')
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid PORT: ${get('PORT')}`)
  }

  return { port, isProd, nebius, insforge, gmi, snaplii, notify, discord, email, onepassword, demo, episodeSecret, episodeSecretIsDev, webOrigins, warnings }
}
