# Origin — Codex / agent operating guide

> **Start from `/Users/bohueilin/hackathons/Origin`. Do not inspect the old hackathon folders** (`0619`, `0620`, `0620-test`, `Cerebras-0628`, `Cerebras-enterprise-0628`, `Chronos`, `Cobra`, `Floor design`) unless Bo-Huei explicitly asks. As of 2026-07-05 the consolidation is complete; those folders are historical references only and their copies are older than Origin.

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
