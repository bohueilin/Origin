# Origin — the control plane for autonomy

> **`gemma-4-31b` on Cerebras proposes every action. A deterministic oracle — never an LLM — ratifies it before it executes. Cerebras makes that per-step verification effectively free.**
>
> **Capability is not permission.**

Built for the **Cerebras × Google DeepMind — Gemma-4 24h Hackathon** (Track 1: Multiverse Agents; also Track 3 Enterprise, Track 2 People's Choice). One engine — *Quorum* — *no agent acts alone; every action is ratified.*

- **Live demo (static showcase):** https://origin-physical-ai.pages.dev
- **60-second video:** `<VIDEO LINK>`
- **X / Twitter (latency race):** `<X LINK>` — @Cerebras @googlegemma

---

## The idea in one breath

Every autonomy demo shows a model that *can* act. None show what stops it from acting *wrong*. Origin does:

1. **Gemma-4 proposes.** Three `gemma-4-31b` agents on Cerebras — **Perceiver → Planner → Guardian** — read the world (text **and images**) and propose the next action.
2. **A deterministic oracle ratifies.** Pure geometry/set-algebra — **never an LLM grading an LLM**. A bad action is made *impossible*, not just unlikely (fail-closed, default-deny).
3. **Cerebras makes it affordable.** Verifying *every step* means two Gemma calls per action. At **~1,300 tok/s** that tax is effectively free — so the safety check rides on every step instead of being sampled around.

The same engine governs a **robot on a floor** (physical) and a **software agent with credentials** (digital): identity → authority → verified action.

## Why Cerebras is essential, not incidental

Safety is **loop-bound**: every extra proposal-per-minute is one more unsafe completion the oracle can catch. On GPU latency, a Guardian-on-every-step loop falls out of real time, so people skip per-step verification — and that's exactly where reward-hacking and prompt-injection slip through. Cerebras collapses per-step verification from a cost you ration into a guarantee you can always afford. **The speed is the architecture.**

## Track-1 criteria → proof (every claim traces to a file)

| Criterion | What it is | Proof |
|---|---|---|
| **Agent collaboration** | 3-agent SOC loop (Perceiver→Planner→Guardian), each `gemma-4-31b`; a fail-closed deterministic floor is the only judge. | route `/soc`, `src/foundry/soc/` |
| **Multimodal** | Upload a floor-plan **image** → `gemma-4-31b` vision reads it into a structured site map a deterministic pass repairs. **Image in, text out — stills, not video.** | route `/foundry`, `/api/foundry/parse-floor` |
| **Speed in action** | Loop-race: Cerebras fully triages + verifies ~6–8 incidents in the wall-time a GPU baseline does **one**; live tok/s from the API's `time_info`. | route `/soc`, `/foundry` speed race |
| **Innovation / physical-AI** | **Spatial Passport authority edge**: a human-only zone is passable **only** with a live, scoped grant → REFUSE fires on *policy*, not just hazard. | `src/siteEval.ts`, `src/foundry/soc/passport.ts` |

**Live-verified safety beat:** Gemma was fooled by **2 prompt injections; the deterministic floor blocked both — 0 destructive actions executed.**

## Honest by design (the lines we don't cross)

- **Inference only.** `gemma-4-31b` on Cerebras is **image+text in / text out**. No training on Cerebras, no video generation.
- **The deterministic oracle is the only judge** — never an LLM grading an LLM. We *contain* prompt injection; we don't claim to *prevent* it — the destructive action just never executes at the floor.
- **Multimodal = stills** (floor-plan images, alert screenshots), never video.
- **Speed = platform comparison** (same/peer `gemma-4-31b`, Cerebras WSE vs a GPU baseline) — not "our model is smarter." On-screen tok/s is real `time_info`.
- **Robot-ready = the brain, not a robot.** The actuator today is a tool-call.
- The **live URL is the static showcase**; the interactive Cerebras loop is in the locally-recorded video (never conference wifi).

---

## What's inside

| Part | Path | What it is |
|---|---|---|
| **Origin Web** | `apps/origin-web` | The live site + the Foundry (`/foundry`) and AI-SOC (`/soc`) consoles. Deploys to `origin-physical-ai.pages.dev`. |
| **Origin Passport** | `apps/passport` | Agentic credential broker + Autonomy Trace Console — delegated authority you can trust. |
| **Chronos UI** | `apps/chronos-ui` | Front-end for the reward-hack discovery / verifier-hardening engine. |
| **Cobra / Chronos** | `services/{cobra,chronos}` | Auto-harden RL verifiers against reward hacking (red-team → patch → measure). |
| **Training Evidence** | `apps/origin-web/rlkit` | Reproducible **ScoreReceipts** — the nine-pillar RL-evidence layer (`env:verify`). |

## Quickstart

```bash
make install        # npm workspaces (TS) + uv sync per Python service
make build          # build all TS apps
make gates          # build + lint + test the TS surface
make dev-web        # run the live site locally (Vite :5275 + Hono :8787)
make help           # all targets
```

The interactive loop needs a Cerebras key (server-side only). Without one, every surface degrades to a **clearly labeled** deterministic mock — the story still holds, nothing is faked. Secrets live only in per-app `.env.local` (gitignored), never committed.

## Where to look

- **Routes:** `/` (landing) · `/foundry` (floor → gym → license) · `/soc` (AI-SOC loop-race) · `/passport` (identity → authority → veto)
- **The oracle (the only judge):** `apps/origin-web/src/warehouse.ts` → `verifyWarehouseRollout` + `bfsOracle`

---

*Validated by the consensus, not a slogan: DeepMind's AI Control Roadmap (synchronous blocking, fail-closed) and arXiv 2602.09947 (deterministic architectural boundaries) — in code.*
