# Agent governance

## Source priority

Treat the checked-in repository, this bundle, and the supplied Chronos handoff as the only project sources of truth. Do not infer an API signature, existing file path, runtime behavior, or command from familiarity with HUD, Modal, harden-v0, or another repository. Read `docs/plans/ASSUMPTIONS.md` before implementation. Anything tagged `verify-against-repo` remains unverified until Wave 1 records evidence.

If `AGENTS.md`, plan frontmatter, repo-map files, evidence manifests, or status files disagree, stop before implementation and record the inconsistency in the active plan's living-doc log or evidence manifest.

## Read order

Before implementation, read only the documents relevant to the active task, in this order:

1. `docs/plans/ASSUMPTIONS.md`.
2. `docs/plans/000-index.md`.
3. Root `PLANS.md`.
4. The selected numbered plan under `docs/plans/`.
5. The selected plan's sibling `.REFERENCE.md`.
6. Applicable specs under `docs/plans/specs/`.
7. `docs/plans/GLOSSARY.md`.
8. The accepted repo map under `docs/plans/repo-map/`.
9. The selected plan's evidence manifest under `docs/plans/evidence/<NNN>/MANIFEST.json`.

## ExecPlans

For this project, an ExecPlan is one numbered file under `docs/plans/`. Execute only a plan whose `depends_on` plans have merged and whose wave merge gate is open. Follow `PLANS.md` and the selected plan from design through validation. Keep the selected plan's living-doc log and evidence manifest current at every stopping point.

<important if="you are implementing a numbered plan">
Confirm the plan owns every path you will write, its dependencies have merged, and the wave gate is open before editing source. Identify the Done-when commands and evidence manifest path before starting implementation.
</important>

<important if="you are validating work">
Run the selected plan's exact Done-when commands. Prefer mapped validators and concise pass/fail output. Do not truncate logs in a way that hides the failing command, exit code, artifact path, or observed behavior.
</important>

<important if="you touch HUD, Modal, grader, security, branch execution, or release surfaces">
Treat missing real-system access, missing provenance, missing grader identity, weak isolation, or secret exposure as STOP conditions. Record the STOP; do not substitute mocks for core acceptance evidence.
</important>

## Engineering principles

**Locality of behavior.** A unit's behavior must be evident from reading that unit. Co-locate its contracts, orchestration, error handling, and behavioral tests. Avoid hidden global state and action at a distance.

**Modularity by feature.** Organize new work by vertical feature slice rather than by technical layer. The proposed `forkpoints`, `witnesses`, `controls`, `releases`, `demo`, and `research` folders are feature boundaries. Wave 1 may remap them to repository-native equivalents, but must preserve collision-free ownership.

**File size.** Target fewer than 500 lines of code per file. Split only along a real responsibility, lifecycle, or dependency seam. Do not create arbitrary `helpers` buckets.

**Tests verify functionality.** Tests assert observable outcomes through public behavior. They must fail when behavior breaks and survive internal refactors. Do not add change-detector tests, tautological schema restatements, or mocks of the unit being tested.

## Execution rules

1. Read the selected plan, its sibling `.REFERENCE.md`, the applicable specs, `GLOSSARY.md`, and the accepted repo map.
2. Confirm the plan owns every path it will write. Do not edit a sibling plan's paths.
3. Respect STOP conditions. Record a STOP in the evidence manifest; do not route around missing state fidelity, grader identity, security isolation, or real-system access.
4. Prefer the smallest behavior-complete change. No speculative abstraction, unused adapter, empty scaffold, or broad rewrite.
5. Use real acceptance fixtures. A fake HUD trace, fake grader, or fake snapshot cannot prove the core loop. Mocks are allowed only at narrow failure boundaries after a real integration path exists.
6. Keep discovery stochastic and proof deterministic. A rewarded branch is not a Witness until classification, deduplication, provenance, and replay gates pass.
7. Keep untrusted branch code isolated with minimum secrets and network access.
8. Run the plan's exact Done-when commands. Update `docs/plans/evidence/<NNN>/MANIFEST.json` with command, result, artifact path, and observed behavior.
9. Append decisions, surprises, progress, and outcomes to the plan's Living-doc log. Never rewrite history.
10. Do not call work complete based on code inspection. Completion is evidence-based.

Keep context clean: summarize noisy research, long command output, and external-source findings into the active plan log or evidence manifest with paths, URLs, and observed facts. Do not paste large transcripts into root instructions.

## Merge discipline

Parallel plans run in isolated worktrees. Do not start a later wave until `docs/plans/000-index.md` says its merge gate is satisfied. Before merging a wave, run ownership, graph, section, traceability, and evidence validation. Resolve ownership changes by updating the affected plan frontmatter and repo map before source edits.

<important if="you are preparing a worktree that needs `.external/`">
Read `docs/plans/repo-map/WORKTREES.md` before setup. Prefer linking the worktree
to an already-verified shared `.external` cache when available, then run
`scripts/verify_external_deps.sh`. Do not commit `.external/`, external source
files, symlinks under `.external/`, `.env`, or secrets.
</important>

## Claims and reporting

Keep unmeasured values as `TBD`. Label prior-run demo artifacts honestly. Preserve the distinction between HUD reward and reward-hacking classification. Do not describe the search as full MCTS, complete exploit coverage, or general-purpose hardening.

<important if="you are reporting results">
Report only evidence-backed outcomes. Include exact command names, exit codes, artifact paths, and unresolved risks when they matter. Keep unmeasured values as `TBD`.
</important>
