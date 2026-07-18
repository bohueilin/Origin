# Origin GEO audit — iteration 1 baseline

Scope: checked-in public Origin Web source, inspected 2026-07-17. The repository is the source of truth; no live-site or external-index claims were made.

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
2. Add a crawlable technical explainer mapping reference checks, runtime gates, trust boundaries, and evidence provenance to current implementation status.
3. With explicit authorization for protected files, align homepage structured data, visible copy, sitemap coverage, and crawler policy to that explainer.

## Residual risk

This source audit does not establish live deployment parity, indexing, ranking, citation, or crawler behavior. Those require separately authorized post-deploy checks.
