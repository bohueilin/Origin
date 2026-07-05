# Domain + inbox cutover (owner runbook)

The site currently deploys at **`origin-physical-ai.pages.dev`** and lists **`hello@originphysical.ai`** as contact. Both are placeholders from the earlier project. The hostname still reads "physical," which mildly contradicts the "evidence layer for AI agents" positioning. This runbook migrates to a clean domain + a real inbox.

**The code is already configured for this** — no source edits are needed. A Vite build plugin (`siteUrlRewrite` in `vite.config.ts`) rewrites every canonical URL, Open Graph URL, `llms.txt`, `sitemap.xml`, `robots.txt`, legal pages, `404.html`, and the contact email across the whole `dist/` at build time, driven by two env vars. Unset ⇒ output is byte-identical to today.

```bash
# one command does the whole rewrite:
SITE_URL="https://YOURDOMAIN" CONTACT_EMAIL="hello@YOURDOMAIN" npm run build
# verify no stale host remains:
grep -rl "origin-physical-ai.pages.dev" dist --include='*.html' --include='*.txt' --include='*.xml'   # → (empty)
```

## Owner steps (in order)

1. **Choose the clean domain.** Something that does not read "physical" — e.g. an `origin*.` domain you can secure (vet availability + the matching X/GitHub handle before committing). Keep it short and category-legible (security / evidence / agents).
2. **Provision DNS + the Cloudflare Pages custom domain.**
   - Cloudflare dashboard → Pages → project `origin-physical-ai` → **Custom domains** → add `YOURDOMAIN` (and `www.` if wanted) → follow the CNAME/AAAA instructions.
   - Keep `origin-physical-ai.pages.dev` live as a fallback; optionally add a redirect (`_redirects`: `https://origin-physical-ai.pages.dev/* https://YOURDOMAIN/:splat 301`) once the new domain is verified.
3. **Provision the `hello@` inbox.** Set up email on the new domain (Google Workspace / Fastmail / Cloudflare Email Routing). Confirm it receives + can send. Do **not** advertise it until it actually receives.
4. **Wire lead routing / CRM.** The lead form posts to the Pages Function `functions/api/lead.ts`. Point its delivery (email/webhook/CRM) at the new inbox — see `docs/lead-crm-fields.md` for the exact fields the form sends. Test a submission end-to-end.
5. **Set the env vars for the production build.**
   - Local/manual deploy: `SITE_URL="https://YOURDOMAIN" CONTACT_EMAIL="hello@YOURDOMAIN" npm run build`.
   - If a CI/Pages build is used: add `SITE_URL` + `CONTACT_EMAIL` to the build environment variables.
6. **Redeploy.** `npx wrangler pages deploy dist --project-name origin-physical-ai --branch hud-factorydad-1`.
7. **Verify after deploy** on the new domain:
   - `curl -s https://YOURDOMAIN/proof | grep canonical` → shows the new host.
   - `curl -s https://YOURDOMAIN/llms.txt | grep YOURDOMAIN` and `/sitemap.xml`, `/robots.txt` → new host.
   - Open Graph: paste `https://YOURDOMAIN/` into a share-preview debugger → correct title/URL/image.
   - `/proof/tr-a002.json` still serves (the artifact is domain-independent).
   - The `hello@` link opens the new inbox; send a test.
8. **Update off-site references** to the new domain: the YC application, `docs/customer-proof-update-playbook.md` outputs, any deck/one-pager links, and the X/GitHub bios.

## Honesty note
Do **not** claim the new domain or inbox is live until they actually are. Until cutover, the `pages.dev` host and the placeholder email remain the truthful current state, and the site does not claim otherwise.
