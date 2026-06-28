# Origin Physical AI

The unified monorepo for **Origin Physical AI** — the trust layer for autonomous systems, from the
robot-readiness site to the agent-identity broker to the RL-environment factory and the reward-hardening
research that makes recursive self-improvement (RSI) safe.

> One thesis across every part: **capability is not permission.** An agent (or a robot) may *propose*;
> a deterministic, auditable control plane decides what it may actually *do*.

## What's inside

| Part | Path | What it is |
|---|---|---|
| **Origin Web** | `apps/origin-web` | The live site (robot-readiness demo + marketing + console). Deploys to `origin-physical-ai.pages.dev`. |
| **Origin Passport** | `apps/passport` | Agentic credential broker + the Autonomy Trace Console (eval gym). Delegated autonomy you can trust. |
| **Chronos UI** | `apps/chronos-ui` | Front-end for the reward-hack discovery / verifier-hardening engine. |
| **FactoryCEO-TRM** | `services/factoryceo-trm` | FastAPI "brain": verifiable planner + repair for the readiness layer. |
| **Cobra** | `services/cobra` | Auto-hardens RL verifiers against reward hacking (red-team → patch → measure). |
| **Chronos** | `services/chronos` | Finds reward hacks in RL trajectories, freezes them as regression tests, patches the grader. |
| **Factory / EnvForge** | `factory/legacy` | Admin console for incoming RL-environment submissions (HTML prototype → React port planned). |
| **packages/** | `packages/*` | Shared TS substrate (verifier-core, evidence, config) — the RSI foundation, filled in over time. |

## Quickstart

```bash
make install        # npm workspaces (TS) + uv sync per Python service
make build          # build all TS apps
make gates          # build + test the TS surface
make dev-web        # run the live site locally
make dev-passport   # run the Passport demo (vite + Hono + tunnel)
make help           # all targets
```

Python services are isolated (`cd services/cobra && uv run …`). See the [Makefile](Makefile).

## Docs
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — the layered architecture + trust boundaries (the "how it actually works")
- [docs/MIGRATION.md](docs/MIGRATION.md) — provenance of the merged sources + tooling decisions
- [docs/DEPLOY.md](docs/DEPLOY.md) — how the live site deploys + the (human-owned) cutover
- [docs/RSI-ROADMAP.md](docs/RSI-ROADMAP.md) — where RL-environments + recursive self-improvement go next

Secrets live only in per-app `.env.local` (gitignored) — never committed. Copy `.env.example` to start.
