# Origin — live-site design audit (2026-07-13)

Audited `https://origin-physical-ai.pages.dev/` and every tab against the frontier-lab /
YC-winner bar in `DESIGN_PRINCIPLES.md`. Method: rendered every page (desktop + 375px mobile),
read copy + IA, checked console errors, mapped live-vs-local divergence.

## Verdict: the design is already world-class — the real gap is the deploy, not the design

The visual system is genuinely frontier-lab: restrained Space Grotesk display type, a disciplined
palette (cream `#f6f5f2`, one blue accent, black headlines), a consistent header/footer, honest
labeling (`SIMULATED`, "reproducible under this verifier," "not compliance certification"), and a
strong, buyer-legible information architecture (problem → the loop → interactive demo → product →
evidence). The one-page `/brief` is investor-ready. Mobile (375px) is clean. Zero console errors.
This is not a redesign job.

## The #1 finding: the live site is missing its strongest surfaces (a deploy-cutover gap)

The interactive "run-it-yourself" proof pages — **the biggest wow moments** — return **404 on the
live site** but exist and work in the local `Origin` repo:

| Path | Live (`physical-ai-demo-test`) | Local `Origin` repo |
|---|---|---|
| `/security` (run the verifiers live) | **404** | ✓ built |
| `/verify` (offline re-check a credential) | **404** | ✓ built |
| `/reference-check` (the buyer flow) | **404** | ✓ built (new) |

The live site deploys from the older `physical-ai-demo-test` repo; the improved `Origin` repo (with
these pages, the honesty fixes, and the new self-serve flow) is not yet the deploy source. **The
single highest-impact action for the live site is the deploy cutover** (repoint Cloudflare Pages at
`bohueilin/Origin` `main`) — human-owned, per `docs/DEPLOY.md`. Until then, the site's differentiator
("don't take our word for it — run it yourself") is invisible to visitors.

## Applied this session (local source — deploys on cutover)

- **Hero now surfaces the working self-serve product.** Added a second hero CTA `Run a reference
  check →` (→ `/reference-check`) beside `Book an Agent Evidence Review`, plus a subtle sub-line
  linking the 90-second demo + `Verify a credential yourself`. A technical buyer sees *working
  product they can try in one click*, not just a "book a call." (`index.html`, `home.css`.)
- (Earlier this session) `/reference-check` built to the design system; `/security` + `/verify`
  linked into nav + sitemap + llms.txt; GA consent-mode fixed on all pages; honesty-lint extended.

## Prioritized polish backlog (all in the local source; none are blockers)

- **P2 — one live custom domain.** Canonical URLs point at `*.pages.dev`; a real domain
  (`originphysical.ai`, once registered) makes the brand and SEO equity land on Origin, not Cloudflare.
- **P2 — a real 60-second demo video** in the hero (the "Watch the 90-second demo" link currently
  opens the click-through stepper, not a video). A pre-recorded, honest cut is the viral asset.
- **P2 — dark mode.** `theme-color` advertises a dark variant but no page ships dark styles; either
  implement it or drop the meta (a frontier-lab audience expects a real dark mode).
- **P3 — motion.** The hero is static; one restrained, reduced-motion-safe entrance on the console
  mockup (the "signature moment") would add polish without noise.
- **P3 — consolidate `/trust`.** The live `/trust` ("posture for reviewers") and the local `/trust`
  (the gated-evidence scoreboard) diverge; pick one after cutover so there's a single trust surface.

## What NOT to change
Don't add a second headline, a new palette, or dark chrome to the app — restraint is the current
strength. Keep the honest labels; they are the brand.
