# Development bootstrap

Status: **dependency bootstrap available**

This repository now has a uv-managed Python dependency environment. There is
still no product source tree or real HUD/Modal adapter implementation.

## Required local tools

- Python 3.12
- uv
- git
- Docker, when running harden-v0/Harbor tasks

## Setup

Create a local env file:

```sh
cp .env.example .env
```

The checked-in `.env.example` is the canonical variable contract. The local
`.env` file is ignored and must not be committed.

Install the Python environment:

```sh
uv sync --all-extras --all-groups
```

Install project-level agent skills from the lockfile, including the HUD docs
skill:

```sh
npx skills experimental_install
```

The current project skill was added with:

```sh
npx skills add https://docs.hud.ai --yes
```

Codex uses `.agents/skills/hud-environment-builder` as the canonical repo skill
folder. Claude Code uses `.claude/skills/hud-environment-builder`, which is a
symlink to the canonical `.agents` skill folder.

Fetch pinned source-only dependencies:

```sh
scripts/bootstrap_external_deps.sh
scripts/verify_external_deps.sh
```

This creates ignored checkouts under `.external/`.

Plan 004 mapped commands require the pinned Terminal Wrench task source. Plan
003 canonical Reward Hacking QA requires the pinned HUD Trace Explorer source.
Because `.external/` is gitignored, fresh worktrees do not inherit it
automatically. For Codex worktrees, follow `docs/plans/repo-map/WORKTREES.md`
to link a verified shared `.external` cache before running:

```sh
python docs/plans/scripts/run_mapped.py plan-004-tests
python docs/plans/scripts/run_mapped.py integration-controls
```

Those commands fail fast with the missing prerequisite path when the checkout is
absent.

## Dependency map

See `docs/plans/repo-map/DEPENDENCIES.md` for exact versions, source revisions,
authentication requirements, and verification commands.

See `docs/plans/specs/07-environment.md` for the canonical environment-variable
and secret-handling contract.

## First command

Run the mapped baseline from the repository root:

```sh
python docs/plans/scripts/run_mapped.py baseline
```

Expected result:

```text
RUN: baseline: cwd=. argv=['uv', 'run', 'python', 'docs/plans/scripts/validate_graph.py']
PASS: 7 plans, 7 dependencies, waves [1, 2, 3, 4, 5], acyclic
```

## Useful planning checks

```sh
python docs/plans/scripts/validate_graph.py
python docs/plans/scripts/validate_sections.py
python docs/plans/scripts/validate_ownership.py
python docs/plans/scripts/validate_traceability.py
python docs/plans/scripts/validate_evidence.py
python docs/plans/scripts/validate_file_sizes.py --plan 001
```

## Before source work

Plans 002-007 must wait until `STATUS.json` is `accepted`. The current state
remains `blocked` because dependency setup is not the same as having a real
source trace, adapters, grader, artifact store, or sandbox controls.
