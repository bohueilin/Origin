# Origin — the control plane for autonomy (the 3-track winner brief)

*5-agent research synthesis, citations verified live. The headline: Origin's thesis is a near-verbatim
match to what BOTH sponsors publicly championed in the **10 days before** the event — and Origin already has
the live, working proof.*

## The concept
**Origin is the control plane for autonomous agents.** A non-LLM, fail-closed **ratifier** sits on top of a
Gemma-4 proposer and verifies **every action before it executes** — for software agents (`/soc`) and physical
robots (`/foundry`), with a Passport identity layer deciding *who* is allowed before the Guardian decides
*what* is allowed. One loop is the spine of all three submissions:

> **perceive (Gemma-4 vision/text) → propose → RATIFY (deterministic oracle) → block-or-execute → audit**

**One-liner:** *Gemma-4 proposes, a deterministic oracle ratifies every action before it executes, and Cerebras
is the only thing fast enough to make that verification free — so safety stops being a tax and becomes the default.*

**The unifying slogan:** **"Capability is not permission."**

## Why this is the moment (verified citations)
- **Cerebras — Gemma-4 launch blog:** *"Multimodal and agentic loops rarely call a model once… at 100 tok/s
  those loops are too slow… at 1,500 TPS the application and user can work together,"* and fast inference lets
  you *"fit more verification and more retries into the same product"* — speed is *"the new quality lever."*
- **Google DeepMind — "AI Control Roadmap," Jun 18 2026** (deepmind.google/blog/securing-the-future-of-ai-agents/):
  defense-in-depth *"beyond traditional model alignment… assurance even if alignment is imperfect"*; treat agents
  as **insider threats** (MITRE ATT&CK); trusted supervisors monitor reasoning/plans/actions; **block irreversible
  actions in real time**; **Detection D1–D4 / Response R1–R3.**
- **arXiv 2602.09947 — "Trustworthy Agentic AI Requires Deterministic Architectural Boundaries"** (Bhattarai & Vu,
  Feb 2026): alignment is insufficient for authorization; you need **deterministic mediation**, **privilege
  separation (perception ≠ execution)**, **fail-closed default-deny.** (See also arXiv 2603.20953, "Deterministic
  Pre-Action Authorization.")
- **Google / Gemma mission:** an **open** (Apache-2.0) on-device proposer the developer wraps in their *own* judge —
  *"Gemma proposes; you own the judge. We never ask Gemma to police itself."* (ShieldGemma's philosophy, taken to its conclusion.)
- **DeepMind's $10M multi-agent-safety call** (identity, reputation, attenuated delegation, oversight-at-scale) → **Passport.**

**Origin is the working embodiment of DeepMind's 10-day-old roadmap, citable to the academic + sponsor consensus, not a slogan.**

## The 3-track strategy (one engine, three hero beats — do NOT dilute)
| Track | Angle | The single hero beat |
|---|---|---|
| **1 · Multiverse Agents** | The physical-AI control plane: Passport-scoped Planner + Gemma-4 vision + a **deterministic BFS oracle** ratifies the robot. Frame vs DeepMind SIMA/Genie: *"for anything touching the physical world the reward must be a deterministic oracle you can't fool."* | Upload a floor plan → Gemma-4 vision → the Planner proposes a path → the **BFS oracle returns REFUSE** (every route crosses a hazard) → the readiness **license is denied** with the trace. *Capability is not permission, made literal for a body in the world.* |
| **2 · People's Choice** | The money-shot speed race centered on the **prompt-injection catch** — the exact threat both orgs named days before the event. | A prompt injection orders `disable_firewall`. Cerebras **contains it in 65ms (TTFT 11ms)** — *blocked before the GPU finishes its first token (645–858ms).* (`/clip` is built + recordable.) |
| **3 · Enterprise Impact** | The AI-SOC = **DeepMind's roadmap, shipped** — relabeled in their exact vocabulary (D1–D4 / R1–R3 / synchronous blocking / audit-trail-as-safety-certificate). Lead with the economics. | Run the incident queue: the unguarded GPU agent executes the injection-induced destructive action; Origin verifies 6/8 with **0 breaches** + the **autonomy-trace audit log.** *"On a GPU, verification is a tax you can't afford. On Cerebras, it's free."* |

## The demo arc (≤90s)
1. **Cold open (recency shock):** *"Ten days ago DeepMind said alignment can fail, so you need a control layer that treats every agent as an untrusted insider and blocks irreversible actions before they execute. We built it — live, on Cerebras + Gemma-4."* (tok/s already ticking)
2. **Thesis:** *"Capability is not permission. Gemma-4 proposes; a deterministic oracle — never an LLM — ratifies. A bad action is made impossible, not just unlikely."* (loop diagram)
3. **Money shot (injection):** contained in 65ms vs the GPU still on its first token.
4. **Why newly possible:** *"A verifier on every step was a paper idea until inference got this fast."* (ensemble-of-7 in 504ms vs 5.5s)
5. **Economic punch:** safety-tax head-to-head + 5,000 alerts ~16min vs ~36min.
6. **Cross to the body:** same engine → floor plan → BFS oracle REFUSE → license denied.
7. **Identity frontier:** Passport's scoped just-in-time authority feeds the Guardian (DeepMind $10M nod).
8. **Close:** pan the audit panel. *"This trace is the safety certificate."*

## The highest-leverage NEW builds (ranked)
1. **(3h, T3) Relabel `/soc` in DeepMind's roadmap vocabulary** — D1–D4 / R1–R3 / "synchronous block" / "safety certificate." Pure presentation; converts a working demo into *"DeepMind's June roadmap, shipped."* **← building now.**
2. **(4h, T1) The depth + citations artifact** — names the deterministic non-LLM judge as the trusted compute base; cites the roadmap + 2602.09947; states the honesty guardrails out loud. *The artifact that wins Q&A across all three tracks.* **← building now.**
3. **(5h, T2) Record the pre-recorded GPU side-by-side clip** — `/clip` is built; record it (runbook ready). The safety net so wifi can't kill the speed story.
4. **(6h, T1) Passport identity→authority→veto on ONE over-privilege/collusion scenario** — lands the $10M frontier as their literal research. *Depth-by-architecture on one scenario, NOT an agent-economy sim.*
5. **(5h, T3) Hierarchical-supervision viz** — cheap deterministic floor on every alert, premium Gemma-4 speed only on the escalated few (DeepMind's "cheap→expensive monitor" + Cerebras's "spend speed where it creates value").

## Honesty guardrails (these WIN — overclaiming loses the judge who wrote the paper)
- **CONTAIN, don't PREVENT injection.** Origin doesn't stop the model being fooled — the destructive action *never executes* at the deterministic floor. (Confirmed in code: `isDestructive` floor.) Saying "prevents injection" is the fastest way to lose the DeepMind reviewer.
- **Deterministic + auditable, NOT "formally verified."** No Lean/SMT proof. Call the trace the "safety certificate artifact," never "provably safe."
- **Frame-by-frame perception, not "video."** Gemma-4 on Cerebras = image+text in / text out. No video, no training on Cerebras. Stating the ceiling out loud is itself a depth signal.
- **No robot.** "We built the robot-ready brain + the verifiable reward — swap the webcam for the robot's eyes."
- **Don't over-scope multi-agent** (the prior-retro trap). ONE identity→authority→veto scenario, not a population sim.
- **Lead with the DETERMINISTIC, non-LLM, fail-closed judge** — most teams use an LLM as judge (a black box policing a black box). If that distinction isn't loud + early, Origin collapses into "another agent-with-a-checker."
- **Pre-record the race** (wifi + 100 RPM / 100K TPM can kill a live run); live only as the encore.
