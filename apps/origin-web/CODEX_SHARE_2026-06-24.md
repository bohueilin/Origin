# Share with Codex — feedback request (2026-06-24)

Paste this to Codex. We want comprehensive, critical feedback before AGI House (June 27).

## What we shipped / built this session

**LIVE — Origin robot-readiness console** → https://origin-physical-ai.pages.dev (`/app.html`):
- New **3D proving ground** (Three.js). After the operator draws a floor + places robots/items/drops,
  it plays the **deterministic multi-robot plan in 3D**: robots drive → pick up → carry → stack on
  the drop → return home. **No model in the loop** — it renders the exact `planMultiAgent` output,
  so it stays reproducible and "the oracle is the only judge."
- **Embodiment-aware** robot models (humanoid / quadruped / drone / mobile-arm / carrier / AMR,
  + a mixed "all" fleet), **high-bay warehouse racking**, vertical box-stacking on the drop, hi-vis
  human workers in human-only cells, ACES lighting + soft shadows + depth.
- 2D/3D toggle, orbit camera, WebGL fallback. Deployed commit `0ae033c`.

**LOCAL — Passport** (`agent-passport/`, http://localhost:8765, stdlib Python, mock-default):
- "Trust that travels with the agent" simulator: **Travel** + **Procurement** scenarios across
  **single↔multi-agent (A2A)** and **domestic↔international**, driven by the real
  passport/scope/kill-switch engine.
- Run summary (succeeded vs stopped + tools used + reasons), numbered ledger sections, green/red/grey
  color-coding, humanized "stopped" language, 60-sec film link.
- Security tests: **24/24** core + **22/22** red-team (proof-of-possession, anti-replay, denial
  tripwire, prompt-injection / lethal-trifecta / confused-deputy / privilege-escalation coverage).
- Real 1Password + Daytona wiring is scaffolded but **deferred** (keys pending).

## Our thesis (please pressure-test it)

The blocker for autonomous agents isn't model IQ — it's the **trust/authorization/liability layer**.
Reliability (τ-bench SOTA <50%, pass^8 <25%) is a model problem we don't claim to solve; the missing
infra is **identity + scoped capability + revocation + audit**, which the industry is racing to build
(Google AP2, Visa TAP, Mastercard Agent Pay). Passport = the neutral, model-agnostic trust
layer (Auth0/Stripe/Plaid precedent); Origin = the same spine for physical agents.

## Feedback we want — be critical

1. **3D proving ground:** is it convincing/clear, or gimmicky? Does "deterministic plan rendered in
   3D (no model)" land as a *trust* feature or read as just eye-candy? What would make it credible to
   a robotics buyer?
2. **Embodiment realism:** are the robot models recognizable enough? Where does it look toy-like vs
   credible? Worth investing in real GLTF assets?
3. **Story coherence:** does the two-product "trust stack" (physical Origin + software Passport) read
   as one company or two bolted together? Is the wedge sharp?
4. **The thesis:** is "we own the trust layer, not the model" defensible, or will a YC partner say
   "OpenAI/Anthropic will just build this"? What's the strongest counter?
5. **Passport demo:** does single→multi and domestic→international teach the security point fast
   enough? Is the "stopped, contained to one branch" moment landing?
6. **What's missing for AGI House** (Agent Identity Build Day, 1Password + Daytona judges)? What
   would most increase odds of winning?
7. **Honesty/claims audit:** anything that overclaims or could be picked apart (we label measured vs
   projected; flag anything that reads as hype).

## Where to look
- Live: https://origin-physical-ai.pages.dev (`/app.html` → template → Approve → **3D** toggle)
- Code: `src/components/ProvingGround3D.tsx`, `WorkflowIllustration.tsx`
- Passport (run locally): `agent-passport/` → `python3 dashboard/server.py`
- Full handoff: `HANDOFF_2026-06-24.md`
