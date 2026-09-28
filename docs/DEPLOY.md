# Deploy — Origin Physical AI

## Release contract

`apps/origin-web` is the canonical source for the public Origin site. Pushing or
merging code does not release it. Production deployment is permitted only through
`.github/workflows/deploy-origin-web.yml` after all of these gates hold:

- the event is `workflow_dispatch`;
- the confirmation input is exactly `DEPLOY`;
- the selected ref is exactly `refs/heads/main`;
- the build/test job for that commit succeeds;
- the protected `production` Environment authorizes the deploy; and
- a least-privilege Cloudflare token is available to the SHA-pinned action.

The workflow uploads the exact tested `origin-web-dist` artifact. Pages Function
discovery is constrained by an executable allowlist, not by copying a repository
function tree. No Cloudflare Git integration or source-change auto-deploy is part of
the supported design.

## Deployed source boundary

The staged Pages source contains exactly three routable handlers:

| Route source | Public authority |
| --- | --- |
| `functions/api/lead.ts` | Public form ingress; bounded to 16 KiB and input-validated. Shared database admission allows three attempts per edge address per ten-minute window, before persistence or notification; missing admission fails closed. |
| `functions/api/foundry/parse-floor.ts` | Service-authenticated. External image processing is additionally kill-switch, enablement, consent, size, key, and rate gated. |
| `functions/api/evidence/status.ts` | Retired stub: GET/HEAD return 410 without requiring a service token. |

`server/` and `src/` are staged only as sibling import support. They do not become
Pages routes. Root InsForge/Deno functions, credentials, payments, agent tokens,
and maintenance jobs are separate deployment authorities and are not deployed by
this workflow.

## What the build proves—and does not prove

The required CI/deploy gates cover TypeScript, lint, unit tests, browser acceptance,
honesty claims, evidence re-derivation, the exact Pages source tree, a non-deploying
Wrangler Functions bundle, secret scanning, and the resolved production npm graph.
They do not prove that production configuration, DNS, WAF, provider accounts,
notifications, database policies, monitoring, or rollback are correct.

The public Foundry browser gets no service token. It can run only the deterministic,
labeled local sample. External parse/quorum/speed are local/backend demo operations
unless a future authenticated browser authority is designed and reviewed.

## Operator procedure

Use [CUTOVER.md](CUTOVER.md) for the full checklist. At minimum:

1. Run and review all CI gates at the intended main-branch commit.
2. Verify Environment reviewers, Cloudflare target/token, fail-closed runtime
   secrets, the lead-admission migration and server database credentials, optional edge WAF controls, logs, and rollback ownership.
3. Manually dispatch the workflow from `main`, type `DEPLOY`, and approve the
   protected production Environment.
4. Record the workflow run, commit, artifact/deployment identifiers, approver,
   runtime configuration version, and smoke-test evidence.
5. Roll back through the same protected path if a launch threshold fails.

Never paste secrets into source, artifacts, workflow inputs, or `VITE_*` variables.
Source completion is not authority to deploy, and a successful upload is not proof
of production correctness.

## Lead admission

Apply `20260928072708_lead-admission.sql` and `20260928073003_lead-admission-retry.sql` from `apps/origin-web/migrations/`, in that order, before releasing the handler. The existing server-only InsForge admin key invokes an atomic database function. It stores only an HMAC of Cloudflare's `CF-Connecting-IP`, with a ten-minute window and a saturated counter; expired records older than 24 hours are removed on the next successful call. It never trusts `X-Forwarded-For`. Anonymous and signed-in browser roles cannot read or mutate counters or invoke admission.

A denied attempt returns 429 plus `Retry-After`; database/configuration failure returns 503 and permits no storage or notification. The browser keeps entered details on 429 and retains the existing email-composition fallback on service failure. This limits submissions across Pages isolates; it does not replace edge DDoS protection or prevent address rotation. Keep optional WAF rules scoped to `/api/lead`. Test with mocks or isolated counters, never real form submissions that send notifications. From the app directory, `node scripts/check-lead-admission.mjs --project-file .insforge/project.json` probes ten concurrent calls under a random synthetic counter key; it never calls the lead handler.

`SERVICE_AUTH_TOKEN` is still required by Foundry's parse route. Retiring the unused evidence-status stub is not permission to remove that shared secret.
