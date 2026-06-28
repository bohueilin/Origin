---
name: repo-grounding-and-command-freeze
description: >
  Grounds Chronos against the real repository by binding proposed ownership paths, existing integrations, capabilities, fixtures, dependency bootstrap, environment configuration, and exact validation commands, and stands up the one live HUD environment the bundle has no other owner for (the mongodb-sales-aggregation-engine task). Use when a repository-connected executor is starting the bundle; it writes only its declared setup, spec, repo-map, plan/reference, validator, evidence, and the single owned HUD env paths, and must merge before any implementation wave.
owns: [".agents/skills/**", ".claude/skills/**", ".gitignore", ".env.example", ".python-version", "pyproject.toml", "skills-lock.json", "uv.lock", "requirements/harden-v0.txt", "scripts/bootstrap_external_deps.sh", "docs/plans/scripts/validate_evidence.py", "docs/plans/specs/07-environment.md", "docs/plans/001-repo-grounding-and-command-freeze.md", "docs/plans/001-repo-grounding-and-command-freeze.REFERENCE.md", "docs/plans/repo-map/**", "docs/plans/evidence/001/**", "envs/mongodb-sales-aggregation-engine/**"]
depends_on: []
wave: 1
---

# Repository grounding and command freeze

## Goal

Produce one accepted repo map that binds 100% of proposed implementation globs and every mapped command used by Plans 002–007, and stand up the one live HUD environment the bundle otherwise has no owner for so a real reward-1 suspicious trace and grader identity exist to ground. The binary done condition (Gate 1 wording in `000-index.md`): repo-bound ownership validation and the real baseline command both pass with evidence; each of the nine integration/fixture surfaces is either verified-present or explicitly marked blocked-and-owned by its later plan; and the owned HUD env yields a live reward-1 trace plus captured grader digest. Acceptance does not require surfaces that later waves build (harden-v0, controls, witness security, artifact store) to be implemented inside Plan 001 — only located and owned.

## Context / Why

This bundle was authored without repository access. The handoff defines product behavior but not the actual package root, callable APIs, test runner, persistence backend, task materialization, credentials, or existing harden-v0/HUD/Modal adapters. Guessing any of those would poison every later plan.

This plan is the mandatory grounding seam. It inspects the real tree, maps semantic operations to existing code, verifies capabilities, and records exact commands in `docs/plans/repo-map/`. It does not implement Chronos feature slices and does not modify code owned by later plans. One scoped exception applies in this greenfield repository: because no product surface exists to ground and no later plan owns "build the HUD task environment," Plan 001 stands up exactly one live HUD environment under `envs/mongodb-sales-aggregation-engine/**` (env, grader, container) so a real trace and grader identity exist. That env is the substrate the later plans fork, classify, patch, and publish; it is not a Chronos feature itself. Read `001-repo-grounding-and-command-freeze.REFERENCE.md` for the map schemas and inspection checklist.

## Constraints

- Write only declared setup, documentation, validator, evidence, and the single owned `envs/mongodb-sales-aggregation-engine/**` paths.
- The product-source exception is limited to that one env path; do not write any other plan's `src/chronos/**`, `tests/chronos/**`, `fixtures/**`, or `artifacts/**` paths.
- Do not rename or “clean up” repository code.
- Do not install or upgrade production dependencies beyond the minimal checked-in developer bootstrap needed to verify required integration inputs.
- Do not mark an interface verified from docs alone; cite code path plus observed command/output.
- Preserve proposed feature-folder ownership when compatible. Remap only to repository-native feature boundaries, not broad shared-layer globs.
- Record every unresolved codebase claim in `ASSUMPTIONS.md` or the repo map; do not silently resolve by invention.
- STOP when the repository is unavailable, baseline cannot be run, the source trace/task/grader cannot be located, or required security capabilities are unknowable. Record the blocker and evidence.
- Keep generated map files below 500 lines. Tests/validators assert map behavior, not formatting trivia.

## Work packets

### WP1 — Orient the repository

Inspect the root tree, project configuration, package/test layout, CI, agent instructions, and existing feature conventions. Populate `repo-map/STATUS.json` repository identity and `repo-map/REPOSITORY.md`.

**Pass:** The map names the project root, language/toolchain, package roots, test roots, build system, current branch/commit, and relevant nested `AGENTS.md` files with code evidence.  
**Fail:** Any entry is inferred only from the handoff or library familiarity.

### WP2 — Bind the nine required surfaces

Locate and record real paths and public entrypoints for: HUD environment/trace/file evidence, HUD QA, Modal runtime/snapshots, agent gateway, grader/verifier, harden-v0 fixer/replay/dedup, persistence/artifact storage, MongoDB task materialization, and environment version publishing.

**Pass:** `repo-map/INTERFACES.md` gives each semantic operation a real path, symbol or executable entrypoint, input/output evidence, and status.  
**Fail:** A missing surface is replaced by an invented signature or speculative adapter.

### WP3 — Verify fixtures and capabilities

Identify one real suspicious reward-1 source trace, its QA/file evidence, the real MongoDB task, available snapshot profiles, sandbox isolation controls, branch model/gateway, and publication authorization.

**Pass:** Stable ids/locations and capability observations are recorded; unavailable Alpha features are labelled unavailable without blocking core.  
**Fail:** A synthetic trace/task is accepted as core evidence, or security capability is assumed.

### WP4 — Bind collision-free ownership

Fill `repo-map/OWNERSHIP-BINDINGS.json` for every proposed non-document glob. Accept a proposed new path or map it to an exact repository-relative glob. Preserve one feature owner per path and no same-wave overlap.

**Pass:** `validate_ownership.py --repo-bound` passes.  
**Fail:** A binding is null, broad enough to capture another plan, or resolves two same-wave owners to overlapping paths.

### WP5 — Freeze exact commands and baseline

Fill `repo-map/COMMANDS.json` with argv arrays, working directories, and applicability for baseline, lint/type checks, build, each plan's tests, core integrations, security check, research check, and demo. Run the real baseline without source modifications.

**Pass:** `run_mapped.py baseline` exits 0 and its output is recorded; every later command key is verified or explicitly not-applicable with a defensible repository-specific reason.  
**Fail:** Commands are shell prose, guessed, or marked passing without execution.

### WP6 — Close assumptions and emit gate evidence

Update only assumption entries that the repository evidence resolves. Leave unresolved entries tagged. Complete the manifest with commit, commands, map artifacts, and blockers/skips.

**Pass:** Gate 1 in `000-index.md` is mechanically and evidentially satisfied.  
**Fail:** `STATUS.json` says accepted while any core prerequisite remains unresolved.

## Done-when (self-validation gate)

Run from repository root:

    python docs/plans/scripts/validate_graph.py
    python docs/plans/scripts/validate_sections.py
    python docs/plans/scripts/validate_ownership.py
    python docs/plans/scripts/validate_traceability.py
    python docs/plans/scripts/validate_ownership.py --repo-bound
    python docs/plans/scripts/run_mapped.py baseline
    python docs/plans/scripts/validate_file_sizes.py --plan 001
    python docs/plans/scripts/validate_evidence.py --plan 001 --require-complete

Expected evidence:

- accepted `STATUS.json`,
- complete interface and ownership bindings,
- real baseline command with exit code 0,
- stable source-trace/task/grader locations,
- capability/security observations,
- manifest `docs/plans/evidence/001/MANIFEST.json`.

No map file exceeds 500 lines. Completion is a verified repository map, not a plausible narrative.

## Recovery

All edits are additive documentation. Resume by reading the manifest's last successful work packet and rerunning only the affected probes. Never overwrite an accepted binding without a dated Decision Log entry and a fresh collision check. To roll back, restore the prior map files; no product source should need reverting.

## Executor prompt

    /goal Ground the real repository exactly as specified in docs/plans/001-repo-grounding-and-command-freeze.md. Do not modify product source. Bind every path, interface, capability, fixture, and command with code/runtime evidence; run the baseline and all Done-when validators; update docs/plans/evidence/001/MANIFEST.json and append the Living-doc log. Do not mark STATUS accepted while a core prerequisite is unresolved.

## Living-doc log

### Progress

- [x] Repository orientation and instruction chain recorded.
- [x] Required surfaces inspected and recorded as blocked where absent.
- [ ] Real fixtures and capabilities verified.
- [x] Ownership bindings collision-checked.
- [x] Mapped commands and baseline verified.
- [x] Evidence manifest updated with blocker state.

- 2026-06-20T19:48:50Z — Executed repository-connected grounding pass on commit `99c53d2b3a27a682d67bc61a026cdc2bae16eb4e`. The repository currently contains the planning bundle and handoff only; no product source, package config, HUD/Modal/grader/harden-v0 integration, task fixture, artifact store, or sandbox policy is checked in.
- 2026-06-20T19:48:50Z — Populated `docs/plans/repo-map/` with a blocked-but-executable state: baseline command is verified, ownership bindings are accepted for future feature folders, and missing required surfaces are recorded explicitly.
- 2026-06-20T20:11:27Z — Added the Plan 001 dependency bootstrap: uv project metadata, lockfile, Python version pin, harden-v0 requirement mirror, and a pinned external checkout script for harden-v0 plus Terminal Wrench.
- 2026-06-20T20:11:27Z — Added root `.env` handling with committed `.env.example` and canonical environment-variable documentation in `docs/plans/specs/07-environment.md`.
- 2026-06-20T20:23:06Z — Addressed audit feedback by narrowing `.env` loading in the bootstrap script to `H2F2H_EXTERNAL_DIR`, removing command-line secret examples from docs, and separating verified source checkouts from completed core prerequisites in `STATUS.json`.
- 2026-06-20T20:26:54Z — Added the project-level `hud-environment-builder` skill from `https://docs.hud.ai` with `npx skills add https://docs.hud.ai --yes`; recorded the install in `skills-lock.json`.
- 2026-06-20T20:28:14Z — Added `.claude/skills/hud-environment-builder` as a symlink to the canonical `.agents/skills/hud-environment-builder` project skill so Claude Code and Codex share one skill body.
- 2026-06-20T21:30:00Z — Akhil: added `repo-map/EVIDENCE-PACKETS.md` defining the two Wave-1 evidence-packet contracts (runtime/Ashton, proof-control/Katherine) and the Akhil-owned HUD-facing inputs. Each packet field maps to the exact `STATUS.json` prerequisite, `INTERFACES.md` row, and `COMMANDS.json` key it unblocks, with the integration procedure Akhil follows to flip prerequisites. This operationalizes the Core Rule that peers feed evidence into the 001 repo map during Wave 1 without implementing their own plans. Linked from `INTERFACES.md` and `STATUS.json` blockers. `STATUS.json` remains `blocked`; no prerequisite is fabricated.
- 2026-06-20T23:00:00Z — Akhil: **TEAM ALIGNMENT — scope change to Plan 001.** This is a greenfield repo, so the nine Gate-1 surfaces cannot be "located" — they have to be built, and that is forbidden to a pure grounding plan. After owner sign-off we made two changes: (1) Plan 001 now owns and builds **one** product path, `envs/mongodb-sales-aggregation-engine/**` — the live HUD environment the bundle otherwise had no owner for; (2) Gate-1 acceptance follows the `000-index.md` wording (each surface *verified-present* **or** *located-and-owned by its later plan*), not "all nine prerequisites true." What this means for each lane:
  - **Akhil (001):** builds the HUD env + grader, produces the live reward-1 trace + grader digest, flips `source_trace`, `grader`, `hud_adapter`, `modal_adapter`, `baseline_command`. Does NOT build any `src/chronos/**`.
  - **Ashton (002/003/006):** still owns ForkPoint seam, Witness loop, demo. `security_controls` (branch isolation) and the agent gateway remain Ashton's via the runtime packet; 001 only marks them located-and-owned, not implemented. The env Akhil builds is the substrate 002 forks.
  - **Katherine (004/005):** still owns controls + release proof. `mongodb_task` fixture, `harden_v0` integration, and `artifact_store` remain Katherine's; 001 marks them located-and-owned. NOTE: the env's grader (`task_assets/test_outputs.py`, sha256 `ecaf1222…b56f61f`) is the exact verifier Plan 005 patches; the 3 attacker-legitimate solves in the Terminal Wrench source are candidate controls for Plan 004.
  No owned-path collisions: `envs/**` is disjoint from every `src/tests/fixtures/artifacts/chronos/**` glob.
- 2026-06-20T23:55:00Z — Akhil: **GATE 1 ACCEPTED.** Fixed the workspace/grader filesystem wiring (`env.workspace(APP, guest_path="/app")` — bwrap rw-binds the host container `/app` at `/app` in the agent sandbox, so the agent edits the same `/app` the grader reads). Re-ran `claude-haiku-4-5` over the local tcp runtime + gateway: agent implemented `/app/query.py` legitimately and the live pytest grader scored **reward 1.0**. Real recorded HUD trace `92b654c6-cdde-43cf-9096-3681df6df2e1` (job `8b482f14…`). `STATUS.json` → `accepted` with a `gate1_acceptance` block (verified-present: baseline/modal/source_trace/hud_adapter/grader; located-owned: mongodb_task/004, harden_v0/005, security_controls/003, artifact_store/003+005). `validate_ownership.py --repo-bound` PASS; evidence manifest complete. The recorded trace is a legitimate solve; the reward-hack seed is proven reproducible in-container and its live stochastic discovery + QA classification are Plan 003.
- 2026-06-20T23:56:00Z — Codex: canonicalized the Terminal Wrench task-path contract after PR review. `/app` remains correct for the MongoDB env because the pinned source task's Dockerfile/prompt/tests require it, but it is not a converter default: a sample of 323 Terminal Wrench tasks included `/workspace`, `/home/user`, `/workdir`, undeclared workdirs, and task-specific system paths. Added `repo-map/TASK-PATH-CONTRACT.md` with the parse order, STOP conditions, mutable-state inventory, and proof gate; updated the Mongo grader to use `BashGrader(..., cwd="/app")` with relative command paths.
- 2026-06-20T23:40:00Z — Akhil: **live-run status (two real blockers for the recorded trace).** Env deployed twice with introspection OK (env ids `b3409057` and clean `57cb7f09` / `..._v1`), 1 task, 1 capability. But: (1) **hosted rollouts unavailable** — `hud eval --remote` fails for both envs with `400 No registry found for env`, on a clean fresh-name deploy too, so it is an account/platform capability limit, not our env. (2) **local tcp run** (`--runtime tcp://localhost:8765` against a privileged container where bwrap works, LLM via gateway) connects and the agent acts, but its `str_replace` writes fail with `SFTPNoSuchFile`: the `env.workspace` bwrap chroot and the external `BashGrader`'s `/app` are different filesystem views, so agent edits never reach the grader. Fix is real Plan-002-grade work: run the grader **inside** the workspace shell (shared FS) instead of as an external subprocess. The grader logic itself is proven (in-container stub=0/solution=1/hack=1). Recorded jobs (errored) for reference: hud.ai/jobs/defb71a2…, 5970241e…, b41245a7…. Net: the env + verifier are real and deployed; a clean recorded reward-1 trace is the remaining piece and depends on the workspace/grader wiring + hosted-rollout access.
- 2026-06-20T23:05:00Z — Akhil: env built and **validated in-container with the real grader** — stub query.py → reward 0 (2 failed, 11 errors); reference solution → reward 1 (13 passed); reward-hack (force-pass conftest, no real implementation) → reward 1 (13 passed). This proves the substrate AND that the verifier is genuinely subvertible (the vulnerability Chronos exists to kill). Deploying to HUD next to record the live trace.
- 2026-06-20T22:10:00Z — Akhil: HUD and Modal credentials supplied and verified live. `hud models list` authenticates (gateway funding path confirmed; HUD branch model set to `claude-haiku-4-5`). Modal authenticated on profile `rsi-hackathon`; added `repo-map/probes/modal_snapshot_probe.py` and verified the core snapshot path — Filesystem Snapshot full round-trip PASS, Directory Snapshot (Beta) create PASS (mount-restore deferred to Plan 002). Flipped `modal_adapter` prerequisite to `true`. Confirmed the Terminal Wrench checkout ships a sourced reward-1 hack trajectory (`hack_trajectories/v5_2`) plus `hack_summary.md` and 3 attacker-legitimate solves; recorded as a candidate `source_trace` anchor pending owner sign-off. `STATUS.json` stays `blocked` (8 of 9 prerequisites; see below).

### Surprises & Discoveries

- 2026-06-20T19:48:50Z — `python docs/plans/scripts/run_all.py` is not a safe baseline in this checkout because the global file-size validator scans the 1359-line source handoff HTML. Plan-scoped file-size validation passes for Plan 001.
- 2026-06-20T19:48:50Z — No `.github` PR template, package manifest, lockfile, CI workflow, source tree, or test tree is checked in.
- 2026-06-20T20:10:00Z — Confirmed the harden-v0 upstream URL as `https://github.com/few-sh/harden-v0`. This resolves the source-location ambiguity only; the repository integration remains blocked until a pinned fork/submodule/vendor/dependency or external checkout path is recorded with command evidence.
- 2026-06-20T20:11:27Z — harden-v0 has no `pyproject.toml` at pinned revision `b9dd28c732e7e5435da4a2ac90ae92ac6ea65007`, so it is treated as a source checkout plus requirements file, not a direct Python package dependency.
- 2026-06-20T20:11:27Z — Terminal Wrench is large at the pinned revision, so the bootstrap uses sparse checkout for `tasks/mongodb-sales-aggregation-engine`. The MongoDB task source exists under `.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine`.
- 2026-06-20T20:23:06Z — A fresh sparse Terminal Wrench bootstrap updated only 8 checkout files for the MongoDB task path.
- 2026-06-20T20:26:54Z — The HUD docs skill installs as `.agents/skills/hud-environment-builder/SKILL.md` and is intended as project-local agent guidance, not a Python runtime dependency.
- 2026-06-20T20:28:14Z — OpenAI Codex docs confirm repository skills are discovered under `.agents/skills` and symlinked skill folders are supported; the Claude Code symlink is project-local compatibility glue.

### Decision Log

- 2026-06-20 — Planning decision: require a no-source-change grounding wave because repository paths and APIs were unavailable.
- 2026-06-20T19:48:50Z — Accepted the proposed `src/chronos/**`, `tests/chronos/**`, `fixtures/chronos/**`, `artifacts/chronos/**`, and `scripts/chronos-demo*` paths as future repository-native boundaries because there is no existing implementation layout to remap into.
- 2026-06-20T19:48:50Z — Kept `STATUS.json` as `blocked` instead of `accepted`; accepting Gate 1 would require fabricating missing source trace, HUD/Modal adapters, grader identity, harden-v0 integration, real MongoDB task, artifact store, and sandbox security evidence.
- 2026-06-20T20:10:00Z — Decided not to treat the upstream harden-v0 URL as satisfying the `harden_v0` prerequisite. Gate 1 requires an executable repo-local integration contract, not only a known GitHub repository.
- 2026-06-20T20:11:27Z — Split dependency setup from adapter completion: `harden_v0` and `mongodb_task` are now verified as pinned source inputs, while HUD/Modal adapters, source trace, grader, artifact store, and security controls remain Gate 1 blockers.
- 2026-06-20T20:11:27Z — Chose committed `.env.example` plus ignored root `.env` for local development. Remote Modal execution must use Modal Secrets or service-user environment variables rather than copying local `.env` into branch sandboxes.
- 2026-06-20T23:00:00Z — **Decision (owner-approved): fold the one unowned HUD env build into Plan 001 and align acceptance to Gate-1 wording.** Rationale: greenfield repo has nothing to ground; no later plan owns "build the HUD task environment"; a live trace + grader identity are required before 002 can fork anything. Scope strictly limited to `envs/mongodb-sales-aggregation-engine/**` (single product-source exception, recorded in frontmatter `owns`, `OWNERSHIP-BINDINGS.json`, and the REFERENCE done-condition). Surfaces that later waves build (`harden_v0`, `mongodb_task` fixture, `security_controls`, `artifact_store`) are accepted as located-and-owned, not implemented in 001 — preserving the 3-dev lane split. Alternative rejected: keep 001 blocked forever / fabricate `true` values (dishonest).
- 2026-06-20T23:02:00Z — Decision: rebuild the env on a public `mongo:7.0` base because the original Terminal Wrench Dockerfile pins a private Alibaba registry image (`skylensage-registry.cn-hangzhou.cr.aliyuncs.com/...`) we cannot pull. Grader, data, and test suite are copied verbatim from the source task so the verifier identity is faithful.
- 2026-06-20T21:30:00Z — Made the remaining Gate-1 path packet-driven instead of ad hoc. `EVIDENCE-PACKETS.md` assigns each blocked prerequisite to a named owner (runtime → Ashton, proof/control → Katherine, HUD-facing → Akhil) and requires path+command+output evidence per field. This lets Ashton and Katherine work in parallel during Wave 1 without touching their own plan paths, and makes prerequisite flips mechanical and auditable when packets land.

### Outcomes & Retrospective

- 2026-06-20T19:48:50Z — Plan 001 now gives developers a minimal local bootstrap: Python-only validation, a mapped baseline command, accepted future ownership boundaries, and an explicit list of missing surfaces required before implementation waves may begin. Gate 1 remains blocked until those real surfaces are supplied and verified.
- 2026-06-20T20:11:27Z — Developers can now run `uv sync --all-extras --all-groups` and `scripts/bootstrap_external_deps.sh` to install HUD/Modal/harden support libraries and fetch pinned harden-v0 plus sparse Terminal Wrench task sources. Gate 1 remains blocked until real adapters and proof surfaces are implemented.
