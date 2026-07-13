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
make install && make gates                         # TS monorepo build+test
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
Bounded Robot-Readiness Gym evidence, not certification · deterministic oracle authority · tamper-evident = alteration is *detectable* (not "impossible") · synthetic ≠ real · counterfactual ≠ customer-owned · fixture ≠ real customer data · readiness blocked by default · training authorization required · external APIs blocked.
