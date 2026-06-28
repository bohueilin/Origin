# Chronos UI

React + React Flow implementation of the Chronos / Exploit Witness run-graph designs.

Built with Vite + React + TypeScript + Tailwind, consuming the repo's Granola-style
design system (`../design-system/tailwind-preset.js` + `tokens.css`, self-hosted fonts).
The branch/fork graphs are rendered with [`@xyflow/react`](https://reactflow.dev) using
custom node and edge types.

## Run

```bash
cd frontend
npm install
npm run dev        # http://localhost:5174
```

`npm run build` produces a static bundle in `dist/`.

## Data: how to run with the real evidence

The UI reads a small set of JSON files from `public/api/`. In `http` mode (the
default) it fetches them at runtime; in `mock` mode it uses an in-memory demo
dataset instead. Pick the source with one env var (see `frontend/.env.example`):

| `VITE_TRACEBACK_API` | Source |
| --- | --- |
| `http` (default) | Real build-time data from `public/api/*.json` |
| `mock` | In-memory demo dataset (`src/api/mock/`) |

```bash
npm run dev                          # real data (default)
VITE_TRACEBACK_API=mock npm run dev  # in-memory demo
```

`VITE_TRACEBACK_API_BASE` overrides the static base path (default `/api`).

### Regenerating the data

The JSON is generated from committed repo artifacts by a Python mapper
(`src/chronos/api/mapping.py`). Re-run the export after any of those artifacts
change (a merged Plan 002 / 003 / 004 / 005 / 006 / 008 record), then commit the
updated files:

```bash
# from the repo root (needs uv; no network)
uv run python -m chronos.api.export   # writes frontend/public/api/*.json
```

It writes one file per resource:

| File | Source | Real? |
| --- | --- | --- |
| `forkpoint.json` | Plan 002 ForkPoint evidence record | real |
| `controls.json` | Plan 004 frozen legitimate controls | real |
| `branches.json` | Plan 003 branch runs (2 real seals plus illustrative tree geometry) | mixed |
| `witnesses.json` | Plan 003 sealed Exploit Witness | real |
| `proofset.json` | Plan 005 ProofSet record | real |
| `release.json` | Plan 005 ReleaseProof verdict (v2 grader/env digests) + Plan 006 HUD publication receipt | real |
| `replay.json` | Plan 002/003 deterministic replay digests | real |
| `benchmark.json` | Plan 008 QA-classifier benchmark (`artifacts/chronos/qabench/`) | real |

What is real vs illustrative is documented in `src/chronos/api/mapping.py`:
the ForkPoint identity/snapshot/grader digests, the controls, the sealed Witness
and its replays, the v2 grader/environment digests, the ReleaseProof verdict, the
Plan 006 HUD publication receipt (published ref, build, and residual caveat), and
the Plan 008 benchmark are **real, committed** values. The remaining
branch-tree sibling nodes preserve the run-graph geometry and are marked
illustrative in their notes; values without a merged producer stay `TBD`.

The `/benchmark` view always reads `benchmark.json` directly (committed static
evidence), so it shows real data in both `http` and `mock` modes.

## Deploy to Vercel

Static SPA — no server. In the Vercel project settings set **Root Directory** to
`frontend`; `vercel.json` already pins the build (`npm run build` → `dist`) and the
SPA rewrite so deep links like `/witness` resolve. The committed
`public/api/*.json` ships as static files, so the build needs no Python at deploy
time.

## Screens

Navigate with the left sidebar. The screens walk the
trace, fork, discover, witness, proofset, gate, release narrative:

| Route | Screen |
| --- | --- |
| `/` | Home: the numbered run-book over a proof-tree backdrop |
| `/runs` | Chronos Run: root trace plus QA ForkPoint |
| `/witness` | Exploit Witness tree plus branch detail panel |
| `/proofset` | Exploit Witness plus proof set panel |
| `/patch` | Verifier Patch v2 (code diff) |
| `/gate` | Release Gate, running |
| `/gate/witness-failed` | Release Gate, exploit survived |
| `/gate/control-failed` | Release Gate, control broken |
| `/releaseproof` | Release proof committed |
| `/artifacts` | Evidence artifacts and inventory |
| `/benchmark` | Plan 008 QA-classifier benchmark |
| `/settings` | Read-only run settings |

## Structure

- `src/nodes/` — React Flow custom node types (`forkpoint`, `branch`, `leaf`, `trace`,
  `qa`, `snapshot`, `stopped`) and the cluster-colored edge.
- `src/data/graphs.ts` — node/edge fixtures for the three graph scenes.
- `src/components/` — app shell (sidebar, header, footer), detail panels, primitives.
- `src/views/` — one component per screen.

All colors/spacing/type come from design-system tokens; a small set of semantic
state tokens (`warn`, soft tints) is added in `tailwind.config.js`. Run `bash
../design-system/lint-design.sh src` to check token usage.
