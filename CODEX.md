# Origin — Codex / agent operating guide

> **Work from this repo only.** This is the PUBLIC repo — the trust layer + evidence format + demos.
>
> **Internal status, roadmap, and strategy live in a private doc kept OUTSIDE this public repo** — ask
> the maintainer for it. The proprietary algorithm work lives in a separate private repo and must never
> land here; only its public *evidence format* appears in this repo.

## Read first
`README.md` → `PROJECT_OVERVIEW.md` → `REPO_STRUCTURE.md`.

## Active commands
```bash
make install
make gates-all                                    # all 14 suites + evidence + honesty
cd apps/origin-web && npm run build && npm run lint && npm run verify:evidence && npm test
cd apps/origin-web && npm run env:verify            # a reproducible ScoreReceipt (exit 0)
```

## Hard rules (do not violate without explicit Bo-Huei authorization)
- **No deploy. No push. No git staging. No external APIs.**
- **Training fail-closed:** never run/enable training without explicit `training_authorized` + `train_policy` scope.
- **Real customer readiness stays blocked** until approved real customer evidence exists and passes gates.
- **Oracle-only labels/rewards** — the deterministic oracle is the only judge; never an LLM grading an LLM.
- **Generated counterfactual** robustness is **not** customer-owned proof; **synthetic demo** evidence is **not** real customer proof; an **authorized local fixture** is **not** real customer data — keep the lanes separate.
- Learned-policy results use **route-summary / map-derived features**, not raw end-to-end perception.
- **No production-autonomy claim. No robot-certification claim.**
- **Never commit `.env*`** except `.env.example`. Rotate any key that was ever local to the old `0620` folder.

## Claim boundaries to preserve in all docs/copy
Reproducible under this verifier, never safe or correct · deterministic oracle authority · tamper-evident = alteration is *detectable* (not "impossible") · synthetic ≠ real · counterfactual ≠ customer-owned · fixture ≠ real customer data · readiness blocked by default · training authorization required · external APIs blocked.

## Canonical release
The live site is https://originphysicalai.com, built from `apps/origin-web`. The Cloudflare Pages cutover completed on 2026-09-16. Pushing to `main` runs builds and checks; it does not deploy. With explicit owner authorization, dispatch `.github/workflows/deploy-origin-web.yml` on `main` with confirmation `DEPLOY`. The workflow re-tests and stamps the release before upload. See [the deploy runbook](docs/DEPLOY.md).

Run `make gates-all` from a clean tracked tree when a new local scoreboard is requested. Before handing back a website task, run the honesty lint, `node --test scripts/visible-text.test.mjs`, the app's `npm run gates` and full `npx playwright test`, then inspect `git status --short`. Stage explicit paths only; never include private founder files or recording masters. Follow the precise byte-preservation list in `AGENTS.md`.
