# qabench environments (Plan 008)

Each `<task-slug>/` here is a HUD env layout materialized from a pinned
[Terminal Wrench](https://github.com/few-sh/terminal-wrench) task by the importer
in `src/chronos/qabench/`. The 10 benchmark tasks and the pinned source revision
are declared in [`tasks.json`](tasks.json); the per-task import result (deployable
or honestly skipped, base image, digests) is in
[`IMPORT_REPORT.json`](IMPORT_REPORT.json).

## Per-env layout

- `Dockerfile` — the task's build, with the base image rewritten to a **verified
  public** `ghcr.io/laude-institute/t-bench/<variant>` image when the upstream task
  used the private `…aliyuncs.com/…:t-bench-<variant>` mirror.
- build-context files (e.g. `generate_returns.py`, `.dockerignore`) — copied so the
  image builds.
- `task_assets/` — the trusted post-hoc verification bundle (v1 grader
  `test_outputs.py`, `test.sh`, `instruction.md`, `solution.sh`) the sterile referee
  runs; kept out of the agent-writable image.
- `clean_verify.sh` — the sterile referee entrypoint (confined conftest discovery).
- `provenance.json` — pinned source digests: `grader_digest`, `dockerfile_digest`,
  `build_context_digest`, `base_image_digest`, and a `content_digest`.

## Regenerating

```sh
uv run python -m chronos.qabench.materialize --manifest envs/qabench/tasks.json
```

This reads `.external/terminal-wrench` (the pinned checkout) and rewrites the env
layouts idempotently. Large build-context data assets (e.g.
`fmri-encoding-r/fMRIdata.RData`, ~80MB) are **git-ignored** and recreated by this
command; their integrity is verifiable via each env's `build_context_digest`.
