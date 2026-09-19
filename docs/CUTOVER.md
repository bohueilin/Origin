# Cloudflare Pages cutover — operator runbook

> **Status:** source and release-gate implementation only. This document does not
> assert that a Cloudflare cutover, production deployment, environment change, or
> domain change has happened.

Origin is the canonical source for the public trust layer, evidence formats, and
demos in `apps/origin-web`. Production release authority remains human-owned. No
source change deploys automatically.

## Supported release path

The only supported production path is the pinned GitHub Actions workflow
`.github/workflows/deploy-origin-web.yml`:

1. A human selects `main` and starts `workflow_dispatch`.
2. The human types the exact confirmation `DEPLOY`.
3. The build job tests that exact commit and uploads `origin-web-dist`.
4. The deploy job is admitted only when `github.ref == 'refs/heads/main'`, the
   build succeeded, and the protected `production` Environment approves it.
5. The job downloads that exact artifact, creates a marked Pages source stage,
   compiles the staged Functions without uploading, and invokes the SHA-pinned
   Wrangler action from `.origin-pages-stage`.
6. Wrangler uploads `../origin-web-dist`; the staged source contributes only the
   explicitly allowed Pages Functions.

Push and pull-request runs are checks only. A Cloudflare Git integration is not
part of this release contract and must remain disabled for this project.

## Exact Pages Function allowlist

`apps/origin-web/scripts/stage-pages-deploy.mjs` is the executable manifest. It
admits exactly these routable files:

- `functions/api/evidence/status.ts`
- `functions/api/foundry/parse-floor.ts`
- `functions/api/lead.ts`

The stage also carries `server/` and `src/` as non-routable sibling dependency
trees so the allowed Functions retain their relative imports. Root Deno/InsForge
functions, tests, credential brokers, payment handlers, token routes, and sweepers
are not Pages routes. CI tests the exact tree and performs a non-deploying bundle
with pinned Wrangler `4.92.0`.

## Preconditions owned by the operator

Before authorizing the protected Environment:

- Confirm branch protection requires the aggregate `CI green` status.
- Confirm required reviewers are configured for the GitHub `production`
  Environment.
- Confirm `CLOUDFLARE_API_TOKEN` is a least-privilege Pages-edit token stored only
  as a repository/environment secret.
- Confirm the target project/account in the workflow is still the intended
  production target.
- Confirm runtime secrets are present for every capability being enabled. Paid or
  owner routes fail closed when required service/signing/provider secrets are
  absent. Never place secrets in `VITE_*` values or the repository.
- Keep `PARSE_DISABLED=1` until external parsing has been deliberately approved.
  Enabling it additionally requires `PARSE_EXTERNAL_ENABLED=1`, provider
  configuration, service authentication, and affirmative upload consent.
- Install and verify a Cloudflare WAF or equivalent distributed abuse/rate rule
  for public `/api/lead`. The in-code 16 KiB body limit and validation are
  admission controls, not distributed abuse protection.
- Record the current production deployment identifier and rollback owner.

## Pre-deploy evidence

Reproduce the source gates without deploying:

```bash
npm ci
npm run test -w @origin/origin-web
npm run build -w @origin/origin-web
node scripts/honesty-lint.mjs
npx vitest run apps/origin-web/src/deploy/stagePagesDeploy.test.ts
npm --prefix apps/origin-web run test:e2e
npm audit --omit=dev --audit-level=moderate
```

The npm audit covers all resolved production npm dependencies; it is not, by
itself, proof that every dependency is runtime-reachable. Any time-bounded
exception must name the advisory, entrypoint/import path, runtime exposure,
compensating control, owner, and expiry.

## Human cutover and smoke check

1. Open the production workflow on `main`; verify the displayed commit SHA.
2. Run it with `confirm=DEPLOY` and complete the protected-Environment approval.
3. Confirm the workflow reports the expected Cloudflare deployment URL and record
   the run URL, commit SHA, artifact digest, approver, and time.
4. From an unauthenticated browser, verify `/`, `/reference-check`, `/verify`,
   `/foundry`, `/security`, `/trust`, and the legal pages render. Confirm Foundry's
   sample is local and labeled; external parse/quorum/speed remain disabled.
5. Verify protected owner/provider routes reject missing and invalid service
   credentials, and verify `/api/lead` rejects oversized/malformed bodies. Do not
   send real customer or sensitive data as a smoke-test fixture.
6. Review Cloudflare and application logs for unexpected errors or outbound calls.

## Rollback

Rollback is a separate human decision. Re-deploy the recorded last-known-good
artifact/commit through the same protected workflow, then repeat the smoke checks.
Do not reconnect an automatic Git deployment path as a rollback shortcut. Preserve
the failed run, logs, evidence, and incident owner so the decision remains auditable.

Source readiness is not production validation. DNS, WAF, secrets, Environment
reviewers, provider configuration, live smoke results, observability, and rollback
rehearsal remain operator-owned launch gates.
