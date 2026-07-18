# Origin Overnight Product, Demo, Trust, and GEO Improvement Mission

## 1. Outcome

Inspect the complete Origin source tree and implement the highest-impact bounded improvements needed for a compelling, technically credible 90-second hackathon demonstration to a frontier-AI audience.

The completed work must improve Origin across five connected dimensions:

1. Product and UX clarity.
2. Demo reliability and presentation quality.
3. Verifier and evidence integrity.
4. Citation-ready technical content.
5. Search, answer-engine, and AI-retrieval discoverability.

The objective is not merely to make the website more attractive. The objective is to make the strongest true version of Origin immediately understandable, demonstrable, independently verifiable, machine-readable, citation-ready, and difficult to misrepresent.

The canonical Origin thesis is:

> The model proposes. The environment verifies. The gate decides. The trace proves. Capability is not permission.

## 2. Primary product questions

A new visitor should understand within approximately ten seconds:

* What Origin is.
* Who needs it.
* What it enforces.
* What evidence it produces.
* Why it differs from identity, observability, generic guardrail, policy, and compliance products.

A technical reviewer should understand within approximately two minutes:

* What the model proposes.
* What the deterministic environment verifies.
* What is enforced before a side effect.
* What requires human approval.
* What is blocked.
* What evidence is produced afterward.
* How the evidence can be independently recomputed.
* How tampering is detected.
* Which demonstrations are sandboxed or synthetic.
* Which claims are implemented today versus proposed future work.

## 3. Primary audience

Optimize for:

* Frontier-model and AI-infrastructure leaders.
* Agent-platform owners.
* Security, trust, platform, and infrastructure reviewers.
* Technical founders and hackathon judges.
* Teams deploying high-consequence agents that touch code, infrastructure, internal systems, PII, financial workflows, or other consequential side effects.
* Search and retrieval systems including ChatGPT Search, Claude retrieval experiences, Google Search and Gemini, Meta AI and related discovery surfaces, and other standards-compliant search or retrieval systems.

## 4. Source of truth

Treat the checked-in repository, implementation, tests, deterministic verifier, and evidence artifacts as authoritative.

The currently published website is:

`https://origin-physical-ai.pages.dev/`

The overnight environment may not have network access. Do not depend on live browsing, external APIs, production systems, Search Console, analytics services, credentials, or third-party services.

Audit and improve:

* Checked-in source code.
* Locally generated builds.
* Static website content.
* Existing metadata.
* Structured data.
* Crawl-control files.
* Internal links.
* Machine-readable evidence.
* Documentation.
* Tests.
* Local demo flows.

When a potentially valuable change requires a protected or byte-preserved file, document the exact recommended change instead of modifying that file.

## 5. Product and repository audit

Inspect the complete repository before implementing changes.

Map:

* Applications, services, packages, routes, demos, and evidence artifacts.
* The primary product journey.
* The strongest demonstrable capabilities.
* Disconnected or duplicated experiences.
* Broken or weak navigation.
* Dead-end calls to action.
* Missing loading, empty, denied, paused, blocked, failure, approval, and tamper-detection states.
* Demo fragility.
* Inconsistencies between claims, implementation, tests, evidence, and documentation.
* Areas where the product appears broader or more production-ready than the evidence supports.
* Areas where strong implementation exists but is not explained clearly.

Prioritize findings using:

* Demo impact.
* Trust impact.
* User clarity.
* Retrieval and citation value.
* Reliability gain.
* Implementation effort.
* Regression risk.
* Verification method.

Do not spend the entire run producing reports. Implement the highest-value bounded improvements after establishing the baseline.

## 6. Hackathon demo journey

Improve the most important demonstration so it tells one coherent story:

1. An agent proposes a consequential action.
2. The proposal cannot directly produce a side effect.
3. The deterministic gate evaluates permission, scope, policy, budget, and approval requirements.
4. The system produces an explicit verdict.
5. Allowed actions execute only through the controlled proxy.
6. Risky actions pause for a named human owner.
7. Unauthorized or over-scope actions fail closed.
8. Every proposal, verdict, approval, execution, denial, exception, and block becomes part of a tamper-evident trace.
9. The evidence can be inspected and independently re-verified.
10. Tampered evidence visibly fails verification.

The path must be:

* Understandable with minimal narration.
* Visually legible on a projected screen.
* Repeatable.
* Fast enough for a 90-second demonstration.
* Honest about sandboxed versus live behavior.
* Supported by deterministic tests.
* Easy to reset.
* Resilient to partial failure.

Do not add visual spectacle that weakens technical credibility.

## 7. Verifier and evidence integrity

Audit and improve where necessary:

* Deterministic policy evaluation.
* Environment-owned or server-owned evidence generation.
* Separation between model proposal and authorization.
* The controlled side-effect path.
* Fail-closed behavior.
* Permission, scope, budget, policy, and approval enforcement.
* Trace ordering.
* Event identity.
* Hash-chain verification.
* Digest recomputation.
* Version and configuration binding.
* Replay handling.
* Duplicate-event handling.
* Tamper detection.
* Negative testing.
* Error and unavailable-state handling.
* Evidence provenance.
* Reward integrity.
* Prevention of evidence spoofing.
* Prevention of claim inflation.
* Prevention of verifier bypass.
* Prevention of an LLM grading another LLM and presenting the result as deterministic verification.

Maintain explicit separation among:

* Machine-emitted sandbox evidence.
* Authored example artifacts.
* Synthetic evaluations.
* Authorized fixtures.
* External customer evidence.
* Proposed future functionality.

Do not represent one category as another.

## 8. Reliability and engineering quality

Identify and address high-impact issues involving:

* Runtime failures.
* Type safety.
* State synchronization.
* Stale state.
* Race conditions.
* Error boundaries.
* Retry behavior.
* Timeout behavior.
* Accessibility.
* Keyboard navigation.
* Mobile and desktop behavior.
* Demo performance.
* Brittle fixtures.
* Non-deterministic tests.
* Misleading success states.
* Unhandled partial failures.
* Missing negative tests.

Prefer small, complete, testable vertical slices.

Do not perform broad framework migrations, package-manager migrations, dependency modernization, or architectural rewrites unless directly required by an acceptance criterion.

## 9. GEO and AI discoverability

Perform a source-level Generative Engine Optimization, technical SEO, answer-engine, and AI-retrieval audit.

Optimize for accurate discovery, parsing, entity resolution, retrieval, quotation, and citation—not speculative ranking tricks.

Inspect:

* Crawlable static content.
* JavaScript-only content risks.
* Page titles.
* Meta descriptions.
* Canonical URLs.
* Heading hierarchy.
* Semantic HTML.
* Internal links.
* Orphan routes.
* Broken links.
* Stable section identifiers.
* Open Graph metadata.
* Structured data.
* Sitemap coverage.
* `robots.txt`.
* `llms.txt`.
* Machine-readable documentation and evidence.
* Duplicate content.
* Route naming.
* Entity consistency.
* Product-status consistency.
* Content freshness signals.
* Accessibility semantics.

Treat `llms.txt` as supplemental orientation, not as a replacement for authoritative, crawlable HTML and documentation.

Do not silently change policy regarding model-training crawlers. Document any unresolved crawler-policy decision for human review.

## 10. Entity definition

Canonical descriptions should consistently establish:

* Name: Origin.
* Category: evidence and runtime-governance layer for high-consequence AI agents.
* Primary function: enforce policy before side effects and produce tamper-evident evidence afterward.
* Primary buyer: the owner of an agent blocked in security, trust, or platform review.
* Differentiation: runtime enforcement and review evidence rather than identity-only, observability-only, generic guardrails, or compliance certification.
* Current status: prototype and private-pilot infrastructure, not generally available production SaaS.
* Core thesis: model proposes, environment verifies, gate decides, trace proves.
* Trust principle: capability is not permission.

Avoid keyword stuffing and repetitive slogans.

## 11. Citation-ready content

Identify and improve the highest-value canonical content for questions about:

1. What Origin is.
2. Who Origin is for.
3. The problem Origin solves.
4. How the propose–verify–gate–act/block–prove loop works.
5. System architecture.
6. Trust boundaries.
7. Threat model.
8. Verifier design.
9. Evidence format.
10. Event schemas.
11. Hash chaining.
12. Tamper detection.
13. Human approval.
14. Risk ownership.
15. Policy verdict semantics.
16. Failure and exception behavior.
17. Deployment model.
18. Data flow.
19. Data retention and deletion.
20. Origin versus identity platforms.
21. Origin versus observability products.
22. Origin versus generic guardrails.
23. Origin versus policy engines.
24. Origin versus compliance or certification tools.
25. Demo walkthrough.
26. Evidence-verification instructions.
27. Product limitations and current status.

Prefer a small number of authoritative, differentiated pages over many shallow pages.

Each substantive page should:

* Answer a clear question.
* Begin with a direct answer.
* Define specialized terms.
* Use descriptive headings.
* Include concrete examples.
* Link to primary evidence.
* Link to related canonical content.
* Separate implemented behavior, design intent, limitations, and future work.
* Avoid unsupported superlatives.
* Be useful when retrieved outside the full website.
* Include stable anchors where practical.
* Include dates or versions when freshness matters.

## 12. Structured semantics

Where supported by visible content, consider truthful structured data such as:

* `Organization`.
* `WebSite`.
* `WebPage`.
* `WebApplication` or `SoftwareApplication`.
* `TechArticle`.
* `BreadcrumbList`.
* `FAQPage` only when a genuine visible FAQ exists.
* `VideoObject` only when an accessible real video exists.
* `Dataset` or `DataDownload` only for genuine downloadable evidence.
* `CreativeWork` for published evidence artifacts.

Structured data must not invent:

* Customers.
* Reviews.
* Ratings.
* Pricing.
* Certifications.
* Awards.
* Production adoption.
* External validation.
* Performance claims unsupported by checked-in evidence.

Add automated validation for structured-data syntax and material semantic invariants when structured data changes.

## 13. Required deliverables

Create or update:

### `GEO_AUDIT.md`

Include:

* Executive summary.
* Current strengths.
* Critical discoverability problems.
* Technical crawl findings.
* Entity-definition findings.
* AI-crawler-policy findings.
* Structured-data findings.
* Citation-readiness findings.
* Prioritized recommendations.
* Implemented changes.
* Deferred recommendations.
* Validation evidence.
* Residual risks.
* A 30-day content roadmap.

### `DEMO_RUNBOOK.md`

Include:

* Exact 90-second sequence.
* Expected screen state.
* Exact interactions.
* Expected verdicts.
* Evidence generated.
* Tamper demonstration.
* Reset procedure.
* Failure recovery.
* Offline fallback.
* Claims the presenter may make.
* Claims the presenter must not make.

### `CONTENT_MAP.md`

Include:

* Important user or reviewer question.
* Canonical answering page.
* Current coverage.
* Evidence source.
* Status: retain, improve, add, merge, or remove.
* Priority.

Documentation alone is not sufficient. Implement product or website improvements unless blocked by protected files, credentials, external access, or a non-delegable human decision.

## 14. In scope

* Source-backed website and product improvements.
* Primary demo journey.
* Local static content.
* Semantic markup.
* Structured metadata.
* Internal navigation.
* Accessibility.
* Error and boundary states.
* Verifier and evidence presentation.
* Tests for changed behavior.
* Technical and product documentation.
* GEO audit and content architecture.
* Demo runbook.
* Local validation.

## 15. Out of scope

* Deployment.
* Push or merge.
* Package publication.
* Production systems.
* Production credentials.
* Real customer data.
* External APIs.
* Live-money operations.
* Protected payment functions.
* Cloudflare configuration.
* Search Console.
* Analytics-service changes.
* CI or deployment configuration.
* Ownership configuration.
* Secret management.
* Framework migrations.
* Package-manager migrations.
* Broad rewrites.
* Unsupported market, adoption, certification, or customer claims.

## 16. Hard constraints

* Respect `AGENTS.md`.
* Do not deploy, push, merge, publish, release, or create a pull request.
* Do not modify protected files.
* Do not modify `apps/origin-web/functions/**`.
* Do not modify `apps/origin-web/public/trust/gates-summary.json`.
* Do not modify `PROJECT_BRIEF.md` or `ACCEPTANCE_CRITERIA.md`.
* Do not modify `AGENTS.md`, `CLAUDE.md`, CI, ownership, secret, or deployment files.
* Do not access external APIs.
* Do not use production credentials.
* Do not change live-money controls.
* Do not weaken fail-closed defaults.
* Do not weaken tests, validation, evidence integrity, honesty checks, or security controls.
* Do not add dependencies unless necessary, justified, locally available, and compatible with existing lockfiles.
* Do not alter canonical claims without checked-in evidence.
* Do not represent sandbox, synthetic, or fixture evidence as customer or production evidence.
* When an improvement requires a protected file, document the exact recommendation rather than changing the file.
* Return `human_required` rather than guessing when a material product, legal, privacy, security, crawler-policy, or protected-file decision is unresolved.

## 17. Prioritization

Rank work using:

`Priority = demo impact + trust impact + user clarity + retrieval value + reliability gain − implementation risk − regression risk`

Prioritize:

1. Demo-blocking defects.
2. Verifier-integrity or claim mismatches.
3. Fail-closed reliability.
4. Primary journey clarity.
5. Citation-ready canonical content.
6. Technical discoverability.
7. Structured semantics.
8. Accessibility.
9. Visual polish.
10. Lower-priority documentation.

## 18. Required evidence

Completion claims require:

* Exact changed-file references.
* Tests demonstrating changed behavior.
* Negative-path tests where material.
* Successful configured gates.
* Source-backed factual claims.
* Evidence that protected files were not modified.
* An independently verified Claude review.
* No unresolved critical or high-severity finding.
* An explicit list of deferred work and residual risks.

## 19. Human-only decisions

Stop with `human_required` when progress requires:

* Credentials.
* External access.
* Destructive or irreversible operations.
* Production access.
* A crawler-training-policy decision.
* A legal or privacy judgment.
* A material scope expansion.
* A protected-file change.
* Deployment or release approval.
* A product claim unsupported by repository evidence.
