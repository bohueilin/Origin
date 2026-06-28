// ─────────────────────────────────────────────────────────────────────────────
// Cloudflare Workers entry for the Passport backend (always-on, public-safe).
//
// The whole Hono app (server/app.ts createApp) is hosted INSIDE a single Durable Object so the
// handlers' in-process state (notify pending-approval map, nonce ledger, credential leases) stays
// consistent across requests — exactly what those Maps assume on a single Node process. node:crypto
// is provided by the `nodejs_compat` flag; @1password/sdk is stubbed (mock broker on Workers).
//
// PUBLIC-SAFE config: no Snaplii key → wallet runs in simulation; no 1Password token → mock broker;
// SNAPLII_LIVE never on. The real, useful actions on a public URL are the brain (GMI) + phone push
// (ntfy) + (optionally) Discord/email. Money + raw secrets stay off the public backend by design.
// ─────────────────────────────────────────────────────────────────────────────
import { createApp } from '../server/app.ts'
import type { AppConfig } from '../server/config.ts'

type Env = Record<string, string | undefined> & { APP_DO: DurableObjectNamespace }

function configFromEnv(env: Env): AppConfig {
  const get = (k: string): string | undefined => (env[k] ? String(env[k]) : undefined)
  const num = (v: string | undefined, d: number): number => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : d
  }
  const insforgeBaseUrl = get('INSFORGE_BASE_URL')
  const insforgeApiKey = get('INSFORGE_API_KEY')
  const episodeSecret = get('EPISODE_SIGNING_SECRET')
  return {
    port: 0,
    isProd: true,
    nebius: { apiKey: get('NEBIUS_API_KEY'), model: get('NEBIUS_MODEL'), baseUrl: get('NEBIUS_BASE_URL') },
    insforge: { baseUrl: insforgeBaseUrl, apiKey: insforgeApiKey },
    gmi: { apiKey: get('GMI_API_KEY'), model: get('GMI_MODEL'), baseUrl: get('GMI_BASE_URL') },
    snaplii: {
      apiKey: get('SNAPLII_API_KEY'),
      baseUrl: (get('SNAPLII_BASE_URL') ?? 'https://aipayment.snaplii.com').replace(/\/+$/, ''),
      perBuyCapUsd: num(get('SNAPLII_PER_BUY_CAP_USD'), 60),
      dailyCapUsd: num(get('SNAPLII_DAILY_CAP_USD'), 120),
      live: get('SNAPLII_LIVE') === '1', // never set on the public worker
    },
    notify: {
      ntfyBaseUrl: (get('NTFY_BASE_URL') ?? 'https://ntfy.sh').replace(/\/+$/, ''),
      ntfyTopic: get('NTFY_TOPIC'),
      twilioAccountSid: get('TWILIO_ACCOUNT_SID'),
      twilioAuthToken: get('TWILIO_AUTH_TOKEN'),
      twilioFrom: get('TWILIO_FROM'),
      approvalPhone: get('APPROVAL_PHONE'),
      publicBaseUrl: get('PUBLIC_BASE_URL'), // the worker's own https URL → phone Approve link works
    },
    discord: { webhookUrl: get('DISCORD_WEBHOOK_URL'), channelLabel: get('DISCORD_CHANNEL_LABEL') ?? 'Game Night' },
    email: {
      insforgeBaseUrl,
      insforgeApiKey,
      resendApiKey: get('RESEND_API_KEY'),
      from: get('EMAIL_FROM') ?? 'Passport',
      to: get('SUMMARY_EMAIL'),
    },
    // 1Password native SDK can't run on Workers → no token → broker uses its mock path.
    onepassword: { serviceAccountToken: undefined, vault: undefined, integrationName: 'Passport', integrationVersion: 'v1.0.0' },
    demo: {
      deliveryAddress: get('DELIVERY_ADDRESS') ?? 'Home',
      orderVendor: get('DEMO_ORDER_VENDOR') ?? 'La Taqueria · DoorDash',
      orderItems: (get('DEMO_ORDER_ITEMS') ?? '2 Carne Asada Burritos · Chips & Guac · 2 Mexican Cokes')
        .split(/[·,]/).map((s) => s.trim()).filter(Boolean),
      orderTotalUsd: num(get('DEMO_ORDER_TOTAL_USD'), 15),
      orderEta: get('DEMO_ORDER_ETA') ?? '7:00 PM',
      gamePlan: get('DEMO_GAME_PLAN') ?? 'Thursday 6:30 PM',
    },
    episodeSecret: episodeSecret ?? 'dev-insecure-episode-secret-change-me',
    episodeSecretIsDev: !episodeSecret,
    webOrigins: (get('EXTRA_WEB_ORIGINS') ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
    warnings: [],
  }
}

// One long-lived instance hosts the app so the handlers' Maps persist across requests.
export class AppDO {
  private app: ReturnType<typeof createApp>
  constructor(_state: DurableObjectState, env: Env) {
    this.app = createApp(configFromEnv(env))
  }
  fetch(request: Request): Response | Promise<Response> {
    return this.app.fetch(request)
  }
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const id = env.APP_DO.idFromName('singleton')
    return env.APP_DO.get(id).fetch(request)
  },
}
