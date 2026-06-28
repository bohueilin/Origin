# Plan 006 reference — demo evidence matrix

## Thirteen required steps

| # | Operator-visible step | Required evidence |
|---:|---|---|
| 1 | Open suspicious HUD trace | Stable trace id/link and reward |
| 2 | Show QA verdict and file evidence | QA result plus step-level diff |
| 3 | Show selected ForkPoint | ForkPoint id, boundary, snapshot/history/grader |
| 4 | Start genuine stochastic branches | New run id and launch event |
| 5 | Show branch ids/traces populating | Persisted BranchRun/trace links |
| 6 | Inspect one exploit and file diff | Candidate/Witness evidence |
| 7 | Save Exploit Witness | Sealed Witness id/digest |
| 8 | Add it to ProofSet | ProofSet/taskset membership |
| 9 | Apply verifier patch | harden-v0 fixer and patch ref |
| 10 | Replay Witness against v2 | Trace/result showing failure reward |
| 11 | Rerun legitimate controls | All control traces/results showing success |
| 12 | Show ReleaseProof | Passing gate, v1/v2 identities |
| 13 | Publish/display hardened version | PublicationAttempt plus published env id, prepared candidate, or blocked candidate |

The report records `passed`, `displayed`, `fallback`, or `blocked-with-proof` as appropriate. It must never call a skipped step passed.

## Demo modes and replay types

**Acceptance Demo Run**:
The noninteractive merge-gate mode. It launches the full accepted branch budget, defaulting to the Plan 003 core count of 12 BranchRuns unless the accepted repo map records a different value. Acceptance does not require a fresh live Witness discovery; completion is proven by stable live branch ids, sealed Witness replay, ReleaseProof, publication/display evidence, and a validating `report.json`.

**Presentation Demo Run**:
The judge-facing timing mode. It launches real stochastic branches through the same scheduler, but may use a shorter presentation budget. If no new Witness appears within that window, it must switch to Prior-Run Witness Replay with a visible fallback label and original run identity.

**Live Discovery Attempt**:
A real stochastic branch launch from the selected ForkPoint. It proves scheduler activity and branch provenance, not guaranteed exploit discovery.

**Prior-Run Witness Replay**:
Live restore and execution of a sealed Witness from a previous genuine stochastic run. It must record the original run id, original Witness id/digest, and new replay id. It is valid proof only when it executes against the pinned environment/grader rather than replaying a video, terminal transcript, or static report.

**Demo Report Replay**:
Audit-only re-rendering and revalidation of a previous `report.json` and its immutable evidence refs. It is useful for review, handoff, or judge walkthroughs when remote systems are unavailable, but it must preserve the original invocation identity and must not claim a new branch run, replay, ReleaseProof, publication attempt, or publish result.

The report records `demo_mode`: `acceptance`, `presentation`, or `report-replay`. It records `discovery_source`: `live-new-witness`, `live-no-witness`, or `prior-run-replay`.

## Demo-day reliability guardrails

Plan 006 is designed for a hackathon-style demo where live systems are valuable but fragile. Treat the live branch launch as the credibility signal and the sealed evidence pack as the proof path.

- Run a timed preflight 30-60 minutes before the demo. Verify HUD auth, Modal auth, model gateway auth, publish permission or expected permission denial, network reachability, quota/rate-limit headroom, source trace link, prior-run Witness artifact, replay entrypoint, ReleaseProof digest, release candidate, and local artifact paths.
- Keep a sealed demo readiness pack checked by digest: source trace export/link, ForkPoint id, prior-run Witness, replay entrypoint, ProofSet, ReleaseProof, metrics report, PublicationAttempt or expected block, screenshots, and optional short recording. The pack is presentation backup only; ids, traces, commands, and digests remain the proof.
- Rehearse the exact command path at least three ways: live discovery times out, publish permission is denied, and an external service is unavailable.
- Keep the live branch attempt bounded by a fixed presentation budget. When the budget expires, switch immediately to Prior-Run Witness Replay. Do not wait on "one more branch" during judging.
- Avoid fragile browser/tab choreography. Prefer one operator command plus stable HUD/Modal links. If browser views are used, open them before the demo and ensure the raw ids are present in `report.json`.
- Treat auth, quota, network, and hosted-service failures as explicit states such as `external-service-degraded`, `live-search-unavailable`, or `publish-permission-blocked`, each with an artifact-backed fallback path.
- The fallback narration must be explicit: "The live search is running; stochastic discovery is not guaranteed inside the time box. To prove durability, this replay restores sealed Witness `<id>` from run `<id>`."
- Do not regenerate source traces, controls, Witnesses, ProofSets, ReleaseProofs, or release candidates during the presentation path.

These guardrails follow the same reliability shape as graceful degradation: preserve the core outcome when a dependency is degraded, while keeping the degraded behavior simple and visible ([Google Cloud reliability guidance](https://docs.cloud.google.com/architecture/framework/reliability/graceful-degradation), [Google SRE graceful degradation](https://sre.google/sre-book/addressing-cascading-failures/)).

## Presentation-window fallback

Suggested flow:

1. Start the 12-branch run or a presentation-bounded subset that still uses the real scheduler.
2. Display live branch creation and status.
3. Wait only for the configured presentation budget.
4. If no new Witness is sealed, print a plain-language fallback notice.
5. Load a prior sealed Witness generated by Plan 003.
6. Show original run id/time and artifact digest.
7. Restore and replay it live.
8. Continue at ProofSet/patch proof.

The core artifact still came from genuine stochastic discovery; the live action proves durability and replay.

## Metrics provenance

The report should include an `evidence_ref` beside each metric. A value can be:

- numeric/string with evidence,
- `not-measured` with reason,
- `not-applicable` with reason.

Do not display `TBD` as though it were a result after the run.

## Publication outcomes

`published` requires a stable HUD environment/version reference.  
`permission-blocked` requires a sealed candidate, passing ReleaseProof, attempted trusted command, and authorization error.  
`blocked-with-proof` requires a passing ReleaseProof, sealed candidate, trusted-context preflight, and absent Wave 1 publish binding or missing publish authority. It proves the hardened candidate is ready but cannot be released through an authorized target.
`prepared` requires a passing ReleaseProof, sealed candidate, trusted-context preflight, a real bound publish primitive plus authorized target, and a `deferred_deploy_command_ref` plus `deferred_reason`. It proves the hardened candidate is verified and ready to upload while the registry upload is deliberately withheld; it carries no error class and must not carry a `published_environment_ref`.
`failed` covers proof mismatch, unauthorized target, mixed environment/grader identity, missing release artifact, unavailable trusted context, and other publication errors. It is not a completed publication outcome.

## Machine-readable demo report

The demo writes `artifacts/chronos/demo/<invocation_id>/report.json`. The report is the merge-gate source of truth; terminal output, screenshots, and live UI are derived views.

Required fields:

- `schema_version`
- `invocation_id`
- `command_argv`
- `commit`
- `started_at`
- `finished_at`
- `status`
- `demo_mode`: `acceptance`, `presentation`, or `report-replay`
- `discovery_source`: `live-new-witness`, `live-no-witness`, or `prior-run-replay`
- `live_attempt_id`
- `live_attempt_result`
- `proof_source`
- `source_invocation_id` when `demo_mode` is `report-replay`
- `steps[]`
- `metrics[]`
- `release_proof_ref`
- `publication_attempt_ref`
- `content_digest`

Each `steps[]` entry contains:

- `step_number`
- `label`
- `status`: `passed`, `displayed`, `fallback`, `blocked-with-proof`, or `failed`
- `evidence_refs[]`
- `observed_behavior`
- `started_at`
- `finished_at`

Each `metrics[]` entry contains:

- `name`
- `value`, `not-measured`, or `not-applicable`
- `reason` when the value is absent
- `evidence_ref` when the value is present

A validator must reject:

- missing or duplicated step numbers;
- fewer or more than 13 steps;
- any non-failed step without a non-screenshot evidence ref;
- `TBD` as a result value;
- screenshot-only proof;
- unlabeled prior-run fallback;
- live-discovery claims without new branch/run ids;
- report replay that claims new branch, replay, ReleaseProof, publication, or publish evidence;
- Presentation Demo Run without a bounded live discovery attempt;
- Presentation Demo Run that continues live search beyond the configured presentation budget instead of switching to fallback;
- Acceptance Demo Run without the full accepted branch budget or an evidence-backed resource STOP;
- claims that a fresh exploit was found unless the live run produced a Witness that passed all Witness gates;
- discovery probability, reliability, success-rate, coverage, cost-savings, or setup-avoidance claims from a single demo run;
- `published` without a stable environment/version ref;
- mismatched ReleaseProof digest, environment identity, grader identity, or target.

## PublicationAttempt record

Plan 006 records one append-only `PublicationAttempt` for every publish/display invocation, including blocked attempts. Secret values never appear in this record.

Required fields:

- `schema_version`
- `publication_attempt_id`
- `release_proof_id`
- `release_proof_digest`
- `target_id`
- `publisher_capability_label`
- `command_key`
- `command_argv_ref`
- `trusted_context_ref`
- `idempotency_key`
- `outcome`: `published`, `prepared`, `permission-blocked`, `blocked-with-proof`, or `failed`
- `published_environment_ref` or `release_candidate_ref`
- `release_proof_gate_status` (`pass`) for any proof-backed non-`failed` outcome
- `trusted_publication_evidence_ref` when `outcome` is `published` (must also appear in `evidence_refs`)
- `deferred_deploy_command_ref` and `deferred_reason` when `outcome` is `prepared`
- `normalized_error_class` when blocked or failed
- `evidence_refs[]`
- `redaction_status`
- `created_at`
- `content_digest`

The idempotency key is derived from ReleaseProof content digest plus target id. Repeating a publish/display operation with the same key must return the existing published ref or blocked candidate and must not mutate sealed ReleaseProof artifacts.

Publish evidence must use least-privilege, short-lived or federated authority where available. Logs, reports, screenshots metadata, command output, exception text, and evidence manifests must redact tokens, Authorization headers, cookies, secret environment variables, signed URLs, and full subprocess environments. Record capability labels and principal labels, not secret values. This follows general least-privilege and temporary-credential guidance for automation surfaces ([AWS IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html), [OWASP Secrets Management](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)).

## Self-validation matrix

| Command | Required proof |
|---|---|
| `plan-006-tests` | Contract tests reject proof mismatch, unauthorized target, mixed identities, missing artifacts, duplicate retry, fake live branch ids, unlabeled fallback, screenshot-only proof, and invalid report status. |
| `integration-publication` | Validates trusted publication preflight/outcome contracts locally without invoking a publish API; the real bound primitive is `COMMANDS.json:hud-deploy`, exercised out-of-band and recorded in the publish receipt. |
| `publication-idempotency` | Duplicate publish/display invocation returns the same published ref or blocked candidate and proves no duplicate version or proof mutation. |
| `publication-permission-denied` | Missing or denied publish credential records `permission-blocked` with candidate id, attempted trusted action, target, and normalized authorization error. |
| `publication-trust-boundary` | Untrusted branch, fixer sandbox, and demo UI contexts cannot read publish credentials or invoke the publish primitive. |
| `publication-redaction` | Fake token-like values in stdout/stderr, exception text, environment snapshots, report JSON, screenshots metadata, and manifest entries are redacted. |
| `demo` | Noninteractive Acceptance Demo Run emits the validating 13-step `report.json`, launches the full accepted branch budget, links every evidence-bearing step, and records live discovery or honest fallback. |
| `demo-report-replay` | Re-renders and revalidates an existing `report.json`, preserves the source invocation id, labels itself audit-only, and rejects any claim of new branch/replay/publication evidence. |
| `demo-presentation-timeout` | Presentation mode forces the timeout path, switches to Prior-Run Witness Replay without waiting for another branch, and records original run id, fallback reason, and new replay result. |

Any `SKIP` from a Plan 006 mapped command is a failed validation. `run_mapped.py` may use `SKIP` for unavailable future commands during planning, but a skipped command cannot complete Plan 006.

## Screenshot policy

Use screenshots for judge-visible HUD/Modal views when they clarify the flow. Preserve underlying ids/exports in the manifest; screenshots alone are insufficient proof.
