# Origin GEO audit — iteration 1 baseline

Scope: checked-in public Origin Web source, inspected 2026-07-17. The repository is the source of truth; no live-site or external-index claims were made.

## Executive summary

Origin's public source already provides a strong crawler-readable entity definition, honest prototype/private-pilot boundaries, and independently re-verifiable sandbox evidence. The highest-priority retrieval risk is that the implemented synthetic reference check and the broader runtime-enforcement architecture can be flattened into one maturity claim when content is retrieved out of context. The next 30 days should first make the existing verify journey deterministic and self-contained, then publish a source-backed mode comparison, and only then align protected metadata and crawler policy after explicit human authorization. No source supports claims of production deployment, customer adoption, certification, reviewer acceptance, indexing, ranking, or citation performance.

## Baseline

- Primary homepage: `/`, statically authored in `apps/origin-web/index.html`. Its title, description, one H1, buyer statement, prototype/private-pilot qualifier, canonical thesis, and JSON-LD are crawler-readable before JavaScript.
- Primary product journey: `/` → `/reference-check` → download attestation → `/verify`. Route mapping and build inputs are in `apps/origin-web/vite.config.ts`; local route coverage is in `apps/origin-web/tests/e2e/smoke.spec.ts`.
- Strongest proof: `/proof#tr-a002` links a 12-event machine-emitted sandbox trace at `/proof/tr-a002.json`; `apps/origin-web/scripts/verify-tr-a002.mjs` independently recomputes its SHA-256 chain. `/security` and `/verify` expose browser-side verifier demonstrations.
- Crawl surfaces: `apps/origin-web/public/robots.txt` allows standards-compliant crawling and points to the sitemap; `public/sitemap.xml` covers the primary routes; `public/llms.txt` supplies an Origin-specific summary and evidence links. `llms.txt` is supplemental, not authoritative HTML.

## Ranked findings

| Rank | Gap | Evidence | Recommendation |
|---|---|---|---|
| 1 | The primary interactive result and config-drift failure are visually clear but were not announced as state changes to assistive technology. | `src/reference-check/ReferenceCheckPage.tsx`; primary CTA in `index.html` | Implement `aria-pressed`, live verdict status, and alert semantics with an end-to-end invariant. **Implemented this iteration.** |
| 2 | The complete proposal → gate → controlled execution/block → evidence → verification → tamper-failure story spans `/`, `/proof`, and `/verify`; no single tested runbook names exact clicks and fallback evidence. | Homepage demo, `/reference-check`, `/verify`, `scripts/verify-tr-a002.mjs` | Add the canonical sequence and offline fallback to `DEMO_RUNBOOK.md`. **Documented this iteration; UI consolidation deferred.** |
| 3 | Canonical descriptions differ in emphasis: homepage/reference-check describe pre-access testing while legal and `llms.txt` describe runtime proxy enforcement. Both are evidenced, but retrieval may present them as one undifferentiated product mode. | `index.html`, `reference-check.html`, `public/llms.txt`, legal pages | Add a crawlable “reference check vs runtime enforcement” explanation on an unprotected canonical page, with current/proposed status labels. |

## Iterations 2–3 implemented changes

`/reference-check-vs-runtime` (`apps/origin-web/reference-check-vs-runtime.html`) is now the crawlable, source-backed mode comparison. It labels the synthetic pre-access reference check “Implemented today,” labels runtime controlled-proxy enforcement “Proposed architecture,” defines trust boundaries, verdict semantics, evidence provenance, limitations, and product-category distinctions, and links to `/reference-check`, `/verify`, `/proof`, and `/trust`. `apps/origin-web/tests/e2e/smoke.spec.ts` asserts its static content, single H1, labels, and resolving primary links.

Iteration 3 de-orphans the explainer from the product journey with a visible link in the modifiable React surface at `src/reference-check/ReferenceCheckPage.tsx`. The page also carries claim-minimal `TechArticle` JSON-LD whose headline, description, and URL match visible content and the canonical URL. `apps/origin-web/tests/e2e/smoke.spec.ts` parses the JSON-LD, enforces semantic invariants and unsupported-claim omissions, and checks that the source link is visible and resolves. The page is now included in the serious/critical WCAG A/AA e2e scan.

All existing public HTML entries and `public/sitemap.xml` remain byte-preserved. After human authorization, add a visible `/reference-check-vs-runtime` link to one primary footer/navigation surface and add its canonical URL to the sitemap; until then the route is discoverable from `/reference-check` but absent from protected global navigation and sitemap coverage.

## Required gap summary

- Product clarity: distinguish the implemented synthetic pre-access reference check from the broader runtime-enforcement architecture in one canonical explanation.
- Demo: carry one attestation from generation through valid verification and explicit tamper failure without presenter improvisation.
- Verifier/trust communication: `/verify` correctly limits signature proof, but the primary flow should explain earlier that an in-session signature proves integrity, not real-world issuer identity.
- GEO/citation readiness: the strongest claim-to-evidence mappings are split among `README.md`, `/proof`, `/trust`, and `llms.txt`; a concise crawlable technical explainer would be easier to retrieve out of context.

## Protected-file recommendations

Repository guidance requires deploy-critical Origin Web HTML, metadata, `robots.txt`, and sitemap files to remain byte-for-byte unchanged. No such file was edited. A future human-authorized change should:

1. Add visible “reference check vs runtime gate” copy matching JSON-LD descriptions on the homepage.
2. Review the placeholder organization email explicitly identified in the homepage JSON-LD comment before publishing any replacement.
3. Decide crawler policy separately for search/retrieval, user-triggered fetchers, and training crawlers; do not infer consent from the current `User-agent: *` rule.

## Next three slices

1. Make `/verify` accept a bundled deterministic demo example and test valid → tampered/VOID behavior end to end.
2. Add a crawlable technical explainer mapping reference checks, runtime gates, trust boundaries, and evidence provenance to current implementation status. **Implemented in iteration 2; protected navigation/sitemap inclusion deferred.**
3. With explicit authorization for protected files, align homepage structured data, visible copy, sitemap coverage, and crawler policy to that explainer.

## 30-day content roadmap

| Sequence | Window | Priority | Deliverable | Evidence / completion check | Human decision dependency |
|---|---|---|---|---|---|
| 1 | Days 1–7 | P0 | Bundled deterministic `/verify` example covering untampered valid → tampered `VOID` | Focused browser test plus existing verifier tests; claims remain limited to integrity and sandbox evidence | None; keep the existing issuer-identity limitation explicit |
| 2 | Days 8–14 | P0 | Crawlable technical explainer comparing the implemented reference check with the runtime-gate architecture | Links to `/reference-check`, `/trust`, `/proof`, verifier code/tests, and current/proposed status labels | Human review of product-mode terminology before publication |
| 3 | Days 15–21 | P1 | Citation-ready claim-to-evidence index for architecture, trust boundaries, verdicts, failure behavior, evidence provenance, and limitations | Every factual claim maps to a checked-in route, file, test, or artifact; no customer or certification claim | Approval for any external/design-partner evidence; otherwise publish repository evidence only |
| 4 | Days 22–30 | P1 | Protected-surface alignment proposal for homepage copy/JSON-LD, sitemap coverage, and differentiated crawler policy | Byte-level patch proposal and local syntax/semantic test plan; protected files remain unchanged until authorized | Explicit owner decisions on protected HTML/metadata and search, retrieval, user-fetch, and training crawler policy |

## Residual risk

This source audit does not establish live deployment parity, indexing, ranking, citation, or crawler behavior. Those require separately authorized post-deploy checks.
