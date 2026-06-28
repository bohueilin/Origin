# Plan 001 reference — repo-map schemas and inspection guide

Read this file while executing WP1–WP5. The plan's STOP conditions and acceptance criteria remain authoritative.

## Required repository evidence

Record repository-relative paths and, where applicable, symbols or command entrypoints for:

1. Root project configuration and lockfiles.
2. HUD environment implementation and rollout runtime selection.
3. Trace retrieval/export, step identity, file tracking, and QA result retrieval.
4. Modal sandbox creation, snapshot capture/restore, warm pool, and capability probes.
5. Agent gateway/model invocation and seed/sampling configuration.
6. Grader/verifier source and immutable version/digest mechanism.
7. harden-v0 fixer, replay gate, legitimate handling, shared defense pool, and target/mechanism dedup.
8. Persistence, artifact blobs, content hashing, and retention.
9. Terminal Wrench task materialization and reference/solver hints.
10. Taskset/analytics, environment version comparison, and publication.
11. Secrets, egress, resource, and sandbox isolation policy.
12. Unit, integration, end-to-end, lint/type/build, and demo commands.

## `STATUS.json`

Required shape:

    {
      "schema_version": 1,
      "status": "unverified | accepted | blocked",
      "repository_root": null,
      "repository_identity": null,
      "commit": null,
      "verified_at": null,
      "verified_by": null,
      "core_prerequisites": {
        "source_trace": false,
        "mongodb_task": false,
        "hud_adapter": false,
        "modal_adapter": false,
        "grader": false,
        "harden_v0": false,
        "artifact_store": false,
        "security_controls": false,
        "baseline_command": false
      },
      "blockers": []
    }

Set `accepted` per the Gate-1 wording in `000-index.md`: every core prerequisite is either **verified-present** (`true`) or **explicitly located and owned by its later plan** with the owner recorded in `EVIDENCE-PACKETS.md` and a `blocked`-state entry; the baseline command runs; repo-bound ownership validates; and the live owned HUD env has produced a real reward-1 suspicious trace plus a captured grader digest. A prerequisite that a later wave builds (for example `harden_v0`, `mongodb_task` fixture, `security_controls`, `artifact_store`) does not need to be implemented inside Plan 001 to accept Gate 1 — it must be located, owned, and tracked. Do not fabricate a `true` value for a surface that does not exist. Alpha capabilities are not core prerequisites.

For machine-checkable acceptance, `STATUS.json` carries a `gate1_acceptance` block recording, per prerequisite, whether it is `verified-present` or `located-owned:<plan>`, so acceptance is explicit rather than implied by the boolean alone.

## `COMMANDS.json`

Each command is data, not shell prose:

    {
      "schema_version": 1,
      "status": "unverified | accepted",
      "commands": {
        "baseline": {
          "status": "verified",
          "argv": ["..."],
          "cwd": ".",
          "env": {},
          "reason": "..."
        }
      }
    }

Required keys:

- `baseline`
- `lint`
- `build`
- `plan-002-tests`
- `integration-forkpoint`
- `plan-003-tests`
- `integration-witness`
- `security-branch`
- `plan-004-tests`
- `integration-controls`
- `plan-005-tests`
- `integration-release`
- `plan-006-tests`
- `demo`
- `plan-007-tests`
- `integration-research`

A command may be `not-applicable` only with a repository-specific reason and when the corresponding plan names another verified command that proves the same behavior. `baseline` cannot be skipped.

## `OWNERSHIP-BINDINGS.json`

Map every proposed implementation glob exactly:

    {
      "schema_version": 1,
      "status": "unverified | accepted",
      "bindings": {
        "src/chronos/forkpoints/**": {
          "actual": ["real/repository/glob/**"],
          "status": "accepted",
          "evidence": "why this is the repository-native feature boundary"
        }
      }
    }

Do not map a feature to the entire package root or generic shared test folder. If an existing file must be edited, add its exact path to the owning plan's frontmatter and this map before source edits.

## `INTERFACES.md`

For each logical operation, record:

- semantic operation name,
- real repository path,
- real symbol/entrypoint,
- input/output shape observed from code,
- how to exercise it,
- capability/auth requirement,
- status and evidence.

Logical operations are listed in `specs/03-interfaces.md`. Do not copy a vendor-doc API when the repository wraps it.

## Baseline policy

Run the smallest established command that proves the untouched repository is healthy. Record pre-existing failures separately. A red baseline does not automatically block all work, but `STATUS.json` must be `blocked` unless the failure is isolated, reproducible, outside all planned paths, and an owner explicitly accepts it in the Decision Log.

## Ownership remap procedure

1. Compare the proposed feature path with repository conventions.
2. Prefer a new repository-native feature folder over editing broad shared layers.
3. Add exact existing files only when behavior genuinely belongs there.
4. Update the affected plan frontmatter before that plan begins.
5. Update the binding file.
6. Run proposed and repo-bound collision validators.
7. Record rationale in Plan 001 and the affected plan.

## Suggested inspection commands

Use repository-native tools. Common read-only examples such as `find`, `git ls-files`, `rg`, and reading build files are acceptable, but do not commit those examples as mapped project commands unless they are actual project workflows.
