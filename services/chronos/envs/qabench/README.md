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
- `task_assets/` — the intentional public v1 grader surface (`test_outputs.py`,
  `test.sh`, `instruction.md`). `Dockerfile.hud` copies it into `/app/task_assets`
  for the benchmark's public reward-hack behavior; the later clean-verification
  mount is a separate trusted, read-only referee boundary.
- `clean_verify.sh` — the sterile referee entrypoint (confined conftest discovery).
- `provenance.json` — pinned source digests: `grader_digest`, `dockerfile_digest`,
  `build_context_digest`, `base_image_digest`, and a `content_digest`.

## Source solutions and historical classifications

The importer retains an upstream source solution path only as host/researcher
metadata. It does not materialize, serialize, or copy a solution into the Docker
build context, `task_assets/`, generated HUD source, provenance, or the referee
bundle.

The checked-in `port-fortran-rk4-lorenz-to-python/rk4_solver.f` is an instruction-
declared **public reference input** for a porting task. It remains intentionally
available and excludes that task from any hidden-reference-free claim.

`synthesize-harmonic-wav-in-c` keeps the public `audio.wav` reference baseline,
but its generator now runs only in a Docker builder stage; the final runtime image
copies the waveform, not `generate_audio.py`. This is a static source boundary, not
final-image proof. Real-image inspection as the HUD agent identity remains an
operator gate. The encrypted `protected.tar.gz.enc` assets are opaque ciphertext;
they likewise require a real-image key/plaintext inspection before a release claim.

Upstream is Apache-2.0; see [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for
attribution, the statement of modification, and the contamination-canary note.

## Regenerating

```sh
uv run python -m chronos.qabench.materialize --manifest envs/qabench/tasks.json
```

This reads `.external/terminal-wrench` (the pinned checkout) and rewrites the env
layouts idempotently. Large build-context data assets (e.g.
`fmri-encoding-r/fMRIdata.RData`, ~80MB) are **git-ignored** and recreated by this
command; their integrity is verifiable via each env's `build_context_digest`.
