# Worktree external dependency guide

Status: **local dependency cache guidance**

Codex worktrees do not inherit ignored `.external/` checkouts. Treat `.external/`
as a local source cache, not repository content, evidence output, or vendored
code. Never commit `.external/`, symlinks under `.external/`, `.env`, or secret
material.

## Required sources

The repo-map dependency table is canonical for upstream URLs and pinned commits.
Current required paths are:

- `.external/harden-v0/harden/config.py`
- `.external/harden-v0/harden/loop.py`
- `.external/hud-trace-explorer/qa_reward_hacking.py`
- `.external/terminal-wrench/tasks/mongodb-sales-aggregation-engine`

Run this after preparing a worktree:

```sh
scripts/verify_external_deps.sh
```

## Preferred Codex worktree flow

When a task asks for a new Codex worktree or an isolated plan worktree:

1. Create the worktree from the requested base branch.
2. Find the main checkout or another trusted prepared checkout for this repo.
3. If that checkout already has verified `.external/<name>` entries, create
   symlinks from the new worktree to those entries.
4. Run `scripts/verify_external_deps.sh` in the new worktree.
5. If any required source is missing, run `scripts/bootstrap_external_deps.sh`
   in the main checkout or in a shared cache directory, then link again.

Example from a newly created worktree:

```sh
mkdir -p .external
ln -s /Users/ashtonchew/projects/hack2fix2hack/.external/harden-v0 .external/harden-v0
ln -s /Users/ashtonchew/projects/hack2fix2hack/.external/hud-trace-explorer .external/hud-trace-explorer
ln -s /Users/ashtonchew/projects/hack2fix2hack/.external/terminal-wrench .external/terminal-wrench
scripts/verify_external_deps.sh
```

If the main checkout is not prepared, run:

```sh
scripts/bootstrap_external_deps.sh
```

The bootstrap script keeps Terminal Wrench sparse at
`tasks/mongodb-sales-aggregation-engine`; do not replace it with a full clone
unless a plan explicitly requires broader source evidence and records the disk
cost.

## Shared cache option

For many short-lived worktrees, use a shared dependency cache instead of cloning
inside each worktree:

```sh
H2F2H_EXTERNAL_DIR=/path/to/h2f2h-external scripts/bootstrap_external_deps.sh
mkdir -p .external
ln -s /path/to/h2f2h-external/harden-v0 .external/harden-v0
ln -s /path/to/h2f2h-external/hud-trace-explorer .external/hud-trace-explorer
ln -s /path/to/h2f2h-external/terminal-wrench .external/terminal-wrench
scripts/verify_external_deps.sh
```

Do not put the shared cache inside a committed path unless it remains ignored.

## When not to symlink

Do not reuse a cached external checkout when:

- its `git rev-parse HEAD` does not match the repo-map pin,
- `git status --short` shows local modifications,
- the required file check fails,
- the task requires different source evidence and the active plan records that
  exception.

In those cases, re-run `scripts/bootstrap_external_deps.sh` against a clean
cache and verify again.
