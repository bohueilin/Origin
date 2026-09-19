# Canonical identity review

## Result and scope

The canonical product website is `https://originphysicalai.com`; public source is
`https://github.com/bohueilin/Origin`. Public entry HTML, legal canonicals, search/social metadata,
structured data, machine-readable discovery, current project documentation, and standard footer
source links now reflect that distinction. The homepage title and social title use
“Origin — Move AI forward. With evidence.” Its description identifies working prototypes.

Root README and project overview now describe the implemented public browser workflow, unpinned
session evidence, deterministic authority, bounded simulations, and separate customer release
authority. Earlier runtime/customer-pilot overclaims were removed. Public and private repository
boundaries remain explicit.

The website build override now starts from canonical source URLs and only rewrites public pages,
legal pages, and discovery files in Vite's configured output directory. It leaves JSON, signed
proof, research snapshots, compiled application assets, source-repository URLs, and independent
service subdomains intact. A single-pass replacement prevents preview subdomains from being
rewritten twice. The browser OAuth callback remains based on `window.location.origin`; only its
non-browser fallback and a credential comment use the canonical hostname.

The owner confirmed successful Google sign-in before this pass. That is **user-confirmed**, not
an independently exercised write/authentication flow in this identity task. No backend OAuth/CORS
allowlist, Cloudflare project identifier, DNS setting, credential, deployment configuration, or
historical evidence artifact was changed. No external API, E2E server, staging, commit, push, or
production deployment was performed by this task.

## Verification observed

| Check | Result |
|---|---|
| Canonical override regression before fix | Failed because the old rewriter did not rewrite canonical source URLs. |
| Subdomain regression before fix | Failed with `preview.preview.originphysicalai.com` and an incorrectly changed service subdomain. |
| Focused Vitest run | **24/24 passed** across identity, published-proof verification, signup posture, and credential step-up suites. |
| `tsc -b` for Origin Web | Passed after correcting the test helper's Vite hook context. |
| Targeted ESLint | Passed for Vite config, identity tests, authentication provider, and credential step-up file. |
| `npm run proof:verify -w @origin/origin-web` | All nine checks passed for TR-A002's 12-event chain; final digest begins `ca1d4690206e`. |
| `node scripts/honesty-lint.mjs` | Clean: 21 served pages, 170 React copy files, 22 banned patterns, 3 required disclaimers, 8 launch contracts. |
| `git diff --check` | Passed. |
| Historical source evidence and schemas | No diff under `public/proof`, `public/trust`, `public/factoryceo`, or `docs/schemas` during this task. |

The identity tests exercise the actual Vite plugin, including copied-asset output with a temporary
directory. They compare protected artifact bytes before/after an explicit domain/contact override
and inspect entry-page canonical/social identity plus sitemap origins. The existing browser smoke
expectations were updated to the canonical JSON-LD URL. The main agent owns full build, browser,
responsive, and consolidated gate verification; this task did not start another test server.

## Remaining legacy URLs, by purpose

| Purpose | Exact paths | Reason retained |
|---|---|---|
| OAuth/CORS and Pages compatibility | `apps/origin-web/insforge.toml`; `apps/origin-web/functions/credential-broker.ts`; `apps/origin-web/functions/snaplii-broker.ts`; `apps/origin-web/functions/snaplii-run-claim.ts` | Existing backend callback/allowed-origin compatibility is separate from public canonical identity. |
| Compatibility documentation and independent service configuration | `docs/domain-and-inbox-cutover.md`; `apps/origin-web/src/credentials/README.md`; `apps/janus/server/config.ts`; `apps/janus/scripts/start-public.mjs` | Explicit fallback host, existing allowlist guidance, preview suffix example, and a protected-service comment. |
| Stable schema identifiers | `apps/origin-web/docs/schemas/env-bundle.schema.json`; `apps/origin-web/docs/schemas/score-receipt.schema.json`; `apps/origin-web/docs/schemas/checkpoint.schema.json`; `apps/origin-web/docs/schemas/env-promotion-receipt.schema.json` | Existing `$id` values are contract identifiers; a marketing-domain migration must not silently version them. |
| Historical audit/mission/changelog | `PROJECT_BRIEF.md`; `apps/origin-web/DESIGN_AUDIT.md`; `apps/origin-web/docs/CHANGELOG-agent-evidence.md` | Records of the host and instructions at the time, not current discovery metadata. |
| Existing recording scripts | `apps/origin-web/scripts/rec-shot01.mjs`; `apps/origin-web/scripts/rec-shot02.mjs`; `apps/origin-web/scripts/rec-shot04.mjs` | Helpers for existing recordings, kept outside the identity-only edit; no recording was rerun. |
| Test fixtures | `apps/origin-web/functions/api/lead.test.ts`; `apps/origin-web/src/deploy/siteIdentity.test.ts` | Legacy-host request fixture and an intentional historical-evidence fixture. |

No public link to the former `bohueilin/physical-ai-demo-test` source repository was found. No
legacy hostname remains in the current top-level public HTML, legal canonicals, sitemap, robots,
or `llms.txt`. The hostname appears in this review only to document intentional exceptions.

## Exact changed paths owned by this task

Shared HTML and the smoke test already had intentional redesign edits; this task changed only
identity/metadata links and the corresponding canonical expectation. The main agent subsequently
continued visual edits in shared pages, including the proving-ground social image path.

- `PROJECT_OVERVIEW.md`
- `README.md`
- `REPO_STRUCTURE.md`
- `apps/origin-web/CLAUDE.md`
- `apps/origin-web/README.md`
- `apps/origin-web/app.html`
- `apps/origin-web/auth.html`
- `apps/origin-web/brief.html`
- `apps/origin-web/capture.html`
- `apps/origin-web/clip.html`
- `apps/origin-web/docs/domain-and-inbox-cutover.md`
- `apps/origin-web/foundry.html`
- `apps/origin-web/index.html`
- `apps/origin-web/labs.html`
- `apps/origin-web/operations.html`
- `apps/origin-web/over-grant.html`
- `apps/origin-web/passport.html`
- `apps/origin-web/proof.html`
- `apps/origin-web/proving-ground.html`
- `apps/origin-web/public/legal/privacy-policy.html`
- `apps/origin-web/public/legal/terms-of-service.html`
- `apps/origin-web/public/llms.txt`
- `apps/origin-web/public/robots.txt`
- `apps/origin-web/public/sitemap.xml`
- `apps/origin-web/reference-check-vs-runtime.html`
- `apps/origin-web/reference-check.html`
- `apps/origin-web/security.html`
- `apps/origin-web/simulation.html`
- `apps/origin-web/soc.html`
- `apps/origin-web/src/auth/AuthProvider.tsx`
- `apps/origin-web/src/credentials/grantStepUp.ts`
- `apps/origin-web/src/deploy/siteIdentity.test.ts`
- `apps/origin-web/tests/e2e/smoke.spec.ts`
- `apps/origin-web/trust.html`
- `apps/origin-web/verify.html`
- `apps/origin-web/vite.config.ts`
- `docs/design/2026-09-19-canonical-identity-review.md`
- `docs/domain-and-inbox-cutover.md`
