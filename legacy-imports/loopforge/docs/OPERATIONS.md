# LoopForge — Operations & Handoff

Single doc to operate the site safely while development is paused. For architecture and the
security threat model see [ARCHITECTURE.md](./ARCHITECTURE.md) and [SECURITY.md](./SECURITY.md).

- **Live:** https://loopforge-ai.pages.dev/ (Cloudflare Pages project `loopforge-ai`, prod branch `main`)
- **Repo:** https://github.com/bohueilin/loopforge
- **Build / deploy:**
  ```
  npm run build
  npx wrangler@latest pages deploy dist --project-name loopforge-ai --branch main --commit-dirty=true
  ```

---

## Analytics (Google Analytics 4 — `G-E3G7Z5GG8K`)

GA loads via `index.html` → `/gtag-init.js`. EU/UK/CH visitors are denied by default (Consent
Mode v2) until they accept the banner; everyone else is measured normally. Cloudflare Web
Analytics (cookieless) is the always-on baseline.

### Events instrumented (via `src/lib/analytics.ts` → `track()`)

| Event | Fires when | Params |
|---|---|---|
| `run_live` | "Run live" clicked | — |
| `replay_demo` | "Replay demo" clicked | — |
| `download_evidence_pack` | evidence pack signed + downloaded | `status`, `run_id` |
| `book_teardown` | a "Book a teardown" CTA clicked | `location` (`topbar` \| `footer`) |
| `deep_dive` | a panel "Deep dive" opened | `panel` (the panel title) |

### GA4 dashboard setup (one-time, in the GA UI — code is already done)

1. **Mark key events** — Admin → Events (or Key events) → toggle **Mark as key event** on
   `book_teardown` (primary conversion) and, if you want, `download_evidence_pack`.

2. **Register custom dimensions** so the event params show up in reports. Admin → Custom
   definitions → Create custom dimension, **Scope = Event**, for each:

   | Dimension name | Scope | Event parameter |
   |---|---|---|
   | CTA location | Event | `location` |
   | Evidence status | Event | `status` |
   | Evidence run id | Event | `run_id` |
   | Deep-dive panel | Event | `panel` |

   Until a parameter is registered as a custom dimension, GA collects it but you can't break
   reports down by it. Registration is not retroactive — it applies from creation forward, so
   do this now. (GA4 allows up to 50 event-scoped custom dimensions.)

3. **Filter your own traffic** — Admin → Data Streams → Configure tag settings → Define internal
   traffic → add your IP, so your own visits don't skew the numbers.

---

## EU / privacy compliance — operational checklist

Code is done (Consent Mode v2, geo-gated banner, `/privacy` policy, cookieless baseline). The
remaining items live in dashboards / legal and only you can complete them:

- [ ] **Enable Cloudflare Web Analytics** — Cloudflare dashboard → `loopforge-ai` Pages project →
      Web Analytics → enable. (CSP already allowlists it; cookieless, no banner needed.)
- [ ] **Accept Google's Data Processing Terms** — GA4 Admin → Account Settings. This is your DPA
      with Google and the basis that makes the EU→US transfer lawful (EU-US DPF / SCCs).
- [ ] **Set GA4 data retention to 14 months** — Admin → Data Settings → Data Retention.
- [ ] **Consider disabling Google Signals** — Admin → Data Settings → Data Collection (reduces EU
      exposure; only needed if you don't use Google Ads audiences).
- [ ] **Finish the privacy policy** — fill the bracketed `[legal entity]` / `[registered address]`
      in `public/privacy.html` and have counsel review it for your jurisdiction.

> Note: this is standard compliance guidance, not legal advice.

---

## Security & cost guardrails (important while unattended)

The live-run endpoint `functions/api/loopforge/run.ts` performs a **real, paid Cerebras
inference**. It is already protected by: per-IP rate limiting (429), an `x-loopforge-client`
header gate (403), an origin/referer allowlist, a request body-size cap (413), `OPTIONS`→405,
and optional Cloudflare Turnstile. Server secrets (`CEREBRAS_API_KEY`) live only as Cloudflare
secrets and never enter the client bundle.

To minimize spend/abuse risk during the pause, pick one:

- **Safest (zero spend):** set the kill switch so only "Replay demo" works — in the Cloudflare
  Pages dashboard set env var `LOOPFORGE_LIVE_DISABLED=1` (Settings → Environment variables →
  Production), or `npx wrangler pages secret put LOOPFORGE_LIVE_DISABLED`. The recorded demo is
  unaffected; live runs fall back to the recorded run (`run.ts:336`).
- **Keep live on, harden it (do ALL three):**
  1. **Cerebras hard spend cap** — the only durable ceiling. There is no in-code spend cap;
     each live run fires ~6 paid calls. Set a credit/spend cap (and a billing alert) on the
     Cerebras account (and Fireworks if `FIREWORKS_API_KEY` is set). **Non-negotiable.**
  2. **Cloudflare WAF Rate Limiting rule** on `/api/loopforge/run` — the in-code per-IP limit is
     in-memory/per-isolate (defense-in-depth only) and is defeated by IP rotation. NOTE: WAF
     rate-limiting rules require the site on a **custom domain** in your Cloudflare zone; they
     are **not** configurable on a bare `*.pages.dev`. On `pages.dev`, lean on the Cerebras spend
     cap + Turnstile + the kill switch instead.
  3. **Real Turnstile keys** — set `TURNSTILE_SECRET_KEY` (Cloudflare secret) AND replace the
     always-pass TEST site key in `src/app/turnstile.ts` (`1x00000000000000000000AA`) with your
     real production site key, then redeploy. Until then the bot-check is a no-op.

> **Independent audit status:** a 5-lens security/privacy audit confirmed secrets are env-only
> (never bundled), the CSP/headers and consent plumbing are solid, and `npm audit` is clean.
> The single open risk is the paid live endpoint above — the in-code abuse gates raise the bar
> but are header-spoofable, so the dashboard spend cap + WAF rule are the real backstops.

## Live-run rate limit & alerts

The live endpoint enforces a **global cap of 10 live runs per UTC clock hour** (total across
all visitors), resetting each hour. Over the cap it returns a clean `429` with exactly
`"Too many requests. Please try again later."` — no limit number or reset time is revealed.
Code: `functions/api/loopforge/run.ts` (`checkLiveQuota` / `notifyLimitReached`).

To make it **durable + email-alerting** (it runs on a best-effort per-isolate counter until then):

1. **Bind the KV namespace** (durable counter). Cloudflare dashboard → Pages → `loopforge-ai`
   → Settings → Functions → **KV namespace bindings** (Production) → add:
   - Variable name: `LOOPFORGE_KV`
   - Namespace: `loopforge-ratelimit` (id `e217ba6a42aa44c0847cc991b040b915`, already created)
2. **Email alerts** (fires once per hour when the cap is first hit). Create a free
   [Resend](https://resend.com) account with `bohueilin@gmail.com`, make an API key, and set
   `RESEND_API_KEY` as a Pages secret. Optional `NOTIFY_TO` / `NOTIFY_FROM` overrides; the
   default sends to `bohueilin@gmail.com` from the Resend sandbox sender. (Swap the fetch in
   `notifyLimitReached` for any provider you prefer.)
3. **Turnstile** — the production site key (`0x4AAAAAADtg5Ixb2AHzBWgy`) is wired in
   `src/app/turnstile.ts`. Set `TURNSTILE_SECRET_KEY` as a Pages secret, and make sure the
   key's allowed hostnames in the Turnstile dashboard include `loopforge-ai.pages.dev`.

**No-spend test** (after binding KV) — pre-seed the counter so one click hits the cap without
any paid call, then click "Run live". The CLI flag is `--ttl` (seconds), not `--expiration-ttl`:
```
NS=e217ba6a42aa44c0847cc991b040b915
KEY="live:count:$(date -u +%Y-%m-%dT%H)"
npx wrangler kv key put --namespace-id $NS "$KEY" 10 --ttl 7200 --remote   # seed the cap
npx wrangler kv key get --namespace-id $NS "$KEY" --remote                 # → 10
# click "Run live" → "Too many requests. Please try again later." (no paid call)
npx wrangler kv key delete --namespace-id $NS "$KEY" --remote              # restore live runs
```
Run the seed and the click within the same UTC hour (the key changes each hour). The actual
on-site block only appears once `LOOPFORGE_KV` is bound to the Pages project — the `put`/`get`
above work against the namespace either way.

## Other standing items:
- The "Book a teardown" CTA is a `mailto:` to a personal address — fine, but consider a role
  alias or a form to reduce spam exposure (`src/components/TopBar.tsx` → `CONTACT_HREF`).
- Security headers + CSP are enforced via `public/_headers`; the CSP allowlists exactly Google
  Analytics, Cloudflare Insights, and Turnstile and nothing else. Re-check it if you add any
  third-party script.
