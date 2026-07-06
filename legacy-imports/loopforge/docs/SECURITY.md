# Security & Privacy — LoopForge

LoopForge is a hackathon demo, but the public deployment (https://loopforge-ai.pages.dev) is hardened against the abuse vectors that matter for a public, billable-inference site.

## Threat model (public site)

| Threat | Vector | Mitigation |
|---|---|---|
| **API cost abuse** (the big one) | Anyone POSTs `mode:live` and burns Cerebras/Fireworks budget or exhausts rate limits | Layered controls below + operator backstops |
| Cross-site abuse | A malicious page drives the billable endpoint from a victim's browser | No CORS headers → preflight denied (405 on OPTIONS); foreign `Origin` → 403 |
| Secret exposure | Key leaking into the client bundle | Key is a Cloudflare **secret**, server-side only; bundle scanned clean on every deploy |
| Clickjacking | Site framed by an attacker | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| Injection / XSS | User-controlled prompt or markup | Live prompts are server-defined over synthetic data (no user prompt); strict CSP; React escaping |
| DoS via large payloads | Huge request bodies | `Content-Length > 2048` → 413 |
| Info disclosure | Stack traces / internals in errors | All errors generic; no `.message`/`.stack`/key values returned |

## Implemented controls

**Live endpoint** (`functions/api/loopforge/run.ts`) — the only path that spends money:
- **Kill switch:** set `LOOPFORGE_LIVE_DISABLED=1` in the Cloudflare dashboard to instantly fall back to the recorded demo — no redeploy.
- **App-header gate:** requires `x-loopforge-client: web`. Cross-site browser fetches can't set it (CORS preflight is denied), and naive bots don't send it → **403**.
- **Origin/Referer allowlist:** any non-`loopforge-ai.pages.dev` origin → **403**.
- **Burst limit:** best-effort per-IP throttle (5 live runs / min / isolate) → **429**.
- **Body cap:** 413 on oversized payloads.
- **Recorded mode** is static JSON — free, no key, no gating needed.

**Static site** (`public/_headers`): `Content-Security-Policy` (default-src 'self'; no inline/remote scripts; `frame-ancestors 'none'`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Cross-Origin-Opener-Policy: same-origin`, `Permissions-Policy` (camera/mic/geo/etc. all denied). `robots.txt` disallows `/api/`. API responses are `Cache-Control: no-store`.

**Data & secrets:** synthetic data only (no real customer data); `.gitignore` excludes `.env*`; the foreign-project env path was removed from source; env loading is allowlisted to LoopForge's own keys.

## Residual risk & operator backstops (do these)

The header/origin gates stop browsers and casual bots, but a determined attacker with `curl` can still spoof the header + a same-origin `Origin`. The **durable** cost controls are operator-side:

1. **Provider spend caps (most important):** set a hard monthly spend/credit limit on the **Cerebras** and **Fireworks** dashboards. This is the guaranteed cost ceiling regardless of any abuse.
2. **Cloudflare Rate Limiting** on `/api/*`: Dashboard → the `loopforge-ai` project / zone → Security → WAF → Rate limiting rules → e.g. *10 requests / 10 min / IP on `/api/loopforge/run` → block*.
3. **Kill switch:** if you see abuse, set `LOOPFORGE_LIVE_DISABLED=1` (Pages → Settings → Variables) — live instantly serves the recorded demo.
4. **Rotate the key** after the event; the demo records in recorded mode, so live can be disabled entirely without affecting the video.

### Cloudflare Turnstile (bot check on live)
Integrated and ships in test mode (always passes, invisible) so the demo works out of the box. To enforce real bot protection:
1. Cloudflare dashboard → **Turnstile** → add a widget for `loopforge-ai.pages.dev` → copy the **site key** and **secret key**.
2. Put the **site key** in `TURNSTILE_SITE_KEY` (`src/app/turnstile.ts`) and redeploy.
3. Set the **secret** as a Pages secret: `wrangler pages secret put TURNSTILE_SECRET_KEY --project-name loopforge-ai` (paste the secret).

When `TURNSTILE_SECRET_KEY` is set, every live run is verified server-side (`siteverify`); a missing/invalid token → **403**. When unset, the header/origin/rate-limit gates still apply. The widget is invisible (managed mode) — judges clicking *Run live* aren't interrupted unless the traffic looks automated.

## Model safety
The model proposes; deterministic gates dispose. The Guardian harness runs as a separate trust boundary from the model and is fail-closed — the Evidence Pack is blocked unless all gates pass — so a hallucinating or prompt-injected model still cannot ship an unsafe action.
