# Domain cutover — `originphysicalai.com`

`vite.config.ts` has referenced this document since the `siteUrlRewrite()` plugin was written;
it is now real. It records what the cutover actually was, so the next person does not have to
re-derive it from a diff.

## What the site serves

| Host | Role |
|---|---|
| `originphysicalai.com` | **Canonical.** Every `rel=canonical`, `og:url`, sitemap and `llms.txt` entry points here. |
| `www.originphysicalai.com` | Serves the same content; its canonical points at the apex. |
| `origin-physical-ai.pages.dev` | Still serves. Kept deliberately — it is the fallback if DNS is ever mis-set, and the Pages project's own name. |

DNS is on Cloudflare (`nikon` / `kallie` nameservers), and both hosts are attached to the
`origin-physical-ai` Pages project as custom domains.

## How the rewrite works

There is exactly one lever. `SITE_URL` in the deploy workflow's build env:

```yaml
SITE_URL: https://originphysicalai.com
```

`siteUrlRewrite()` in `apps/origin-web/vite.config.ts` then rewrites the built `dist` —
`transformIndexHtml` for the HTML entries, `closeBundle` for the copied public assets
(`llms.txt`, `sitemap.xml`, `robots.txt`, `legal/*`, `404.html`). **Source files keep the
`pages.dev` host**, which is deliberate:

- the repo's own rule is to keep `apps/origin-web` deploy-critical files byte-for-byte, and a
  build-time rewrite honours that while still shipping the right host;
- `unset` is a complete no-op, so local builds, previews and the e2e suite all still run
  against `pages.dev` and the tests that pin it keep passing
  (`tests/e2e/smoke.spec.ts:148` and `:238` assert the JSON-LD `url`).

`CONTACT_EMAIL` is the same mechanism for the contact address. It is **not** set — the address
is unchanged.

## What the rewrite does NOT cover

Two things sit outside `dist` and had to be handled in source. Both are easy to miss because
nothing fails loudly:

1. **OAuth redirects.** `src/auth/AuthProvider.tsx` builds its redirect from
   `window.location.origin` at runtime, so on the new host it asks InsForge to return to
   `https://originphysicalai.com/auth`. That URL must be in `insforge.toml`'s
   `allowed_redirect_urls` or sign-in fails with a redirect error. Ten entries were added
   (apex and `www`, each with `/`, `/admin`, `/app`, `/auth`, `/passport`).
   **`insforge.toml` is source of truth, not live config** — it must be applied to the
   InsForge project for the change to take effect.
2. **Cloudflare Functions.** The deploy stages only `functions/api/`, and none of those three
   routes (`lead`, `foundry/parse-floor`, `evidence/status`) carry an origin allowlist — they
   are same-origin calls, so nothing to change. The `ALLOWED_ORIGINS` list in
   `functions/credential-broker.ts` looks like it matters and does not: that file is an
   InsForge Deno function, never staged into the Pages deployment.

## Still open

- **`www` → apex redirect.** Both hosts serve 200 today. The canonical resolves this for search
  engines, but a Cloudflare Redirect Rule (`www.originphysicalai.com/*` → `https://originphysicalai.com/$1`,
  301) would make it unambiguous for everyone else. Dashboard action.
- **Search Console.** Add `originphysicalai.com` as a property so indexing follows the new
  canonicals.
- **Email / MX.** Untouched. The contact address is still the personal one; `docs/CUTOVER.md`
  notes an inbox on the real domain as later polish. Setting MX is a separate exercise and
  nothing in the build depends on it.
