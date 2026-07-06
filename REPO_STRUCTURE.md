# Origin — Repo Structure

The canonical tree. Start here; you should not need the old hackathon folders (`docs/CONSOLIDATION_STATUS.md`).

```
Origin/
├─ README.md · PROJECT_OVERVIEW.md · REPO_STRUCTURE.md · CLAUDE.md · CODEX.md   # start here
├─ MIGRATION_INVENTORY.md · REORG_PLAN.md · MIGRATION_MANIFEST.md               # the 2026-07-05 consolidation
├─ Origin_Customer_Discovery_Kit.md · Origin_YC_Consolidation_v2_1.md           # strategy
├─ Makefile · package.json (npm workspaces) · tsconfig.base.json
│
├─ apps/
│   ├─ origin-web/     # LIVE site + /foundry /soc /rsi consoles + rlkit (nine-pillar RL evidence) + warehouse oracle. 360 tests.
│   │   ├─ rlkit/                     # env-manifest, reward-module, executor, cost-ledger, checkpoint, env-promotion, …
│   │   ├─ src/warehouse.ts           # the deterministic oracle (verifyWarehouseRollout + bfsOracle) — the only judge
│   │   ├─ docs/rl-platform-architecture.md   # the RL-evidence design doc (thesis + 9 pillars)
│   │   └─ docs/examples/*            # digest-valid bundle/episode/receipt trios
│   ├─ passport/       # agent credential broker + Autonomy Trace Console
│   └─ chronos-ui/     # reward-hack discovery UI (React 18, standalone build)
│
├─ services/          # Python (uv), each isolated
│   ├─ chronos/        # reward-hack discovery / verifier hardening
│   ├─ cobra/          # RL verifier auto-hardening (red taxonomy → patch → measure)
│   ├─ factoryceo-trm/ # verifiable planner + repair
│   └─ foundry-train/  # Fireworks-RFT reward-bridge (reward = the oracle) — NOT the gym compiler
│
├─ site-to-gym/       # ★ Site-to-Gym / RSI gym compiler (imported from Floor design) — self-contained, own gates
│   ├─ services/foundry-train/  # 16 gym/dataset builders (distinct from Origin/services/foundry-train)
│   ├─ ml/                       # 31 training/eval scripts (safety + occupancy policies)
│   ├─ scripts/                  # 21 Node validators/renderers (validate_trust_boundaries, render_rsi_dashboard…)
│   ├─ schemas/                  # RSI + customer-evidence + design-partner-contract JSON schemas
│   ├─ data/ · datasets/         # synthetic customer sites + seed floors + lane_registry (generated *.jsonl excluded)
│   ├─ design_partner_intake_template/   # the design-partner intake contract + fixture
│   ├─ docs/foundry/             # 25 RSI/policy/calibration/design-partner review docs
│   ├─ package.json (71 gates) · CHECKSUMS · ORIGIN_IMPORT.md
│
├─ schemas/           # index → the canonical schemas next to their validators
├─ evidence/          # what the evidence bundles are + how to regenerate (artifacts not committed)
├─ datasets/ · factory/legacy/ (envforge-console_615.html) · packages/ (shared TS, filled over time) · tools/
│
├─ legacy-imports/    # useful snapshots (source-only): loopforge/, agent-passport/  (+ README with promotion paths)
│
└─ docs/
    ├─ CONSOLIDATION_STATUS.md   # canonical vs imported vs safe-to-ignore
    ├─ foundry/                  # RSI dataset reviews, design-partner handoffs, RSI_GYM_COMPILER_IMPORT.md, CLAUDE_REPO_REORG_HANDOFF.md
    ├─ handoffs/
    ├─ architecture/             # ORIGIN_TRUST_ARCHITECTURE, SITE_TO_GYM_SYSTEM_ARCHITECTURE
    ├─ product/                  # ORIGIN_PRODUCT_STACK, DESIGN_PARTNER_PILOT_WORKFLOW
    └─ yc/                       # ORIGIN_YC_CONSOLIDATED_NARRATIVE
```

## Build / test entry points
| Surface | Command |
|---|---|
| Whole TS monorepo | `make install` · `make build` · `make gates` |
| Live site (local) | `make dev-web` (Vite :5275 + Hono :8787) |
| origin-web gates | `cd apps/origin-web && npm run build && npm run lint && npm run verify:evidence && npm test` |
| RL evidence | `cd apps/origin-web && npm run env:verify` (+ `env:run` / `env:promote` / `reward:diff` / `curriculum:verify`) |
| Site-to-Gym | `cd site-to-gym && npm run demo` · `npm run validate:rsi` · `node scripts/validate_trust_boundaries.mjs` |
| Training gate (fail-closed) | `cd site-to-gym && npm run train:customer-policy` → `TRAINING_NOT_AUTHORIZED` |

## Naming caution
`services/foundry-train` (RFT reward-bridge) ≠ `site-to-gym/services/foundry-train` (gym/dataset builders). Same folder name, different projects. See `docs/foundry/RSI_GYM_COMPILER_IMPORT.md`.
