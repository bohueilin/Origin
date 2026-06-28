---
name: demo-observability-and-publication
description: >
  Provides the operator command/report that walks the 13-step Chronos demo, exposes branch and evidence links, reports measured metrics, labels the prior-run fallback honestly, supports acceptance, presentation, and report-replay modes, and publishes or displays the passing hardened release through a thin trusted publisher wrapper. Use when Plan 005 has merged a passing ReleaseProof and Wave 1 has bound the publish primitive; it owns src/chronos/demo/**, tests/chronos/demo/**, scripts/chronos-demo*, artifacts/chronos/demo/**, this plan/reference, and evidence/006/**.
owns: ["docs/plans/006-demo-observability-and-publication.md", "docs/plans/006-demo-observability-and-publication.REFERENCE.md", "src/chronos/demo/**", "tests/chronos/demo/**", "scripts/chronos-demo*", "artifacts/chronos/demo/**", "docs/plans/evidence/006/**", "docs/plans/repo-map/COMMANDS.json entries plan-006-tests, integration-publication, publication-idempotency, publication-permission-denied, publication-trust-boundary, publication-redaction, demo, demo-report-replay, demo-presentation-timeout, hud-deploy only", "docs/plans/repo-map/INTERFACES.md row 17 (HUD publish/compare) and docs/plans/repo-map/REPOSITORY.md status reconciliation only — bundled at maintainer direction"]
depends_on: ["verifier-fix-and-release-proof"]
wave: 5
---

# Demo, observability, and publication

## Goal

Provide one repository-native Acceptance Demo Run that produces a 13-of-13 step evidence report, starts genuine stochastic branches with the full accepted branch budget, can restore a clearly labelled prior-run Witness fallback, shows the passing ReleaseProof, and returns either a published environment id or an explicit permission-blocked release-candidate id. Also provide a Presentation Demo Run for judge timing and a Demo Report Replay for audit review. Done is binary when all 13 report entries have non-screenshot evidence, the machine-readable report validates, all required mapped commands run without `SKIP`, replay mode is labelled honestly, and one honest release outcome is recorded.

## Context / Why

The judge must see a suspicious trace become a defended environment version. The demo should orchestrate existing HUD and Modal surfaces rather than hide them behind a speculative custom frontend. Every displayed claim must link to durable evidence, and live stochastic discovery must not be faked. Current agent-evaluation guidance treats traces and structured eval runs as the durable basis for debugging and repeatability, while HUD frames environments as controlled worlds that can reset and reproduce task state exactly ([OpenAI agent evals](https://developers.openai.com/api/docs/guides/agent-evals), [HUD introduction](https://docs.hud.ai/v6/start)).

This slice owns operator orchestration, concise status/links, metrics aggregation, claim wording, fallback flow, demo mode selection, report replay, the thin trusted publisher wrapper, and trusted publication/display report integration. It consumes immutable artifacts from earlier plans and does not modify their contents. Plan 005 owns ReleaseProof creation and release-candidate sealing; Wave 1 owns discovery and binding of the real HUD/environment publish primitive. Plan 006 owns the final verified invocation and honest presentation of that bound primitive. Read the sibling reference for the 13-step evidence matrix, fallback script, demo modes, machine-readable report, report replay, and publication attempt schema.

## Constraints

- Use the repository's existing CLI/UI/report conventions. Add no standalone frontend unless Wave 1 found a directly reusable surface.
- Acceptance Demo Run starts a genuine stochastic search with the full accepted branch budget, defaulting to the Plan 003 core count of 12 BranchRuns unless the accepted repo map records a different budget. Do not require live discovery to find a fresh exploit.
- Presentation Demo Run may use a shorter presentation budget, but it must still launch real branches through the same scheduler and must not present a prerecorded branch list as live discovery.
- Presentation Demo Run must switch immediately to Prior-Run Witness Replay when its fixed budget expires. Do not wait for "one more branch" during judging.
- When switching to Prior-Run Witness Replay, show original run identity and label it before replay. The replay must restore and execute the sealed Witness live; playing back a video or static transcript is not proof.
- Demo Report Replay may re-render and revalidate a prior `report.json` for audit or judge review, but it is review-only unless the referenced report was produced by a validating Acceptance Demo Run.
- Keep a sealed demo readiness pack for presentation resilience: source trace, ForkPoint, prior-run Witness, replay entrypoint, ProofSet, ReleaseProof, metrics report, PublicationAttempt or expected block, and local presentation backups. The pack is not proof unless its ids/digests validate against the underlying artifacts.
- Display reward and QA classification separately.
- Link trace ids, file diffs, ForkPoint, branch ids, Witness, ProofSet, patch, controls, ReleaseProof, and environment/release candidate.
- Derive metrics from stored events; use `not-measured`, never estimates.
- Do not report discovery probability, success rate, exploit coverage, reliability, avoided setup, or cost savings from one demo run. Statistical claims require repeated trials, denominator, independence statement, and variance or uncertainty.
- Completion proof is noninteractive and machine-readable. The judge-visible demo may add UI and screenshots, but `report.json`, evidence refs, command results, and the manifest are the merge-gate source of truth.
- Publication runs in a trusted context and only for a passing ReleaseProof.
- The branch runner, fixer sandbox, and untrusted demo surfaces must not hold publication authority. Modal documents Sandboxes as secure containers for untrusted user or agent code, so publish credentials remain outside those execution contexts ([Modal Sandboxes](https://modal.com/docs/guide/sandboxes)).
- STOP publication on absent Wave 1 publish binding, proof mismatch, unauthorized target, mixed environment/grader identity, missing release artifacts, or unavailable trusted context. Permission denial may still complete the “display candidate” outcome.
- Any `SKIP` from `plan-006-tests`, `demo`, or publication-specific mapped commands is a failed Plan 006 validation, not evidence.
- Keep orchestration/reporting local. Split files over 500 lines by command/report/publisher responsibilities.
- Tests assert operator-visible steps, truthful fallback state, publication failure semantics, and report schema validity, not terminal formatting snapshots alone.

## Work packets

### WP1 — Build the repository-native demo command

Compose existing operations into one resumable command or established UI flow. Accept immutable source trace/ForkPoint/ReleaseProof ids and expose progress without duplicating core logic.

**Pass:** A clean operator can run one documented invocation and resume from durable artifacts.  
**Fail:** The demo contains hidden one-off state or reimplements capture/search/replay/release.

### WP2 — Surface live discovery honestly

Open/link the source trace, QA result, file evidence, ForkPoint, and start real stochastic branches. Stream branch ids/status and inspect one successful exploit when available.

**Pass:** Branch activity is genuine and all displayed ids correspond to persisted records.  
**Fail:** A prerecorded branch list is shown as live execution.

### WP3 — Implement the prior-run fallback

When live discovery does not produce a Witness within the bounded presentation window, announce fallback, load a sealed prior-run Witness, restore its state, and replay it live before continuing.

**Pass:** Report/UI marks `discovery_source: prior-run`, links the original run, and shows a new replay result.  
**Fail:** The fallback is unlabeled or only plays a recording.

### WP4 — Walk proof and preservation evidence

Show Witness addition to ProofSet, patch/fixer reference, v2 Witness failure, control success, and ReleaseProof gate. Preserve separate raw and normalized results.

**Pass:** Every claim links to the immutable artifact or trace that supports it.  
**Fail:** The operator must trust a verbal summary or a manually edited slide.

### WP5 — Aggregate metrics and research-safe claims

Generate the core report: branch count, clusters, time to Witness, before/after rewards, control retention, replay rate, restore latency, setup avoided, and optional flat comparison. Use bounded wording: “MCTS-shaped,” no complete coverage claim.

**Pass:** Every numeric value has an event/artifact source; absent values are `not-measured`.  
**Fail:** Illustrative or handoff numbers appear as results.

### WP6 — Publish or display the hardened release

Implement a thin trusted publisher wrapper and report integration under `src/chronos/demo/**`. The wrapper must not invent the HUD/environment publication API: Wave 1 must have bound the real publish primitive and authorized target in the repo map. Plan 006 verifies the sealed ReleaseProof digest, v1/v2 environment and grader identities, target identity, publisher capability label, release artifact refs, and trusted execution context before invoking the bound primitive.

Expose the publish/display operation both as step 13 of the full demo and as an independently runnable operation by ReleaseProof id/digest. Publication is idempotent by ReleaseProof content digest plus target: rerunning the same request returns the existing published ref or the same blocked candidate without mutating sealed proof or creating duplicate versions. If the publish primitive is unbound, STOP with `blocked-with-proof`. If credentials deny publication, record `permission-blocked` with the sealed candidate id, attempted command, target, and normalized authorization error without claiming publication.

**Pass:** Output contains `published`, `permission-blocked`, or `blocked-with-proof`, each backed by ReleaseProof digest, target identity, trusted command evidence, idempotency evidence, and stable artifact refs.
**Fail:** Plan 006 guesses a publish API, publishes from an untrusted branch/demo UI context, mutates ReleaseProof, creates duplicate versions on retry, or treats a local candidate as published.

## Self-validation contract

Self-validation is deterministic even when live discovery is stochastic. The demo may start genuine stochastic branches, but completion is proven by replayable artifacts, stable ids, machine-readable checks, and trace/event evidence. This follows agent-eval guidance to start from traces while debugging behavior and move to repeatable datasets/eval runs once success criteria are known ([OpenAI agent evals](https://developers.openai.com/api/docs/guides/agent-evals)). It also follows current agent-evaluation guidance to run multiple trials or repeated checks for nondeterministic behavior and to evaluate outcomes/state changes rather than only the path taken ([Anthropic agent evals](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents), [LangChain agent evaluation checklist](https://www.langchain.com/blog/agent-evaluation-readiness-checklist)).

Screenshots are supplementary only. Auditability requires report rows, trace ids, metric evidence refs, command outputs, artifact digests, and provenance-like records for inputs and outputs. Evidence should be safe to retain: collect only observability data needed for the proof and never record secret values ([OpenTelemetry sensitive data guidance](https://opentelemetry.io/docs/security/handling-sensitive-data/), [SLSA provenance](https://slsa.dev/spec/v1.0/provenance)).

## Done-when (self-validation gate)

Before running completion commands, STOP unless:

- `repo-map/STATUS.json` is `accepted`;
- Gate 4 has merged with complete Plan 005 evidence;
- `plan-006-tests`, `demo`, `demo-report-replay`, and all publication-specific command keys in `COMMANDS.json` are `verified`, have non-empty `argv`, and do not print `SKIP`;
- any Plan 006 update to `COMMANDS.json` is limited to the ten owned keys named in this plan's frontmatter and the index ownership row;
- the bound publish primitive and authorized target are recorded, or missing publish binding/authority is recorded as `blocked-with-proof` with a sealed release candidate, passing ReleaseProof, and trusted-context preflight.

Run from repository root:

    python docs/plans/scripts/validate_graph.py
    python docs/plans/scripts/validate_sections.py
    python docs/plans/scripts/validate_ownership.py --repo-bound
    python docs/plans/scripts/validate_traceability.py
    python docs/plans/scripts/run_mapped.py plan-006-tests
    python docs/plans/scripts/run_mapped.py integration-publication
    python docs/plans/scripts/run_mapped.py publication-idempotency
    python docs/plans/scripts/run_mapped.py publication-permission-denied
    python docs/plans/scripts/run_mapped.py publication-trust-boundary
    python docs/plans/scripts/run_mapped.py publication-redaction
    python docs/plans/scripts/run_mapped.py demo
    python docs/plans/scripts/run_mapped.py demo-report-replay
    python docs/plans/scripts/run_mapped.py demo-presentation-timeout
    python docs/plans/scripts/run_mapped.py lint
    python docs/plans/scripts/run_mapped.py build
    python docs/plans/scripts/validate_file_sizes.py --plan 006
    python docs/plans/scripts/validate_evidence.py --plan 006 --require-complete

Expected evidence:

- exact demo invocation and exit status,
- `artifacts/chronos/demo/<invocation_id>/report.json` with exactly 13 linked pass/display/fallback/blocked-with-proof entries,
- proof that `plan-006-tests`, `demo`, `demo-report-replay`, and publication-specific mapped commands did not return `SKIP`,
- real live branch ids,
- Acceptance Demo Run mode with full accepted branch budget, or explicit evidence-backed STOP if resource policy blocks it,
- Presentation Demo Run mode, when used, with bounded live branch attempt and honest fallback labels,
- presentation-timeout evidence proving the demo switches to Prior-Run Witness Replay without waiting on extra branches,
- `discovery_source` recorded as `live-new-witness`, `live-no-witness`, or `prior-run-replay`,
- `live_attempt_id`, `live_attempt_result`, and `proof_source` fields separating live activity from proof,
- Prior-Run Witness Replay evidence with original run id and new replay id when fallback is used,
- Demo Report Replay evidence that revalidates a prior report without claiming a new branch, replay, or publication attempt,
- demo readiness pack digest and preflight result for auth, network, quota, source trace, prior Witness, ReleaseProof, release candidate, and local artifact paths,
- unlabeled fallback rejection check,
- fake-live-branch rejection check,
- single-run statistical overclaim rejection check,
- Witness replay, v2 failure, and all-control preservation links,
- ReleaseProof id/digest,
- repository-bound publish primitive and command key,
- trusted publisher invocation id, publisher capability label, target identity, idempotency key, and duplicate-run result,
- permission-denied run with normalized authorization error,
- trust-boundary negative check proving untrusted branch/fixer/demo contexts lack publish authority,
- redaction check proving token-like values, secret env vars, Authorization headers, cookies, signed URLs, and full subprocess environments are removed from report and manifest output,
- published environment ref or permission-blocked/blocked-with-proof release-candidate id,
- proof that proof mismatch, unauthorized target, mixed identity, missing artifacts, and unavailable trusted context fail without mutating sealed ReleaseProof or claiming publication,
- measured/not-measured metrics report,
- screenshots only where they add operator-visible evidence,
- manifest `docs/plans/evidence/006/MANIFEST.json`.

No owned source file exceeds 500 lines without a real seam. Tests verify semantic step completion, truthful labels, report schema validity, Acceptance versus Presentation Demo Run behavior, Demo Report Replay audit-only labeling, publisher idempotency, proof/target mismatch rejection, and permission semantics, not cosmetic output.

## Recovery

The demo command is resumable by immutable artifact ids and never mutates sealed proof. On interruption, restart from the last report step and create a new invocation id. Live branch sandboxes are cleaned or left to recorded timeout cleanup. Demo Report Replay can re-render a previous invocation from immutable report/artifact ids for audit, but must preserve the original invocation id and mark the replay invocation separately. Publication is idempotent by ReleaseProof/content digest plus target and must detect an existing version or blocked candidate. Roll back demo code/report artifacts without deleting core evidence, release candidates, publication attempts, or published versions.

## Executor prompt

    /goal Implement docs/plans/006-demo-observability-and-publication.md after Plan 005 merges and Wave 1 has bound the publish primitive. Provide Acceptance Demo Run, Presentation Demo Run, and Demo Report Replay modes. Acceptance emits a validating 13-step report.json, starts the full accepted branch budget, labels and live-replays any prior-run fallback, reports only measured values, and uses the thin trusted publisher wrapper to publish the passing release or honestly display a permission-blocked/blocked-with-proof candidate. Presentation may use a bounded live branch attempt but must label fallback. Report replay is audit-only unless backed by the original Acceptance Demo Run. Run Done-when commands, treat SKIP as failure, stay inside owned paths, update evidence/006/MANIFEST.json, and append the Living-doc log.

## Living-doc log

### Progress

- 2026-06-20 — Planning hardening pass added deterministic self-validation, machine-readable report, thin trusted publisher ownership, and publication-specific negative checks.
- 2026-06-20 — Planning hardening pass added Acceptance Demo Run, Presentation Demo Run, Prior-Run Witness Replay, and Demo Report Replay semantics so replay is explicit and audit-safe.
- 2026-06-21 — Grill-with-docs decision: Presentation Demo Run must launch a fresh live stochastic attempt, but completion must not depend on fresh Witness discovery. The demo switches to sealed Prior-Run Witness Replay on timeout.
- 2026-06-21 — Parallel risk review added demo-day preflight, sealed readiness pack, presentation timeout behavior, statistical overclaim rejection, and publisher redaction guardrails.
- 2026-06-21T09:34:39Z — Created stacked worktree `codex/plan-006-demo-stack` from `origin/codex/plan-005-release-proof` after fetching `main`, PR #27, and the Plan 005 stack base. Pre-implementation read-order found two legal blockers. First, repo-map files disagree: `docs/plans/repo-map/STATUS.json` says accepted while `docs/plans/repo-map/REPOSITORY.md` still says Gate 1 is blocked and warns not to start Plans 002-007. Per `AGENTS.md`, implementation stopped before source edits and the inconsistency is recorded in `docs/plans/evidence/006/MANIFEST.json`. Second, Plan 005/Gate 4 is expectedly incomplete: no v2 patch, per-case v1/v2 release-results artifact, sealed ReleaseProof, release candidate ref, or complete Done-when evidence exists. The root `.env` was symlinked into the worktree for future trusted commands without reading, printing, diffing, or committing secret values.
- 2026-06-21T09:34:39Z — Plan for legal continuation after the repo-map conflict is resolved: implement only Plan 006 owned paths (`src/chronos/demo/**`, `tests/chronos/demo/**`, `scripts/chronos-demo*`, `artifacts/chronos/demo/**`, this plan/reference, `evidence/006/**`, and the declared Plan 006 `COMMANDS.json` keys). Start with pure contracts for the 13-step report, demo modes, prior-run fallback labels, report-replay audit-only semantics, metrics provenance, fake-live and statistical-overclaim rejection, `PublicationAttempt`, redaction, trusted publisher preflight, idempotency, permission/blocker semantics, and command wiring. Do not mutate Plan 003/004/005 artifacts. Full completion remains blocked until Gate 4 and publish binding/authority are evidence-backed.
- 2026-06-21T09:38:07Z — Rechecked current external state after fetching `main`, PR #27, `codex/plan-005-release-proof`, and `codex/plan-006-demo-stack`. `origin/pr-27` and `origin/codex/plan-005-release-proof` still resolve to `2def782`, Plan 005 evidence remains `blocked` without ReleaseProof or v1/v2 release results, the repo-map conflict remains, and Plan 006 mapped commands remain `SKIP`/missing. No source implementation was performed.
- 2026-06-21T09:40:02Z — Third consecutive blocker audit after refetch found the same state: repo-map source files disagree, Plan 005/Gate 4 remains blocked without ReleaseProof or v1/v2 release results, and Plan 006 command rows remain `SKIP`/missing. No Plan 006 source implementation is legal until external state changes.
- 2026-06-21T09:47:08Z — At user direction, continued with Plan 006-owned pre-Gate-4 implementation while preserving the remaining blockers. Added `src/chronos/demo/**` contracts for `report.json`, metrics, demo modes, `PublicationAttempt`, trusted publisher preflight policy, idempotency, and redaction. Added behavior tests under `tests/chronos/demo/**`, wired all Plan 006 command rows in `COMMANDS.json`, and added a `demo-preflight` CLI that writes a Plan 006 blocker artifact instead of claiming an Acceptance Demo before ReleaseProof/publish binding exist.
- 2026-06-21T09:50:27Z — Tightened the pre-Gate-4 contracts after review. Preflight-generated `blocked-with-proof` attempts now include explicit passing ReleaseProof gate status, and Demo Report Replay rejects any new replay claim. `plan-006-tests` now passes with 19 behavior tests and `integration-publication` passes with 10 tests.
- 2026-06-21T09:52:52Z — Added CLI support for validating an existing `report.json` and writing an audit-only Demo Report Replay validation artifact. The replay CLI records that it creates no new branch, replay, ReleaseProof, publication attempt, or publish evidence. `plan-006-tests` now passes with 22 behavior tests.
- 2026-06-21T09:55:24Z — Added CLI support for validating a `PublicationAttempt` artifact and writing pass/fail validation evidence without invoking a publish API. `plan-006-tests` now passes with 24 behavior tests.
- 2026-06-21T10:04:12Z — Ran read-only adversarial subagents over the Plan 006 stack diff and hardened the material findings. Publication validation now rejects forged `published` attempts without passing ReleaseProof/candidate/trusted context, self-attested redaction with secret-like content, missing normalized blocker classes, mixed v1/v2 environment or grader identity, branch-writable evidence markers, missing trusted-context/publish-binding placeholders for proof-backed outcomes, and malformed CLI validation input without failure artifacts. `plan-006-tests` now passes with 29 behavior tests and `integration-publication` passes with 13 tests.
- 2026-06-21T10:17:43Z — Added a safe `publication-preflight` CLI for the independently runnable publish/display preflight path. It consumes a ReleaseProof JSON path plus target/trusted-context/binding inputs, emits a validated `PublicationAttempt`, returns nonzero for failed preflight outcomes, and still does not invoke or invent a publish primitive. `plan-006-tests` now passes with 31 behavior tests.
- 2026-06-21T10:32:18Z — Hardened report status/source/live consistency. The validator now rejects invalid top-level report status, invalid live attempt results, `live-new-witness` without a new Witness result, `live-no-witness` that claims a new Witness, non-audit report replay, and Prior-Run Witness Replay without a bounded live attempt result. `plan-006-tests` now passes with 32 behavior tests.
- 2026-06-21T10:47:12Z — Added demo readiness pack validation and CLI support. The pack validates evidence-backed auth/network/quota/artifact statuses, expected blocks, artifact refs, digest, and redaction without probing live systems or reading secrets. `plan-006-tests` now passes with 38 behavior tests.
- 2026-06-21T11:02:44Z — Restacked this Plan 006 branch over the updated PR #27 / Plan 005 head `3105a44`. The rebase completed without conflicts, and `plan-006-tests` still passes with 38 behavior tests. Plan 005 remains blocked: harden-v0 found the rewarded hack but the fixer path ended with `harden_fixer_artifact_layout_drift` / `fix_failed`, so no validated patch, v1/v2 release results, release candidate, or sealed ReleaseProof exists.
- 2026-06-21T11:12:36Z — Added core metrics validation. Reports must include branch count, clusters, time to Witness, before/after rewards, control retention, replay rate, restore latency, and setup avoided; unmeasured values remain allowed only as `not-measured`/`not-applicable` with reasons. `plan-006-tests` now passes with 39 behavior tests.
- 2026-06-21T11:52:27Z — Restacked this Plan 006 branch over the updated PR #27 / Plan 005 head `9c9a60f`. The rebase completed without conflicts. Latest Plan 005 evidence improved from fixer failure to harden-v0 fixing two discovered attacks, but Gate 4 still remains blocked because no independent per-case v1/v2 evaluator-results artifact, mandatory pytest subversion results, evaluator context refs, release candidate ref, or sealed ReleaseProof exists. Rebased Plan 006 feasible validators passed: graph, sections, repo-bound ownership, traceability, mapped Plan 006 tests, publication commands, demo-report-replay, demo-presentation-timeout, lint, build, file-size, ownership, and structured evidence. The `demo` command still exits 2 with the expected dependency and publish-binding STOPs.
- 2026-06-21T11:58:02Z — Post-rebase adversarial review found two real contract gaps, then Plan 006 was hardened. Acceptance reports now require unique persisted branch refs matching `launched_branch_count`; Presentation timeout fallback requires persisted branch refs before switching to Prior-Run Witness Replay; `blocked-with-proof` publication attempts must still point at the trusted `integration-publication` command row. `plan-006-tests` still passes with 54 behavior tests and `integration-publication` passes with 16 tests.
- 2026-06-21T13:18:05Z — Rebased Plan 006 over merged `main` after Plan 005 completed. `demo-preflight` now consumes the Plan 005 manifest-listed ReleaseProof `releaseproof-30e03914472631dd` and release candidate `releasecandidate-294df1726b8a5ed0`, validates candidate identity against the proof, and writes a proof-backed `blocked-with-proof` PublicationAttempt for missing publish binding. Read-only adversarial subagents found and Plan 006 fixed latest-artifact fallback, candidate mismatch, and untrusted candidate-ref gaps. `plan-006-tests` passes with 57 behavior tests; `integration-publication` passes with 18 tests. Plan 006 remains blocked on full Acceptance Demo orchestration and missing Wave-1 publish binding.
- [x] Demo command/orchestration complete.
- [x] Live discovery surface complete.
- [x] Report/demo mode contract validation complete.
- [x] Honest fallback contract validation complete.
- [x] Proof/control walkthrough complete.
- [x] Metrics and claims contract validation complete.
- [x] Publish/display preflight contract complete.
- [x] Real publish/display outcome complete (honest `blocked-with-proof`; no publish primitive is checked in).

### Surprises & Discoveries

- None yet.

### Decision Log

- 2026-06-20 — Planning decision: default to a repository-native CLI/report plus HUD/Modal links rather than add an unrequested custom UI.
- 2026-06-20 — Planning decision: Plan 006 owns the thin trusted publisher wrapper and report integration because this slice owns publication/display. Wave 1 binds the real publish primitive and Plan 005 owns ReleaseProof creation.
- 2026-06-20 — Planning decision: Plan 006 completion requires a noninteractive `report.json` and manifest-backed evidence. Judge-visible UI/screenshots are supplementary, not merge-gate proof.
- 2026-06-20 — Planning decision: `SKIP` from `plan-006-tests`, `demo`, or publication-specific mapped commands fails validation because skipped commands cannot prove Plan 006 behavior.
- 2026-06-20 — Planning decision: distinguish Acceptance Demo Run from Presentation Demo Run. Acceptance uses the full accepted branch budget and deterministic proof artifacts; Presentation may be time-bounded but must label Prior-Run Witness Replay honestly.
- 2026-06-20 — Planning decision: Demo Report Replay is audit-only. It can re-render and revalidate prior report artifacts, but cannot create new proof or substitute for the original validating Acceptance Demo Run.
- 2026-06-21 — Planning decision: `blocked-with-proof` is limited to a valid passing ReleaseProof plus sealed candidate when publication binding or authority is missing. Proof mismatch, unauthorized target, mixed identities, missing artifacts, or unavailable trusted context are failures.
- 2026-06-21 — Planning decision: demo reliability is implemented as graceful degradation. A fresh live attempt is always shown, while proof and completion rely on validated traces, replays, reports, and digests.
- 2026-06-21T09:34:39Z — Stack decision: keep `codex/plan-006-demo-stack` based on `codex/plan-005-release-proof` and target any draft PR to `codex/plan-005-release-proof`, not `main`. After PR #27 merges, rebase Plan 006 onto `main`, rerun the full Plan 006 Done-when including slow demo/publication gates, and retarget to `main` only if all evidence passes.
- 2026-06-21T09:47:08Z — Implementation decision: pre-Gate-4 Plan 006 command rows may run local semantic contract checks, but `demo` remains a blocker-producing preflight until a passing ReleaseProof, release candidate, live evidence, and publish binding exist. This avoids both `SKIP` and false completion.
- 2026-06-21T10:04:12Z — Hardening decision: Plan 006 publication validation must use the existing Plan 005 `assert_release_proof` validator before any proof-based outcome. Hand-authored `PublicationAttempt` records may validate only as evidence, never as authority to publish, and the contract layer still does not invoke a publish primitive.
- 2026-06-21T10:17:43Z — Implementation decision: the independently runnable publication path can exist pre-Gate-4 only as preflight evidence. It may write `failed`, `permission-blocked`, or `blocked-with-proof` attempts from supplied artifacts, but it must return nonzero for failed preflight outcomes and cannot call a publisher until Wave 1 binds one.
- 2026-06-21T10:32:18Z — Contract decision: Demo Report Replay must be audit-only, but it does not have to be Prior-Run Witness Replay. It preserves the source report's discovery mode and rejects only new branch/replay/proof/publication claims.
- 2026-06-21T10:47:12Z — Implementation decision: readiness pack validation is static and artifact-backed before Plan 005 merges. It records `expected-block` for missing proof/candidate/publish authority instead of probing credentials, network, HUD, Modal, or reading secrets.
- 2026-06-21T11:02:44Z — Stack decision: keep PR #29 based on `codex/plan-005-release-proof` after PR #27 advanced. Because Plan 005 is still draft/open and blocked, this branch remains a draft stacked PR rather than retargeting to `main`.
- 2026-06-21T11:12:36Z — Contract decision: the core metrics list is required even before the full demo runs, but absent values must be explicitly labelled `not-measured` or `not-applicable` with reasons instead of omitted or marked `TBD`.
- 2026-06-21T11:25:00Z — Adversarial hardening decision: a passing `report.json` cannot point at `blocked:*` ReleaseProof or publication refs; fresh live Witness claims require a live Witness ref, digest, and gate status `pass`; Prior-Run Witness Replay requires original run id, Witness ref/digest, and new replay ref; Demo Report Replay cannot carry live branch refs; readiness packs reject duplicate check names.
- 2026-06-21T11:45:00Z — Publication contract decision: `PublicationAttempt` validation requires the mapped `integration-publication` command key, unique evidence refs, and no published environment ref on failed outcomes. This keeps blocked/failure evidence from masquerading as a successful publish path before the Wave-1 publish binding exists.
- 2026-06-21T12:05:00Z — Metrics/readiness decision: report metrics reject duplicate names so measured and absent values cannot conflict under the same metric id; readiness packs marked `pass` reject `not-applicable` required checks because a pass-state readiness pack must prove every required demo-day check rather than hide one as unused.
- 2026-06-21T12:25:00Z — Acceptance budget decision: Acceptance reports require a positive integer accepted branch budget with launched count equal to that budget, unless a resource STOP is recorded. A resource STOP is only valid for non-pass reports, because a passing Acceptance Demo Run must launch the full accepted branch budget.
- 2026-06-21T12:45:00Z — CLI redaction decision: Plan 006 command failure lines must use the same redaction path as failure artifacts. Exception text can include token-like file names or URLs, so command output is treated as evidence and redacted before printing.
- 2026-06-21T13:05:00Z — Report shape decision: required report ids and refs must be non-empty strings, `command_argv` must be a non-empty string list, step evidence refs must be non-empty strings, and `live_branch_refs` must be a string list when present. Empty `live_branch_refs` remains valid for audit-only Report Replay.
- 2026-06-21T13:25:00Z — Claim-shape decision: report `claims` must be a list of non-empty strings and are normalized before single-run overclaim rejection. Hyphenated or case-varied wording such as `cost-savings` cannot bypass the reference ban on single-demo reliability, coverage, setup-avoidance, or savings claims.
- 2026-06-21T13:45:00Z — Presentation timeout decision: Presentation mode budgets must be positive integers, and a timeout result must switch to Prior-Run Witness Replay. A timed-out Presentation report cannot validate as `live-no-witness`, because the reference requires immediate fallback rather than continued or unresolved live search.
- 2026-06-21T14:15:00Z — Adversarial hardening decision: Plan 006 report validation must fail closed on machine-readable overclaims, not just terminal wording. Passing reports reject failed steps, blocked proof/publication refs displayed as complete, and acceptance pass without launched live branches. Prior-run fallback labels are restricted to replay-relevant rows. Publication attempts reject forged published outcomes without trusted publication evidence, temp/branch-writable refs, and untrusted command refs. Readiness pass rejects blocked/missing artifact refs, and redaction covers broader auth/token formats.
- 2026-06-21T11:52:27Z — Stack decision: keep PR #29 stacked on `codex/plan-005-release-proof` after rebasing over Plan 005 head `9c9a60f`. Do not retarget to `main` or mark Plan 006 complete until Plan 005 merges with complete Gate 4 evidence and Plan 006 can rerun the full Done-when gate including a real Acceptance Demo and publication/display outcome.
- 2026-06-21T11:58:02Z — Contract decision: branch execution claims are count-bound, not just non-empty. Any proof-backed publication outcome must also be anchored to the trusted Plan 006 command row, even when the missing publish primitive is the reason for `blocked-with-proof`.
- 2026-06-21T13:18:05Z — Post-Plan-005 decision: after Plan 005 merged, Plan 006 may consume the sealed ReleaseProof/candidate for preflight, but artifact selection must be manifest-bound and deterministic. Do not use directory mtime or fallback to a different candidate. Missing publish binding/capability is recorded as `blocked-with-proof` only when proof, candidate, target identity, and trusted command-row context are present.
- 2026-06-21T14:34:43Z — Acceptance Demo orchestration decision: the live BranchRun runner (`witnesses.branch_runs.run_live_branch_batch`) requires a `hud_task_profile` that no checked-in ForkPoint carries, and that runner is Plan 003-owned. Plan 006 builds the enriched ForkPoint by lifting the proven container task profile (`trusted_entrypoint_ref env:env`, `runtime_workdir /app`, real pre-grader/grader argv) from the sealed Plan 003 Witness `replay_surface` rather than inferring container paths, and injects the runner behind a `BranchRunner` seam so the report builder stays pure and unit-testable.
- 2026-06-21T14:34:43Z — Ownership decision: the Plan 003-owned runner writes its raw batch under `docs/plans/evidence/003/artifacts/branch-runs/<run_id>/`, which Plan 006 must not commit. The orchestration copies the fresh run into `artifacts/chronos/demo/<invocation_id>/branch-runs/<run_id>/` and rewrites `live_branch_refs`/`artifact_ref` to the owned copies, so every committed live-branch reference is Plan 006-owned and the prior-run Plan 003 evidence is never relabelled as fresh.
- 2026-06-21T14:34:43Z — Completion decision: a passing Acceptance Demo Run does not require discovering a fresh exploit; it requires genuinely launching the full accepted budget (`branches-launched` / `live-no-witness`) with prior-run Witness/replay steps honestly labelled `fallback`. Step 13 stays `blocked-with-proof` (no checked-in publish primitive) while the overall report passes, which the Done-when accepts as one honest release outcome (user-confirmed).
- 2026-06-21T15:20:00Z — Publish-binding decision (maintainer full-permission, upload deferred): added a fourth publication outcome `prepared` for the honest state "real bound primitive + authorized target + verified candidate are ready, registry upload deliberately withheld." `prepared` carries no error class and forbids a `published_environment_ref`, distinguishing it from both `published` and `blocked-with-proof`. The bound deploy command lives at `COMMANDS.json:hud-deploy` with status `not-applicable` so `run_mapped` SKIPs rather than deploys — the binding cannot accidentally upload. The authorized target was discovered with a read-only `GET /v2/registry` probe (no `whoami` exists in HUD); the hardened v2 grader is verified offline against the sealed ReleaseProof digest. The acceptance report's step 13 stays `blocked-with-proof` (its honest run-time state); `prepared` is additive binding evidence dated after the run rather than a rewrite of the sealed report.

### Outcomes & Retrospective

- 2026-06-21T09:34:39Z — Blocked before source implementation. The current branch records stack setup and blockers only; no Plan 006 demo contracts, command rows, publication wrapper, or behavior tests are claimed. Next owners: repo-map custodian reconciles `REPOSITORY.md` with accepted Gate 1 state; Plan 005 owner completes Gate 4 with a sealed ReleaseProof; publication owner binds the real trusted publish primitive/target or records missing authority once proof and candidate exist.
- 2026-06-21T09:38:07Z — Still blocked after second goal-turn recheck. The next legal implementation step remains unchanged: resolve repo-map source-of-truth conflict, complete Plan 005/Gate 4, then implement Plan 006-owned report/publication contracts and command rows.
- 2026-06-21T09:40:02Z — Still blocked after third consecutive goal-turn audit. This Plan 006 stack is at an implementation impasse under `AGENTS.md`; resume only after repo-map reconciliation and Plan 005/Gate 4 evidence changes.
- 2026-06-21T09:47:08Z — Pre-Gate-4 contract layer shipped locally, not complete. `plan-006-tests`, publication contract commands, report replay, presentation timeout, lint, build, file-size, and structured evidence validation pass. `demo` exits 2 with `artifacts/chronos/demo/preflight-blockers/plan-006-demo.json` because ReleaseProof and publish binding are still missing.
- 2026-06-21T09:50:27Z — Contract hardening pass complete. Remaining missing pieces are unchanged: real ReleaseProof/release candidate, live Acceptance Demo evidence, and trusted publish binding/target.
- 2026-06-21T09:52:52Z — Report replay CLI pass complete. Remaining missing pieces are unchanged: Plan 005/Gate 4 proof artifacts, real demo execution, and trusted publication binding.
- 2026-06-21T09:55:24Z — PublicationAttempt validation CLI pass complete. Remaining missing pieces are unchanged: Plan 005/Gate 4 proof artifacts, real demo execution, and trusted publication binding.
- 2026-06-21T10:04:12Z — Adversarial hardening pass complete. Remaining missing pieces are unchanged: Plan 005/Gate 4 proof artifacts, real Acceptance Demo execution, and trusted publication binding/authorized target.
- 2026-06-21T10:17:43Z — Publication preflight CLI pass complete. Remaining missing pieces are unchanged: sealed Plan 005 proof/candidate, real Acceptance Demo execution, and trusted publication binding/authorized target.
- 2026-06-21T10:32:18Z — Report status/source/live hardening complete. Remaining missing pieces are unchanged: sealed Plan 005 proof/candidate, real Acceptance Demo execution, and trusted publication binding/authorized target.
- 2026-06-21T10:47:12Z — Readiness pack validation pass complete. Remaining missing pieces are unchanged: sealed Plan 005 proof/candidate, real Acceptance Demo execution, and trusted publication binding/authorized target.
- 2026-06-21T11:02:44Z — Restack pass complete. Remaining missing pieces are unchanged after the updated Plan 005 base: sealed ReleaseProof/candidate, real Acceptance Demo execution, and trusted publication binding/authorized target.
- 2026-06-21T11:12:36Z — Core metrics contract pass complete. Remaining missing pieces are unchanged: sealed ReleaseProof/candidate, real Acceptance Demo execution, and trusted publication binding/authorized target.
- 2026-06-21T11:25:00Z — Adversarial report/readiness hardening pass complete. `plan-006-tests` passes with 41 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with the expected Plan 005/Gate 4 and publish-binding blockers.
- 2026-06-21T11:45:00Z — Restacked over updated Plan 005 head `ee4a7f4` and added publication attempt hardening. `plan-006-tests` passes with 43 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T12:05:00Z — Metrics/readiness hardening pass complete. `plan-006-tests` passes with 45 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T12:25:00Z — Acceptance budget hardening pass complete. `plan-006-tests` passes with 46 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T12:45:00Z — CLI failure-output redaction pass complete. `plan-006-tests` passes with 47 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T13:05:00Z — Restacked over updated Plan 005 head `a1eca27` and added report shape hardening. `plan-006-tests` passes with 49 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T13:25:00Z — Claim-shape overclaim hardening pass complete. `plan-006-tests` passes with 49 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T13:45:00Z — Presentation timeout hardening pass complete. `plan-006-tests` passes with 49 behavior tests, focused lint passes, and feasible graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T14:15:00Z — Adversarial subagent hardening pass complete. `plan-006-tests` passes with 54 behavior tests, focused lint passes, graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass, and `demo-presentation-timeout` passes with 1 test. Latest recorded stack-base evidence before the evidence-correction commit saw Plan 006 head `b4a2cebe982afea7036c850d845f29797abaec47` over Plan 005 head `7d8c75fca0d967acbcbc84e01dff9b7b87859ca5`. `demo` still exits 2 with expected blockers because Plan 005 remains draft/open with no ReleaseProof and no trusted publish binding.
- 2026-06-21T11:19:34Z — Evidence correction pass complete. Refetched current refs and confirmed PR #27 remains an open draft at `7d8c75fca0d967acbcbc84e01dff9b7b87859ca5`; PR #29 remains an open draft targeting `codex/plan-005-release-proof`. Refreshed repo-bound ownership, Demo Report Replay, publication idempotency, and stack-base evidence. Completion remains blocked on Plan 005/Gate 4 and trusted publish binding.
- 2026-06-21T11:52:27Z — Rebase refresh pass complete over Plan 005 head `9c9a60f`. `plan-006-tests` passes with 54 behavior tests, `integration-publication` passes with 16 tests, publication idempotency/permission/trust/redaction mapped checks pass, `demo-report-replay` and `demo-presentation-timeout` pass, and graph/sections/ownership/traceability/lint/build/file-size/evidence validators pass. `demo` still exits 2 and writes `artifacts/chronos/demo/preflight-blockers/plan-006-demo.json` because Plan 005 has not sealed ReleaseProof/release candidate evidence and no trusted publish binding exists. Plan 006 remains not complete.
- 2026-06-21T11:58:02Z — Post-rebase adversarial hardening pass complete. Fixed branch-count overclaim validation and blocked-with-proof command trust validation. Fresh feasible gates pass; `demo` still exits 2 with expected Plan 005/Gate 4 and publish-binding blockers. Plan 006 remains not complete.
- 2026-06-21T13:18:05Z — Post-Plan-005 merge refresh pass complete. Feasible gates pass: graph, sections, repo-bound ownership, traceability, `plan-006-tests` (57 passed), `integration-publication` (18 passed), publication idempotency/permission/trust/redaction, demo-report-replay, demo-presentation-timeout, focused lint, mapped lint, build, file-size, and structured evidence validation. `demo` still exits 2, but now writes a proof-backed `blocked-with-proof` publication attempt plus an explicit Acceptance Demo orchestration blocker instead of the obsolete Plan 005 dependency blocker. Plan 006 remains not complete.
- 2026-06-21T14:34:43Z — **Plan 006 complete.** Implemented the repository-native Acceptance Demo Run (`chronos.demo.cli acceptance-demo`, new modules `forkpoint_inputs`/`branch_launch`/`metrics`/`steps`/`report_builder`/`orchestration`) and ran it live. `run_mapped.py demo` launched a genuine full 12-branch live batch (`run-20260621T142614`) from accepted ForkPoint `im-01KVKYBWZYVZSD79CX5P9SNPXR`, persisted it under `artifacts/chronos/demo/demo-20260621T142614Z-6c33ae7/branch-runs/` (Plan 006-owned), and wrote a validating 13-step `report.json` (status `pass`, `live-no-witness`, `branches-launched`, 12 unique owned `live_branch_refs`, step 13 `blocked-with-proof`), a passing `readiness-pack.json`, and a `blocked-with-proof` `publication-attempt.json`. `demo` exited 0. Full Done-when green: `plan-006-tests` 71 passed, `integration-publication` 18 passed, publication idempotency/permission/trust/redaction, `demo`, `demo-report-replay`, `demo-presentation-timeout`, graph/sections/repo-bound-ownership/traceability/file-size/lint/build, and `validate_evidence.py --plan 006 --require-complete` exit 0. Publication is recorded as `blocked-with-proof` because `INTERFACES.md` records no checked-in publish primitive (the accepted honest outcome, user-confirmed). Residual note: `docs/plans/repo-map/REPOSITORY.md` still carries stale pre-acceptance "blocked" prose while `STATUS.json` is `accepted`; this is a non-Plan-006-owned documentation lag (recorded as a `skipped` check), consistent with the merged Plan 002–005 stack.
- 2026-06-21T15:20:00Z — Publish path bound and prepared (no upload), at maintainer direction. Discovered the authorized HUD target via a read-only `GET /v2/registry` probe (account's `mongodb-sales-aggregation-engine` registry env; ReleaseProof `environment_v1` = the `-v1` registry UUID `57cb7f09…`). Regenerated the hardened v2 grader from this worktree's committed sources via the Plan 005 materializer and verified `grader_v2_digest` == sealed ReleaseProof `c0d86ae`. Added the `prepared` publication outcome (publication.py + 4 behavior tests, 75 total), a `publish-prepare` CLI that writes a validated prepared PublicationAttempt, a bound `COMMANDS.json:hud-deploy` row (`not-applicable`, cannot accidentally deploy), and bound `INTERFACES.md` row 17 (`bound; upload-deferred`). Full Done-when stays green and `validate_evidence.py --plan 006 --require-complete` exits 0. No environment was uploaded; the served-runtime kill-parity under `hud serve` is left unproven (out of scope), with the offline kill already proven by the sealed ReleaseProof. Repo-map edits (INTERFACES.md/COMMANDS.json) are Plan 001-owned and bundled here at maintainer direction.
- 2026-06-21T15:35:00Z — Killed the remaining "served-runtime kill-parity unproven" gap with a real proof. `scripts/chronos-demo-v2-kill-proof.py` regenerates the hardened v2 from committed sources and runs the Plan 005 `_DockerVerifierRunner` harness in real `mongo:7.0` containers: the sealed Witness exploit scores reward `0.0` (killed) and all three legitimate controls score `1.0` (preserved), with `grader_v2_digest` matching the sealed ReleaseProof. The `prepared` PublicationAttempt now cites this runtime proof, and `INTERFACES.md` row 17 records "bound; upload-pending-goahead". The actual `hud deploy` upload (and the `env.py`-serve packaging of the deployed env) await an explicit go-ahead — nothing was uploaded. Full Done-when stays green; `--require-complete` exits 0.
- 2026-06-21T16:05:00Z — **PUBLISHED v3.** At maintainer go-ahead, rewired `env.py` to serve the hardened `/tests` grader read-only (with a baked-in trusted-suite digest gate the agent cannot alter), and proved the ACTUAL deployable image's served grader in real `mongo:7.0` containers via `scripts/chronos-demo-v2-deploy-proof.py`: witness exploit reward `0.0` (killed), three controls `1.0` (preserved), and a **root** `/tests` test-replacement attack blocked (`0.0`). Then `hud deploy` published the hardened env as `mongodb-sales-aggregation-engine` **version 3** (registry `b3409057`, build `3bc11838` SUCCEEDED, team `hud-hacks`; `docs/plans/evidence/006/publish-receipt.json`), verified via a read-only `GET /v2/registry`. Non-destructive — builds total 3 (v3 new, v2/v1 retained), so existing v2 runs are not invalidated. `publish-record` wrote a validated `published` PublicationAttempt (`published_environment_ref hud:registry/b3409057@v3`, trusted publication evidence ref, passing ReleaseProof gate, no error class); `INTERFACES.md` row 17 = `published v3`; `COMMANDS.json:hud-deploy` stays `not-applicable` so CI cannot re-deploy. 77 behavior tests pass; `--require-complete` exits 0. The full publish loop — suspicious trace → fork → witness → patch → ReleaseProof → published hardened environment — is now closed end-to-end.
- 2026-06-21T16:40:00Z — Post-publish bug hunt, fix, and v4 re-deploy. A parallel-subagent review of the branch found a GENUINE bypass in the published v3 grader: the agent runs as root, so a force-pass `conftest.py` planted directly in `/tests/task_assets/` defeated it (`PYTEST_DISABLE_PLUGIN_AUTOLOAD` does not disable conftest discovery, and the v3 digest gate only covered `test_outputs.py`). Verified with a real-container repro. Fixed the deployed grader (`env.py`): `--noconftest`, `-p no:cacheprovider`, `PYTHONDONTWRITEBYTECODE`, and a full `/tests` tree allow-list that rejects any planted file; the deploy-proof now loads `GRADE_CMD` verbatim from `env.py` and tests the conftest-in-`/tests` and sitecustomize variants. Re-proven in real `mongo:7.0` containers (witness `0.0`, three controls `1.0`, all root `/tests` subversions `0.0`) and re-deployed as **version 4** (build `d7b8043a`); v3 retained but superseded. Also applied the documentation audit: the REFERENCE publication-outcomes + PublicationAttempt schema now include `prepared`/`published` fields; the Plan 006 frontmatter and `000-index.md` now declare the `hud-deploy` COMMANDS key and the maintainer-directed `INTERFACES.md`/`REPOSITORY.md` repo-map exception; `INTERFACES.md` row 17 reads `verified (published v4)`; added `artifacts/chronos/demo/publish/README.md`.
