# RSI Roadmap — RL Environments + safe recursive self-improvement

The monorepo exists so the next phase has one home: **build RL environments and let agents recursively
self-improve (RSI) without learning to cheat the reward.** The pieces are now co-located to make that
natural.

## The loop we're building toward
1. **Intake** (`factory/` EnvForge) — customers submit real-world behavior; we turn it into a reproducible
   RL environment: task spec, verifier rules, hidden tests, expert calibration, readiness gates.
2. **Harden the verifier** (`services/cobra` + `services/chronos`) — before any training uses a grader as
   a reward, red-team it for reward hacks, freeze exploits as deterministic regression tests, patch the
   grader, and measure robustness (% cheats blocked, honest-pass preserved).
3. **Train / self-improve** — RL/RFT against the *hardened* verifier; the control plane (`packages/verifier-core`)
   issues a readiness license only when the deterministic oracle agrees.
4. **Gate deployment** (`apps/origin-web` proving ground + `apps/passport` broker) — capability ≠ permission;
   real-world actions stay human-gated and credential-brokered.
5. **Audit + iterate** — tamper-evident evidence feeds the next round.

## Near-term build order (proposed)
- **R1 — Convert EnvForge** `factory/legacy/*.html` → `apps/envforge` (React/Vite, matches the other apps) backed by InsForge tables for the submission queue.
- **R2 — Extract `packages/verifier-core`** the deterministic oracle/verifier shared by origin-web + passport (today duplicated) so one hardened verifier serves every surface.
- **R3 — Cobra⇄Chronos contract** make Chronos's ReleaseProof / hardened-grader output a typed input to Cobra's training loop (it's conceptually wired; formalize it).
- **R4 — First end-to-end RSI demo** one submitted environment → hardened verifier → a short RL run that *would* have reward-hacked but is caught → readiness license.

## Open design questions to settle as we go
- Where RL environments are materialized/run (Modal? Docker? HUD) and how that surfaces in `services/`.
- Whether `packages/evidence` becomes the single InsForge evidence store for all surfaces.
- The unit of "an environment" shared between EnvForge intake and the Cobra/Chronos harness.
