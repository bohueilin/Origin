# Origin Overnight Acceptance Criteria

Every criterion must be assessed using actual code, tests, locally generated artifacts, or precise file-level evidence.

## AC-1 — Immediate product clarity

**Requirement:**
A technically sophisticated first-time visitor can determine from the primary public experience:

* What Origin is.
* Who it is for.
* What action it controls.
* What the deterministic gate decides.
* What evidence is produced.
* Why Origin differs from identity, observability, generic guardrail, policy, and compliance products.
* That the current product is prototype or private-pilot infrastructure rather than generally available production SaaS.

The canonical thesis must remain:

> The model proposes. The environment verifies. The gate decides. The trace proves. Capability is not permission.

**Verification:**

* Inspect the homepage and primary linked product pages.
* Verify the first visible content contains a direct product definition, target user, enforcement outcome, and evidence outcome.
* Verify the primary call to action leads to a working demonstration, proof, technical brief, or evidence surface.
* Verify terminology is consistent across the homepage, brief, trust content, proof content, and relevant metadata.
* Add or update deterministic content or route tests where applicable.

**Failure condition:**

* The visitor must infer the product category from abstract slogans.
* The buyer or use case is unclear.
* The site implies unsupported production maturity.
* Origin can easily be confused with an unrelated product.
* Primary calls to action are broken, vague, or disconnected.

## AC-2 — Coherent 90-second demonstration

**Requirement:**
Origin has one documented and locally repeatable 90-second demonstration showing:

1. Agent proposal.
2. Deterministic evaluation.
3. Permission, scope, policy, budget, or approval decision.
4. Explicit allow, pause, deny, or block verdict.
5. Controlled execution or safe refusal.
6. Tamper-evident evidence generation.
7. Independent verification.
8. Visible failure after evidence tampering.

**Verification:**

* `DEMO_RUNBOOK.md` defines the exact sequence, interactions, expected results, reset procedure, offline fallback, and presenter claims.
* Relevant routes and controls exist and are internally linked.
* The path can be followed locally without production credentials or external APIs.
* Tests cover the primary success path and at least one deny, pause, or tamper path.
* The demonstrated claims match actual code and checked-in evidence.

**Failure condition:**

* The demo requires improvisation, external credentials, production access, or undocumented steps.
* The verifier result is asserted rather than recomputed.
* A model-generated judgment is presented as deterministic proof.
* The tamper demonstration cannot be reproduced.
* The presentation overstates sandbox or synthetic evidence.

## AC-3 — Verifier and evidence integrity

**Requirement:**
Changed behavior preserves or strengthens:

* Separation of proposal and permission.
* Deterministic policy evaluation.
* Controlled side-effect execution.
* Fail-closed behavior.
* Trace identity and ordering.
* Hash-chain and digest verification.
* Version and configuration binding.
* Tamper detection.
* Replay or duplicate handling.
* Negative-path behavior.
* Evidence provenance.
* Reward integrity.
* Honest separation of sandbox, synthetic, fixture, and external evidence.

**Verification:**

* Existing evidence, proof, environment, reward-integrity, and verifier self-tests pass.
* Relevant changed behavior has focused tests.
* Negative and tamper cases fail closed.
* No verifier, oracle, test, assertion, validation, or honesty control is weakened.
* Claude reviews the implementation for evidence spoofing, verifier bypass, model self-grading, claim inflation, and unsafe failure behavior.

**Failure condition:**

* A model can authorize itself.
* A side effect can bypass the controlled path.
* Invalid evidence is accepted.
* Tampered evidence verifies.
* A required version or configuration binding is omitted.
* A failure defaults to allow.
* Tests or controls are weakened to pass gates.

## AC-4 — GEO and AI-retrieval readiness

**Requirement:**
The repository contains a source-backed audit and the public content is structured to support accurate crawling, retrieval, entity resolution, quotation, and citation.

The audit must evaluate:

* Crawlability.
* Canonical URLs.
* Page titles and descriptions.
* Semantic headings.
* Internal links.
* Static content availability.
* Structured data.
* Sitemap and robots policy.
* `llms.txt`.
* Stable anchors.
* Duplicate and orphan content.
* Entity consistency.
* AI-crawler policy.
* Citation-ready technical content.
* Distinction between retrieval crawlers, user-triggered fetchers, search indexing, and training crawlers.

**Verification:**

* `GEO_AUDIT.md` exists and contains prioritized, source-backed findings.
* Protected-file recommendations are documented rather than directly applied.
* Implemented metadata or structured-data changes match visible content.
* Changed structured data has deterministic syntax and semantic-invariant tests.
* Internal links added or modified by the work resolve to valid local routes or artifacts.
* No unsupported ranking, indexing, citation, customer, certification, or production claim is introduced.

**Failure condition:**

* The audit is generic and not tied to Origin source files or routes.
* Structured data contradicts visible content.
* Crawl or crawler-policy changes are made without authority.
* Protected or byte-preserved files are modified.
* Content is created primarily for keyword stuffing or speculative ranking manipulation.

## AC-5 — Canonical content and entity definition

**Requirement:**
Origin has clear, durable, source-backed content answering the most important buyer and reviewer questions.

At minimum, the content architecture must cover:

* Product definition.
* Intended buyer.
* Primary use case.
* Runtime enforcement model.
* Architecture.
* Trust boundaries.
* Threat model.
* Verifier design.
* Evidence format.
* Hash and tamper behavior.
* Human approval.
* Policy verdicts.
* Failure and exception behavior.
* Product status.
* Limitations.
* Comparison with identity, observability, generic guardrails, policy engines, and compliance tools.
* Evidence-verification instructions.
* Demo walkthrough.

**Verification:**

* `CONTENT_MAP.md` maps important questions to canonical pages or planned content.
* Canonical descriptions use consistent category, buyer, function, differentiation, status, and thesis language.
* New or materially changed factual claims link to or identify checked-in evidence.
* Content distinguishes current implementation from design intent and future work.
* Content is useful when retrieved outside the full website context.

**Failure condition:**

* The content consists primarily of slogans.
* Pages repeat the same claims without adding evidence or explanatory depth.
* Current functionality and future intent are conflated.
* Origin is described inconsistently across canonical pages.
* Unsupported authority, adoption, customer, or certification claims are introduced.

## AC-6 — Reliability, accessibility, and demo resilience

**Requirement:**
Changed product surfaces handle primary, empty, loading, denied, paused, failed, and tampered states safely and accessibly where relevant.

**Verification:**

* Changed interactive controls have appropriate labels and keyboard behavior.
* Changed pages preserve meaningful heading hierarchy and semantic structure.
* Error states are explicit and do not masquerade as success.
* The demo path has a documented reset procedure and offline fallback.
* Changed behavior has relevant tests.
* Workspace lint, TypeScript builds, Chronos UI build, and all TypeScript and Python tests pass.

**Failure condition:**

* A partial failure displays success.
* Important interactions are inaccessible by keyboard.
* Changed routes have broken navigation.
* The demo requires hidden state or undocumented manual repair.
* The change introduces flaky or non-deterministic tests.

## AC-7 — Required deliverables

**Requirement:**
The work produces:

* `GEO_AUDIT.md`.
* `DEMO_RUNBOOK.md`.
* `CONTENT_MAP.md`.
* Implemented product, website, verifier-presentation, reliability, accessibility, metadata, or content improvements.
* Tests for changed behavior.
* A clearly documented deferred-work and residual-risk section.

**Verification:**

* Each deliverable exists and contains Origin-specific evidence.
* Implemented changes correspond to high-priority findings.
* Documentation references actual routes, files, commands, or evidence artifacts.
* The work is more than an audit-only output unless implementation is blocked by a protected surface or human decision.

**Failure condition:**

* Reports are generic.
* No product or website improvement is implemented.
* Recommendations cannot be traced to source evidence.
* Deferred work and residual risk are omitted.

## AC-8 — Scope, safety, and deterministic completion

**Requirement:**
All work stays within the authorized worktree and respects all repository and harness constraints.

**Verification:**

* All configured required gates pass.
* No protected file changes.
* No deployment, push, merge, release, package publication, or production access.
* No credentials, secrets, or customer data.
* No external API use.
* No live-money or protected payment-function changes.
* No CI, ownership, deployment, or secret-management changes.
* No unsupported dependency migration.
* No critical or high-severity Claude finding remains.
* Claude independently verifies completion against every acceptance criterion.

**Failure condition:**

* Any required gate fails.
* A protected file is modified.
* A secret or credential is introduced.
* The branch or Git history is changed outside the allowed process.
* The implementation requires an unresolved human-only decision.
* Completion is claimed without evidence for every applicable criterion.

## Global completion gate

The project may be marked complete only when:

1. Every applicable acceptance criterion is evidenced as met.
2. Every configured required gate passes.
3. No critical or high-severity finding remains.
4. No protected file was modified.
5. No human-only decision remains unresolved.
6. The final implementation is independently reviewed by Claude.
7. Deferred work and residual risks are documented honestly.
