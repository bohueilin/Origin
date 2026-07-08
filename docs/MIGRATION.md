# Migration — npm workspaces today, pnpm (+ Turborepo) later

**Status: pnpm/turbo are a documented FUTURE upgrade — not installed here** (same statement as
CLAUDE.md and README). The front door today is the [Makefile](../Makefile) + native npm workspaces.
This doc records the one deliberate exception (chronos-ui) and the conditions under which the
upgrade should actually happen.

## Today: npm workspaces + one deliberate standalone

| Surface | Managed by |
|---|---|
| `apps/origin-web`, `apps/janus`, `packages/*` | npm workspaces — single root `package-lock.json` |
| `apps/chronos-ui` | **standalone** — its own `node_modules` and `package-lock.json` |
| `services/{cobra,chronos}` | Python, per-service `uv` venvs (unaffected by any of this) |

### Why chronos-ui is NOT a workspace (React 18 vs 19)
`apps/chronos-ui` is React **18.3** (with `@xyflow/react` 12); `origin-web` and `janus` are
React **19**. Under npm's hoisted `node_modules`, adding chronos-ui to the workspaces array would
let its `tsc --noEmit` resolve the hoisted `@types/react@19` and let two React majors mix at
install time. So it installs and builds standalone, and **every tool must drive it standalone**:

- Correct: `npm --prefix apps/chronos-ui install && npm --prefix apps/chronos-ui run build`
  (root `build:chronos-ui` script) or `cd apps/chronos-ui && npm run <script>` (Makefile targets).
- Wrong: `npm run <script> -w @origin/chronos-ui` — fails with `No workspaces found` because the
  package is intentionally absent from `workspaces`. Never reintroduce `-w` for this package.

CI (`.github/workflows/ci.yml`) mirrors the split: the two workspace apps install once from the
root lockfile; chronos-ui gets its own `npm ci` + build job keyed on its own lockfile.

## Later: pnpm, then (maybe) Turborepo

**Trigger — not a date, a condition:** migrate when `packages/` gains its first real members
(`packages/evidence`, `packages/verifier-core` — see [ARCHITECTURE.md](ARCHITECTURE.md)). That is
the moment hoisting/linking starts to matter; before it, the tooling would solve nothing.

**Why pnpm ends the chronos-ui exception:** pnpm's isolated, symlinked `node_modules` (no hoisting)
lets React 18 and React 19 trees coexist as ordinary workspace members — chronos-ui joins the
workspace and its standalone lockfile is deleted. (Alternative exit that needs no new package
manager: upgrade chronos-ui to React 19 — React Flow 12 supports it — and fold it in.)

**Sketch of the move, when triggered:**
1. `corepack enable` and pin pnpm; add `pnpm-workspace.yaml` covering `apps/*` (now including
   chronos-ui) and `packages/*`.
2. `pnpm import` to convert the root `package-lock.json`; verify installs, then delete both npm
   lockfiles.
3. Replace the `--workspaces` / `--prefix` / `cd` plumbing in `package.json`, `Makefile`, and
   `.github/workflows/*` with `pnpm -r` / `pnpm --filter`.
4. Add Turborepo only for build/test caching, and only once ≥3 packages exist — nothing to cache
   before that.
5. Gates before and after: `make gates` + CI fully green, and the deploy-critical files in
   `apps/origin-web` stay byte-for-byte identical (CLAUDE.md hard rule). No live-deploy changes
   are part of this migration.
