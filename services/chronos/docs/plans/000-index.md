---
name: index
description: >
  Routes Chronos implementation work through an acyclic, collision-free dependency graph and evidence-based merge gates. Use when assigning plans, opening parallel worktrees, checking ownership, or deciding whether a later wave may begin.
owns: ["docs/plans/000-index.md"]
depends_on: []
wave: 0
---

# Chronos plan index

## Execution rule

Wave 1 grounds the real repository. No source implementation begins while `docs/plans/repo-map/STATUS.json` is `unverified`. Each later plan may update only its own plan/reference/evidence files and its declared feature paths. Proposed source globs become effective only after the repo map accepts or remaps them.

### Rescue exception — 2026-06-21 Plan 003/005 release unblock

The repository owner explicitly authorized one rescue PR to finish the upstream
Witness seal needed by Plan 005 and then run Plan 005 in the same isolated
worktree. This is a narrow exception to the normal one-plan-per-PR sequencing,
not a general merge-gate weakening.

Allowed rescue writes:

- Plan 003 owned paths: `docs/plans/003*`,
  `docs/plans/evidence/003/**`, `src/chronos/witnesses/**`,
  `tests/chronos/witnesses/**`, and `fixtures/chronos/witnesses/**`.
- Plan 005 owned paths: `docs/plans/005*`,
  `docs/plans/evidence/005/**`, `src/chronos/releases/**`,
  `tests/chronos/releases/**`, and `artifacts/chronos/releases/**`.
- Plan 001 command-registry custody exception limited to
  `docs/plans/repo-map/COMMANDS.json` rows `plan-005-tests` and
  `integration-release`.

The rescue PR must preserve the full Gate 3 and Gate 4 evidence standards:
Plan 003 must still seal at least one task-agnostic Exploit Witness with reward,
HUD QA join, target/mechanism deduplication, complete provenance, durable
filesystem-class state, minimized causal evidence, and three deterministic v1
replays before Plan 005 can consume it. Plan 005 must still build a non-empty
ProofSet, run per-case v1/v2 release evaluation, preserve every sealed control,
run the mandatory evaluator-subversion checks, and pass its complete Done-when
gate without counting skipped commands as passing.

The Witness sealing path must remain terminal-bench-style/task-agnostic. It may
use candidate artifact ids as operator-selected inputs or test fixtures, but
production code must not hard-code the MongoDB task id, branch id, file names, or
pytest mechanism as the promotion rule. Task-specific facts may appear only in
evidence records describing a concrete run.

## Dependency graph

    001 repo-grounding-and-command-freeze
      ├── 002 atomic-forkpoint-seam
      │     └── 003 stochastic-witness-loop
      │            ├── 005 verifier-fix-and-release-proof
      │            │      └── 006 demo-observability-and-publication
      │            ├── 007 depth-two-and-research-extensions
      │            └── 008 qa-classifier-benchmark
      └── 004 legitimate-control-fixtures
             ├── 003 stochastic-witness-loop
             ├── 005 verifier-fix-and-release-proof
             └── 008 qa-classifier-benchmark

The graph is acyclic. Plan 003 waits for both Plan 002 state fidelity and Plan 004 frozen legitimate controls. Plan 005 waits for both a replayable Witness and frozen legitimate controls. Plan 007 is parallel with Plan 005 after core Witness creation and is never a prerequisite for the live demo. Plan 008 (QA classifier benchmark) depends on Plans 003 and 004 only; its Plan 005 edge was relaxed (2026-06-21, owner-approved) because 008 grounds hack-or-not on its own sterile referee plus the v1 grader and does not use Plan 005's v2 grader or ReleaseProof. It is now parallel with Plans 005 and 007, additive — never a prerequisite for the live demo or the core release gate.

## Parallel waves

| Wave | Plans | Parallelism |
|---|---|---|
| 1 | 001 | Single repository-grounding gate. |
| 2 | 002, 004 | ForkPoint/state fidelity and legitimate controls use separate feature paths. |
| 3 | 003 | Produces real BranchRuns and durable replayable Witnesses. |
| 4 | 005, 007, 008 | Core release proof, optional research extension, and the additive QA classifier benchmark write disjoint paths; 007 and 008 are non-blocking and consume Plan 003 artifacts (008 also reads the v1 grader, not Plan 005's v2). |
| 5 | 006 | Demo/publication consumes the merged core release artifacts. |

## Merge gates

### Gate 1 — repository grounded

Required before Wave 2:

- `repo-map/STATUS.json` is `accepted`.
- Every proposed non-document ownership glob has a real accepted binding.
- `validate_ownership.py --repo-bound` passes.
- Baseline build/test commands are recorded and run through `run_mapped.py`.
- Real source trace, MongoDB task, grader, HUD adapter, Modal adapter, harden-v0 integration, and security controls are located or explicitly marked blocked.
- Plan 001 evidence manifest is complete.

### Gate 2 — source state and controls credible

Required before Wave 3:

- Plan 002 demonstrates atomic history/state capture, restore fidelity, immutable grader identity, and core snapshot selection on a real trace.
- Plan 004 freezes at least three path-diverse legitimate controls on the real task.
- Both manifests are complete; no owned path collision exists.

### Gate 3 — Witness exists

Required before Wave 4:

- Twelve genuine seeded branches ran from one ForkPoint.
- At least one candidate passed reward, QA classification, deduplication, provenance, durable-state, and three-consecutive-replay gates.
- Branch isolation and missing-provenance failure checks passed.
- Plan 003 manifest is complete.

### Gate 4 — release proof credible

Required before Wave 5:

- Every v1 Witness is rewarded and every v1 control is rewarded.
- Under the exact v2 grader, every Witness scores 0 and every control remains 1.
- ProofSet and ReleaseProof artifacts are immutable and linked.
- Plan 005 manifest is complete.
- Plan 007 may merge independently but cannot weaken or delay this gate.

### Gate 5 — demo/release complete

Planning is implemented when:

- The 13-step demo report links evidence for every step.
- Live search or the honest prior-run fallback is clearly labelled.
- A hardened environment version is published, or a permission-blocked release candidate is displayed without claiming publication.
- Core metrics contain observed values or explicit not-measured status.
- Plan 006 manifest and all core manifests are complete.

### Gate 6 — QA classifier benchmark complete (additive, non-blocking)

Plan 008 depends on Plans 003 and 004 only (the Plan 005 edge was relaxed 2026-06-21; see the dependency graph note). It may begin once Plan 003 lands its sealed Witness and Plan 004 is complete; it does not wait on the Plan 005 release loop. Plan 008 is implemented when:

- An importer template materializes 10 Terminal Wrench tasks (set 2026-06-21, supersedes the earlier 20→5; see Plan 008 Decision Log) as live HUD envs (or honestly skips them) with provenance, a working sterile `clean_verify` referee per env, and a passing isolation check.
- Each task runs the Chronos discovery tree; every rewarded trajectory carries a sterile-referee verdict, and every QA-visible real trace carries a post-trace HUD QA verdict (called without `ground_truth`).
- The sterile referee is validated against curated Terminal Wrench labels on overlapping trajectories (agreement rate recorded).
- One report shows, per-task and aggregate, the additive benchmark — baseline X (referee-confirmed clusters QA alone found) and lift Δ (additional confirmed clusters the discovery layer adds), split into detection and discovery deltas, plus cost/latency, with no metric unreported and Δ = 0 a valid result.
- A live-hook log contains at least one dual-verdict BranchRun from a real Chronos run.
- Plan 008 manifest is complete. This gate does not weaken or delay Gates 4 or 5.

## Ownership map

| Plan | Exclusive proposed writes |
|---|---|
| 001 | `.agents/skills/**`, `.claude/skills/**`, `.gitignore`, `.env.example`, `.python-version`, `pyproject.toml`, `skills-lock.json`, `uv.lock`, `requirements/harden-v0.txt`, `scripts/bootstrap_external_deps.sh`, `docs/plans/scripts/validate_evidence.py`, `docs/plans/specs/07-environment.md`, `docs/plans/repo-map/**`, `envs/mongodb-sales-aggregation-engine/**`, its plan/reference, `evidence/001/**` |
| 002 | `src/chronos/forkpoints/**`, `tests/chronos/forkpoints/**`, its plan/reference, `evidence/002/**`; narrow exception for `docs/plans/repo-map/COMMANDS.json` entries `plan-002-tests` and `integration-forkpoint` only |
| 003 | `src/chronos/witnesses/**`, `tests/chronos/witnesses/**`, `fixtures/chronos/witnesses/**`, its plan/reference, `evidence/003/**` |
| 004 | `src/chronos/controls/**`, `tests/chronos/controls/**`, `fixtures/chronos/mongodb-sales-aggregation-engine/**`, its plan/reference, `evidence/004/**` |
| 005 | `src/chronos/releases/**`, `tests/chronos/releases/**`, `artifacts/chronos/releases/**`, its plan/reference, `evidence/005/**` |
| 006 | `src/chronos/demo/**`, `tests/chronos/demo/**`, `scripts/chronos-demo*`, `artifacts/chronos/demo/**`, its plan/reference, `evidence/006/**`; narrow exception for `docs/plans/repo-map/COMMANDS.json` entries `plan-006-tests`, `integration-publication`, `publication-idempotency`, `publication-permission-denied`, `publication-trust-boundary`, `publication-redaction`, `demo`, `demo-report-replay`, `demo-presentation-timeout`, and `hud-deploy` only; plus a maintainer-directed exception for `docs/plans/repo-map/INTERFACES.md` row 17 (HUD publish/compare) and `docs/plans/repo-map/REPOSITORY.md` status reconciliation |
| 007 | `src/chronos/research/**`, `tests/chronos/research/**`, `artifacts/chronos/research/**`, its plan/reference, `evidence/007/**`; narrow rescue exception for `docs/plans/repo-map/COMMANDS.json` entries `plan-007-tests` and `integration-research` only |
| 008 | `src/chronos/qabench/**`, `tests/chronos/qabench/**`, `fixtures/chronos/qabench/**`, `artifacts/chronos/qabench/**`, `envs/qabench/**`, its plan/reference, `evidence/008/**` |

## Assignment checklist

Assign one plan per isolated worktree. Verify dependencies merged, repo map accepted, and target paths match frontmatter. Run the planning validators before assignment and the complete evidence validator before merge.
