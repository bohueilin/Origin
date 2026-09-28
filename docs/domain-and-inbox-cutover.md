# Website identity — `originphysicalai.com`

The canonical product website is **https://originphysicalai.com**. Its public source repository is
**https://github.com/bohueilin/Origin**. They are distinct destinations: website metadata identifies
the product site; source links identify the repository.

## Source and build behavior

Public HTML canonicals, Open Graph and Twitter URLs, structured data, sitemap, robots, `llms.txt`,
and current project documentation use the canonical domain directly. A normal local or CI build
therefore emits the correct identity without a deployment-only environment variable.

`siteUrlRewrite()` in `apps/origin-web/vite.config.ts` supports an explicit `SITE_URL` (or
`PUBLIC_SITE_URL`) override for an alternate website origin. The deployment workflow can retain
`SITE_URL: https://originphysicalai.com`; this matches the source default. `CONTACT_EMAIL` can
separately override the public contact address, `bohueilin@originphysicalai.com`. Without either override, the plugin is a no-op.

The plugin rewrites entry-page HTML and only these copied public assets in Vite's configured
output directory:

- Top-level HTML pages, including `404.html`.
- `llms.txt`, `sitemap.xml`, and `robots.txt`.
- HTML pages immediately inside `legal/`.

It does **not** rewrite copied evidence, JSON, research snapshots, compiled JavaScript/CSS, or
backend configuration. Historical signed and hashed artifacts must keep their original bytes;
an embedded historical hostname is provenance, not a current canonical destination. Source links
to GitHub and independent service subdomains are also left intact.

Regression checks live in `apps/origin-web/src/deploy/siteIdentity.test.ts`. They cover canonical
metadata consistency, preview overrides, source/service separation, and evidence preservation.

## Compatibility and release boundaries

The `origin-physical-ai` Cloudflare Pages project identifier and its `origin-physical-ai.pages.dev`
host remain deployment compatibility details. Neither the project nor backend OAuth/CORS allowlists
is renamed by this source update. The existing `www` host is separate from the canonical apex.

`src/auth/AuthProvider.tsx` derives browser callbacks from `window.location.origin`, preserving
local, preview, and production sign-in behavior. The non-browser fallback uses the canonical
website. `insforge.toml` contains the allowed callback configuration; applying backend changes
requires separate authorization. Root-level InsForge Deno functions are not the three Pages API
routes staged by the website release.

Production release remains human-dispatched under [`DEPLOY.md`](DEPLOY.md). Repository updates do
not apply DNS, redirects, backend configuration, or a production deployment. Live host behavior was
not re-verified as part of this source identity pass.

## Separate operational follow-ups

Done (verified 2026-09-16, after the production cutover):

- `www` → apex: `www.originphysicalai.com` answers with a 301 to the canonical apex.
- Search Console: the Domain property for `originphysicalai.com` is verified, and the submitted
  `sitemap.xml` was read successfully.

Updated 2026-09-28:

- The owner selected `bohueilin@originphysicalai.com` as the public business contact. Website and support links use it; the owner authentication identity is unchanged.
- No delivery test was sent as part of the source update; configuring and testing the inbox is separate from publishing the address.

These are operational changes, not prerequisites for a correct source build.
