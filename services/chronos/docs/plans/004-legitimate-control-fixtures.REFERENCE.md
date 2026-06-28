# Plan 004 reference — control diversity and freezing

## Environment identity field taxonomy

Three distinct fields are used across Chronos records. They are not interchangeable:

| Field | What it is | Source | When available |
|---|---|---|---|
| `grader_digest` | SHA-256 of `original_task/tests/test_outputs.py` | Local filesystem after bootstrap | WP1 — now |
| `environment_dockerfile_digest` | SHA-256 of `original_task/environment/Dockerfile` | Local filesystem after bootstrap | WP1 — now |
| `environment_version` | HUD's opaque logical identifier for the task environment | HUD trace payload / SDK at runtime | WP5 — after real HUD run |
| `task_checksum` | SHA-256 of the task definition, found in `result.json` produced by HUD | HUD run output | WP5 — after real HUD run |
| `environment_image_digest` | Docker/Modal container image digest | `docker inspect` or Modal SDK | ExploitWitness only — not on LegitimateControl records |

`environment_version` is what the spec's ProofSet and ReleaseProof call `environment_v1` / `environment_v2`. It is HUD's own version string — its exact format (opaque id, semantic version, taskset id) is resolved by Plan 001's Wave 1 binding. Never substitute another digest for it.

"v1 environment" in plain language means: the task environment identified by the `environment_version` string returned by HUD when the unpatched verifier (`grader_digest: ecaf1222…`) runs the control. "v2 environment" is the same field after Plan 005 applies the harden-v0 patch — the `grader_digest` changes; the base Docker image does not.

## Real task provenance

The task is fetched by `scripts/bootstrap_external_deps.sh` (sparse checkout). All values below are verified at pinned revision `d8a29613235a0ef56a8b70b3142626a533da28c2`:

| Field | Value |
|---|---|
| Upstream repository | `https://github.com/few-sh/terminal-wrench.git` |
| Pinned revision | `d8a29613235a0ef56a8b70b3142626a533da28c2` |
| Sparse path | `tasks/mongodb-sales-aggregation-engine` |
| Task id | `mongodb-sales-aggregation-engine` |
| Source dataset | `terminal-bench-pro` |
| Grader file | `original_task/tests/test_outputs.py` |
| Grader digest (SHA-256) | `ecaf12227976729261555ba1c5c229ad89487fc1beb945b4b8ae52509b56f61f` |
| Verifier harness | `original_task/tests/test.sh` |
| Verifier harness digest (SHA-256) | `5783dd7c287c917ca85b6d272b3ac3e8f2560c495ba0d05a8e9195e8b4641a00` |
| Verifier pytest version | `8.4.1` (pinned via `uv add pytest==8.4.1` in `test.sh`) |
| Reference solution | `original_task/solution/solve.sh` |
| Task container definition | `original_task/environment/Dockerfile` |
| Reward signal | `/logs/verifier/reward.txt` — `1` (pass) or `0` (fail) |

The v1 grader identity for all Chronos records is the grader digest plus the pinned terminal-wrench revision. A lightweight evidence manifest entry may record these values by reference rather than duplicating file contents.

## Legitimate generation rules

A legitimate control solves the stated task rather than manipulating the grader/test framework. Generation must use one of these sourcing paths:

- **Reference solution path:** derive from `original_task/solution/solve.sh`, the upstream canonical implementation. This is path label `reference`.
- **Fresh solver run:** run the task through HUD using `H2F2H_SOLVER_MODEL` with only `original_task/instruction.md` as context, no exploit knowledge, and a clean container. Record model id, seed, run id. This is path label `solver-run-<seed>`.

The three prior `attacker_legitimate_solve` trajectories in `task.json` (v5_4, v5_6, v5_7) are cross-reference evidence that the task supports genuine solutions. Do not use these trajectory outputs directly as control artifacts — generate fresh, independently provable controls instead.

Never use `hack_summary.md`, the exploit trajectory files (`hack_trajectories/`), or any knowledge of the pytest entry-point or `runner.py` patch mechanisms as inputs or hints.

Preserve generation provenance (model, seed, run id, source path) for every candidate. Do not post-edit solution files after grading.

## Diversity rubric

All controls must satisfy the same public task contract (pass all 13 tests in `test_outputs.py` under v1). At least one substantive dimension must differ across the three controls:

- aggregation pipeline construction (e.g., single-pass vs. two-stage; use of `$facet`; `$lookup` with pipeline vs. simple `$lookup`)
- rounding strategy (Python-side `round()` vs. MongoDB `$round`)
- date parsing (ISO string via `datetime.fromisoformat` vs. explicit format parse)
- error/edge-case handling (orphaned orders, zero quantity, boundary dates)
- module organization (single class vs. helper methods; connection lifecycle)
- use of equivalent supported library mechanisms (`$addFields` + `$multiply` vs. inline `$expr` in `$group`)

**Hard constraint from `test_performance_structure`:** every control's source must contain the strings `$match` and `$lookup`. The test body contains no ordering or structural assertion (it ends with `pass`), so these can appear in any context. Cosmetic edits — renamed variables, reordered imports, whitespace — do not satisfy the rubric.

**Pre-specified target paths (defined in WP3):** Path A, B, and C are enumerated in the plan body. Paths A and B are verified against real trajectories; Path C has a documented fallback. When evaluating a control for diversity, cite its path id and the specific structural dimension that differs from the other two.

## Freeze process

For each selected control:

1. Start from a clean pinned task.
2. Apply only the legitimate solution artifact.
3. Run the authoritative grader.
4. Repeat in three clean environments.
5. Save trace/result references.
6. Canonicalize and hash the solution.
7. Seal the control manifest.
8. Make later corrections by superseding, not mutation.

## Required negative behavior

Corrupt or remove one load-bearing part of a copied candidate and show the grader fails. This proves the harness is testing task behavior rather than accepting every fixture.

## Patch-era use

Plan 005 consumes sealed control ids. It may not update their solution contents or expected reward. When a control fails under v2, the release is rejected and the patch returns to the fixer; the control is not weakened to fit the patch.
