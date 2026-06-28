# Assumptions log

Each entry uses **claim → decision → why → what would change it**. Tags identify checks for a repository-connected pass. These assumptions unblock planning; they are not verified facts.

## A-001 — Proposed feature paths

- **Tags:** `verify-against-repo`, `architecture`
- **Claim:** The repository layout is unavailable, but every plan requires exact collision-free ownership globs.
- **Decision:** Use proposed new feature boundaries under `src/chronos/**`, `tests/chronos/**`, `fixtures/chronos/**`, and `artifacts/chronos/**`. Wave 1 must accept them or bind them to real repository-native paths before source edits.
- **Why:** This preserves parallel ownership without pretending the paths already exist.
- **What would change it:** A repository tree showing a different package root, test layout, monorepo boundary, or established feature-folder convention.

## A-002 — Primary implementation language

- **Tags:** `verify-against-repo`, `toolchain`
- **Claim:** The handoff names HUD Python v0.6.4 and harden-v0, but the actual project configuration is unseen.
- **Decision:** Plans describe behavior and use mapped commands rather than assert Python module signatures. Validator scripts themselves use Python 3 standard library.
- **Why:** The likely toolchain should not become an invented repository fact.
- **What would change it:** Root build files or existing integration code proving another language or mixed-language boundary.

## A-003 — harden-v0 integration shape

- **Tags:** `verify-against-repo`, `integration`
- **Claim:** The handoff says to fork harden-v0 directly, but does not expose whether it is vendored, a dependency, a subtree, or an external service.
- **Decision:** Treat `https://github.com/few-sh/harden-v0` as the known upstream source. Plan 001 must still record how this repository pins or links it before source work: fork, submodule, vendored copy, package dependency, or external checkout. Plan 005 requires a thin repository-native adapter around the verified fixer/replay/dedup behavior and forbids reimplementation.
- **Why:** Reuse is required, but the URL alone is not an executable repository integration. The adapter shape and clone location depend on the repo-bound ownership map, dependency policy, and exact grader path.
- **What would change it:** Existing first-class integration points that eliminate the need for a new adapter.

## A-004 — HUD APIs and exports

- **Tags:** `verify-against-repo`, `integration`
- **Claim:** The handoff defines required HUD concepts and fields but not callable signatures, payload schemas, authentication, or export formats.
- **Decision:** Specs define logical records and invariants only. Plan 001 must bind trace, file evidence, QA, taskset, version comparison, and publishing operations to real code.
- **Why:** Naming SDK functions now would be fabrication.
- **What would change it:** The relevant adapter source, SDK lockfile, and representative trace/QA payloads.

## A-005 — Modal snapshot APIs

- **Tags:** `verify-against-repo`, `integration`
- **Claim:** The handoff names snapshot profiles and conceptual operations, but exact installed SDK signatures and account capabilities are unknown.
- **Decision:** The core design requires a Directory-or-Filesystem path selected from verified capabilities; Memory and VM paths remain conditional research work.
- **Why:** The core must not depend on private Alpha access.
- **What would change it:** Installed SDK source, capability probes, or an existing wrapper with stable repository-native operations.

## A-006 — Persistence backend

- **Tags:** `verify-against-repo`, `persistence`
- **Claim:** No database, object store, artifact registry, or schema framework is visible.
- **Decision:** Persist versioned content-addressed manifests through the repository's existing backend; use JSON examples only as wire-format illustrations, not a mandated database.
- **Why:** Durable objects need a contract, while backend choice must remain local.
- **What would change it:** Existing models, migrations, storage interfaces, or an artifact-store convention.

## A-007 — Operator surface

- **Tags:** `verify-against-repo`, `product`
- **Claim:** The handoff specifies what the judge sees but does not require a custom frontend.
- **Decision:** Plan 006 targets a repository-native CLI/orchestrator plus HUD/Modal links and generated evidence reports. It adds no standalone web UI unless one already exists and materially reduces work.
- **Why:** A new UI would be speculative and risky in a 24-hour build.
- **What would change it:** Existing UI routes/components designed for this workflow or an explicit product requirement for interactive controls.

## A-008 — Source trace availability

- **Tags:** `verify-against-repo`, `fixture`
- **Claim:** The must-ship flow assumes one reward-1 suspicious trace, but no export is included.
- **Decision:** Plan 001 treats a real source trace as a hard prerequisite and records its immutable identifier/export location.
- **Why:** A fabricated trace cannot prove trace-to-state binding.
- **What would change it:** A checked-in or accessible trace export with stable identifiers and file evidence.

## A-009 — MongoDB task materialization and license

- **Tags:** `verify-against-repo`, `fixture`
- **Claim:** The handoff selects `mongodb-sales-aggregation-engine`, but the repository may already vendor it or may require fetching it.
- **Decision:** Plan 004 uses the real task through the repository's approved fixture mechanism and records provenance; it does not copy third-party contents blindly.
- **Why:** Acceptance needs a real fixture and compliant provenance.
- **What would change it:** Existing task files, a lockable dataset fetcher, or license constraints.

## A-010 — Exact action-boundary instrumentation

- **Tags:** `verify-against-repo`, `state-fidelity`
- **Claim:** The handoff requires atomic `fork_at(t)`, but the event loop and snapshot hooks are unknown.
- **Decision:** Plan 002 first locates the canonical completed-action event and makes atomicity observable with a boundary token and state/history hashes.
- **Why:** Hooking the wrong event silently poisons every branch.
- **What would change it:** Existing transaction/checkpoint primitives that already bind history and state.

## A-011 — Grader patch location

- **Tags:** `verify-against-repo`, `correctness`
- **Claim:** The patch must modify the exact grader used in replay, but no file or deployment boundary is visible.
- **Decision:** Plan 005 refuses to prove a patch until v1 and v2 grader digests are captured from the actual execution surface.
- **Why:** Patching a detached copy creates fictional proof.
- **What would change it:** An established immutable grader-version mechanism.

## A-012 — Branch model and gateway

- **Tags:** `verify-against-repo`, `integration`, `security`
- **Claim:** The handoff requires genuine stochastic agentic branches but names no gateway, model configuration, quota, or secret flow.
- **Decision:** Plan 003 binds to the repository's existing agent gateway and records model, seed, sampling configuration, cost metadata when available, and branch/node tags.
- **Why:** A new gateway or fake stochastic loop would be unnecessary and misleading.
- **What would change it:** No existing gateway, in which case the smallest supported HUD-native path is selected and documented.

## A-013 — Legitimate-control source

- **Tags:** `verify-against-repo`, `validation`
- **Claim:** The handoff asks for at least three reference-hinted, path-diverse controls but no reference solution interface is visible.
- **Decision:** Plan 004 uses the real repository-approved solver/reference hints and freezes outputs once; it will not hand-author three cosmetically different answers.
- **Why:** Controls must represent genuine valid behavior.
- **What would change it:** Existing golden solutions, a solver harness, or task constraints that support fewer than three genuinely distinct paths.

## A-014 — Deterministic replay representation

- **Tags:** `verify-against-repo`, `replay`
- **Claim:** The handoff requires recorded actions and tool calls, but their serialization and nondeterministic dependencies are unknown.
- **Decision:** Plan 003 captures the repository's native action envelopes plus stable hashes and rejects Witness status when external nondeterminism cannot be pinned or replayed.
- **Why:** Replay is a proof gate, not a best-effort log.
- **What would change it:** A preexisting record/replay subsystem with stronger guarantees.

## A-015 — Sandbox security controls

- **Tags:** `verify-against-repo`, `security`
- **Claim:** Branches execute attacker-authored code, but available secret scoping, egress controls, resource limits, and tenancy are unknown.
- **Decision:** Plan 003 requires a capability audit and fails closed: no production secrets, minimum network, isolated writable state, bounded resources, and no sibling access.
- **Why:** The search workload is adversarial by design.
- **What would change it:** A documented sandbox policy proving equivalent or stronger isolation.

## A-016 — Publishing permission

- **Tags:** `verify-against-repo`, `deployment`
- **Claim:** The demo should publish or display a hardened environment version, but account permissions and release APIs are unknown.
- **Decision:** Plan 006 publishes when authorized; otherwise it produces an immutable release candidate and displays the exact blocked publish step without claiming publication.
- **Why:** Lack of permission should not erase proof, but must be reported honestly.
- **What would change it:** Verified credentials and a safe non-production publication target.

## A-017 — Real-system acceptance surface

- **Tags:** `verify-against-repo`, `validation`
- **Claim:** Snapshot fidelity, branch isolation, HUD grading, and publishing cannot be honestly proved with unit mocks alone.
- **Decision:** Core acceptance includes at least one real HUD × Modal end-to-end run. Unit tests cover pure contracts and failure handling only.
- **Why:** The integration is the product.
- **What would change it:** A repository-provided deterministic local emulator proven equivalent for the relevant behavior.

## A-018 — Alpha capabilities

- **Tags:** `verify-against-repo`, `research`
- **Claim:** Memory Snapshots and VM Sandboxes may be unavailable or inappropriate.
- **Decision:** Plan 007 probes capability and task need before adding code. Unavailable paths are recorded as evidence-backed skips; no unused adapter scaffold is created.
- **Why:** Core delivery must not depend on Alpha access, and unused scaffolding violates the guardrails.
- **What would change it:** Granted access plus a real task whose state requires the capability.

## A-019 — Research and training scope

- **Tags:** `research`, `scope`
- **Claim:** Cross-task transfer and training consequences are stretch, never on the live path.
- **Decision:** Plan 007 runs only after core artifacts exist, uses measured data, and may stop at filtering/contamination analysis without a gradient step.
- **Why:** The 24-hour contract prioritizes one complete depth-1 loop.
- **What would change it:** Extra time, real multi-task data, compute budget, and an explicit research objective.

## A-020 — Metric targets

- **Tags:** `measurement`
- **Claim:** The handoff marks result values TBD except must-ship counts.
- **Decision:** Plans define instruments and report observed values without inventing success thresholds for latency, coverage, or compute advantage.
- **Why:** Unmeasured numbers must remain TBD.
- **What would change it:** Baseline data or product SLOs supplied by the repository owner.
