# Origin — Repo Structure

The canonical tree. Start here.

```
Origin/
├─ README.md · PROJECT_OVERVIEW.md · REPO_STRUCTURE.md · CLAUDE.md · CODEX.md   # start here
├─ Makefile · package.json (npm workspaces) · tsconfig.base.json
│
├─ apps/
│   ├─ origin-web/     # LIVE site + /foundry /soc /rsi consoles + rlkit (nine-pillar RL evidence) + warehouse oracle. 360 tests.
│   │   ├─ rlkit/                     # env-manifest, reward-module, executor, cost-ledger, checkpoint, env-promotion, …
│   │   ├─ src/warehouse.ts           # the deterministic oracle (verifyWarehouseRollout + bfsOracle) — the only judge
│   │   └─ docs/examples/*            # digest-valid bundle/episode/receipt trios
│   ├─ passport/       # agent credential broker + Autonomy Trace Console
│   └─ chronos-ui/     # reward-hack discovery UI (React 18, standalone build)
│
├─ services/          # Python (uv), each isolated
│   ├─ chronos/        # reward-hack discovery / verifier hardening
│   └─ cobra/          # RL verifier auto-hardening (red taxonomy → patch → measure)
│
├─ schemas/           # index → the canonical schemas next to their validators
├─ evidence/          # what the evidence bundles are + how to regenerate (artifacts not committed)
├─ datasets/ · factory/legacy/ (envforge-console_615.html) · packages/ (shared TS, filled over time) · tools/
│
├─ legacy-imports/    # useful snapshots (source-only): loopforge/, agent-passport/  (+ README with promotion paths)
│
└─ docs/
    ├─ handoffs/
    └─ architecture/             # ORIGIN_TRUST_ARCHITECTURE
```

## Build / test entry points
| Surface | Command |
|---|---|
| Whole TS monorepo | `make install` · `make build` · `make gates` |
| Live site (local) | `make dev-web` (Vite :5275 + Hono :8787) |
| origin-web gates | `cd apps/origin-web && npm run build && npm run lint && npm run verify:evidence && npm test` |
| RL evidence | `cd apps/origin-web && npm run env:verify` (+ `env:run` / `env:promote` / `reward:diff` / `curriculum:verify`) |
