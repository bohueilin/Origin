# Discord Submissions — Origin Foundry / engine "Quorum"

> **STATUS: DRAFT ONLY. Do NOT post.** Nothing here has been published to Discord, X/Twitter,
> or anywhere. These are three ready-to-paste posts (one per track) for a human to review, tighten,
> and submit manually. **Before posting:** fill the `<VIDEO LINK>` and `<REPO LINK>` placeholders,
> and scrub for secrets — no API keys, tokens, phone numbers, or notification banners in any frame.

**Event:** Cerebras × Gemma-4 24h hackathon. Model: `gemma-4-31b` on Cerebras Inference.
**Deadline:** Mon Jun 29, 10:00 PT. **One separate Discord post per track** (+ an X post for Track 2).

---

## Honesty ledger (applies to all three posts — keep every claim truthful)

- **Speed is real.** Measured live: **~1,284 tok/s, TTFT ~8 ms** on `gemma-4-31b` / Cerebras.
  Headline **"~1,500 tok/s"** is the rounded ceiling — say "up to ~1,500" or show the measured number.
- **"~15× a comparable GPU"** is a speed-class statement, not a per-run measurement. Always "about 15×."
- **Claim speed + latency, not energy or cost.** WSE wins tok/s + TTFT at low batch (the real-time agent
  regime). Do not claim energy-per-token or cost-at-scale wins.
- **Training is real but small.** Say "small but real RL loop." Never imply a production-scale robot.
- **The oracle is real and deterministic.** PASS/score come from `src/warehouse.ts verifyWarehouseRollout`
  + `bfsOracle` — not from an LLM. That separation is the whole pitch; never blur it.
- **GPU baseline = Gemini** (allowed). Gemma-4-on-Cerebras stays the primary/hero side.
- Any illustrative figure must be labeled illustrative. The only unlabeled live numbers are real
  API `time_info` (tok/s / TTFT).

---

# POST 1 — #g4hackathon-multiverse-agents

> Tailored to the Track-1 rubric: **agent collaboration · multimodal use of Gemma-4 · speed in action ·
> innovation, with the physical-AI / robotics / embodied bonus.** Paste the block below.

---

**🏭 Origin Foundry — engine "Quorum"** ( *no agent acts alone; every action is ratified* )

**Hook:** Upload a floor plan and `gemma-4-31b` reads it into a real robot-training world — then a
multi-agent loop verifies **every single step** at Cerebras speed, so the policy literally can't reward-hack.

**What it does**
1. **See (multimodal).** Drag in a floor-plan photo. `gemma-4-31b` *vision* (base64 `image_url`, Structured
   Outputs `strict:true`) reads it into a `DescriptiveSiteMap`, which a **deterministic validator**
   (`floorValidator.ts`) repairs into a grid the robot can physically live in — sealing unreachable cells,
   clamping out-of-bounds walls, normalizing the start.
2. **Plan + verify (multi-agent).** The **Quorum** loop: a **Planner** (`gemma-4-31b`) proposes one action;
   a **Guardian/Verifier** (`gemma-4-31b`) **ratifies or vetoes it — every step, no exceptions** — before it
   ever executes. `observe · scan · move · pick · drop · finish · escalate · refuse`.
3. **Score (deterministic).** The rollout is graded by a **deterministic oracle**
   (`verifyWarehouseRollout` + `bfsOracle`) — **never an LLM.** We also return a **no-Guardian
   counterfactual**: the same plan, unverified, drives straight into the hazard — proving exactly what
   per-step verification bought you.

**Why gemma-4-31b on Cerebras is central — and why the speed is essential**
Per-step verification means we pay for **two** Gemma-4 calls (Planner + Guardian) on **every** action in the
loop. On a GPU that tax is unaffordable in real time. On Cerebras — **~1,284 tok/s measured, TTFT ~8 ms**
(up to ~1,500 tok/s headline) — the Guardian ratifies each step so fast that "verify everything" feels free.
**Speed is not a vanity metric here; it is what makes per-step verification a viable safety architecture.**

**Multimodal angle:** Gemma-4 vision is the front door — a raw floor-plan image becomes a typed, executable
RL environment. Pixels → structured world → embodied plan, all in one model family.

**The wedge (physical-AI / embodied):** *Capability is not permission.* The judge of "did it do the job
safely" is **deterministic code, never a model** — so the robot policy can't sweet-talk its grader. This is
the robot-ready brain: real-time see → plan → ratify → act → score.

**Honest hardware note:** we built the robot-ready *brain*, not the robot. The loop runs on Cerebras
precisely because **GPU latency would break it** — at GPU tok/s, a Guardian-on-every-step loop falls out of
real time and the whole verification model collapses. The speed is the architecture.

**Demo video (≤60s):** `<VIDEO LINK>`
**Repo:** `<REPO LINK>`

`gemma-4-31b` · Cerebras Inference · deterministic oracle · multi-agent · multimodal

---

# POST 2 — #g4hackathon-people-choice

> Tailored to the Track-2 rubric: **organic reach · engagement · content quality · authenticity**, anchored
> by a ≤60s X video tagging **@Cerebras + @googlegemma**. The Discord post points judges at the X post and
> the clip. (Tags belong in the X post text, not burned into the video.)

---

**🏭 Origin Foundry — engine "Quorum"** ( *no agent acts alone; every action is ratified* )

**Hook:** The GPU is still typing its first answer. Cerebras already ran the **whole** loop and verified
the job was safe.

**What it does (in the clip)**
A split-screen latency race, **same prompt · same Gemma-4 family · the only difference is the silicon.**
Left = GPU baseline (Gemini). Right = `gemma-4-31b` on Cerebras running the entire **Quorum** loop:
read the floor → plan the moves → a **Guardian ratifies/vetoes every step** → a deterministic oracle scores
it → license issued. Then the eerie beat: I start reading an unsafe step aloud and **the Guardian vetoes it
before I finish the sentence.**

**Why gemma-4-31b on Cerebras is central — and why the speed is essential**
The video *is* the speed. We're not racing one call — we're racing an entire multi-agent **verify-loop**.
At **~1,284 tok/s measured, TTFT ~8 ms** (about **15× a comparable GPU**), Cerebras completes the full
loop while the GPU is mid-first-sentence. Per-step verification is only watchable — only *real-time* — at
this speed. That's why the win is *felt*, not explained.

**Multimodal angle:** the race starts from a **floor-plan image** that Gemma-4 vision turns into a real
RL environment on screen — so the "wow" is grounded in something tangible, not a toy text prompt.

**The shareable wedge (authenticity):** most "AI safety" lets an LLM grade the LLM. Ours can't — the judge
of safety is a **deterministic oracle, never a model.** *Capability ≠ permission.* That's the line that
earns the reply, not just the like.

**Honest hardware note (and it makes the clip stronger):** we built the robot-ready *brain*, not the robot —
and we say so on screen. The reason the loop has to run on Cerebras is that **GPU latency would break it**;
the side-by-side race is the honest proof, not a flex.

**X post (≤60s video, tags @Cerebras + @googlegemma):** `<VIDEO LINK>`
**Repo:** `<REPO LINK>`

`gemma-4-31b` · Cerebras Inference · ≤60s latency race · @Cerebras @googlegemma

---

# POST 3 — #g4hackathon-enterprise-impact

> Tailored to the Track-3 rubric: **business impact (incident response / cybersecurity / KM) ·
> production-readiness · technical excellence · AI differentiation.** Same engine, framed as a real-time
> multimodal AI-SOC pattern with a guardian and a deterministic audit trail.

---

**🏭 Origin Foundry — engine "Quorum"** ( *no agent acts alone; every action is ratified* )

**Hook:** A real-time, multi-agent autonomy pipeline where **every** AI action is ratified before it
executes — and the final pass/fail is signed by **deterministic code, never an LLM.** That's an
incident-response / autonomy-governance primitive you can put in production.

**What it does**
Origin Foundry ingests a visual artifact (here, a floor plan; in the enterprise the same `image_url` slot
takes a dashboard, a network map, an alert screenshot) via `gemma-4-31b` vision into a typed, validated
world. Then the **Quorum** loop runs **Planner → Guardian/Verifier**, both `gemma-4-31b`: the Guardian
**ratifies or vetoes every proposed action** with a one-line reason, and the run is scored by a
**deterministic oracle** (`verifyWarehouseRollout` + `bfsOracle`). The result is a signed
**license** card — pass/fail, reward, and a full per-step audit trail of who proposed what and why it was
ratified or vetoed.

**Why gemma-4-31b on Cerebras is central — and why the speed is essential**
Production incident response and autonomy governance both demand **per-action review in real time** —
exactly the workload that's prohibitively slow on a GPU because you're running a verifier on *every* step.
Cerebras makes it tractable: **~1,284 tok/s measured, TTFT ~8 ms** (up to ~1,500 headline). The speed is
what turns "human-in-the-loop on every action" from a nice idea into a deployable control. Slow inference
doesn't just degrade UX here — it makes the safety architecture impossible.

**Multimodal angle:** the entry point is an *image* — Gemma-4 vision parses unstructured visual artifacts
(floor plans today; dashboards, topology diagrams, alert captures in the enterprise) into structured,
machine-checkable state. One model family from pixels to governed action.

**Production-readiness & technical excellence:** Structured Outputs `strict:true` for typed contracts;
`reasoning_effort: none` on the hot path for latency; a **deterministic validator** that repairs malformed
model output instead of trusting it; real `time_info` metrics surfaced from the API; a labeled deterministic
**mock fallback** when the upstream is unavailable; and an explicit **no-Guardian counterfactual** that
demonstrates, on every run, the concrete failure the verifier prevents.

**The differentiator:** *Capability is not permission.* By making the judge of "did it do the job safely"
a **deterministic oracle rather than an LLM**, the system is structurally immune to reward-hacking and
prompt-injection of the grader — the agent cannot talk its way past the audit. We reuse a hardened RL/eval
stack (GRPO, red/green reward-hardening) behind this; training here is **small but real.**

**Honest hardware note:** we built the robot-ready *brain* — the verification control plane — not the robot
or a full production SOC. The pipeline runs on Cerebras because **GPU latency would break the loop**:
per-action ratification at scale is only real-time at WSE speed.

**Demo video (≤60s):** `<VIDEO LINK>`
**Repo:** `<REPO LINK>`

`gemma-4-31b` · Cerebras Inference · deterministic oracle · per-action audit trail · production-minded

---

## Pre-flight checklist (before any human posts)

- [ ] `<VIDEO LINK>` and `<REPO LINK>` filled in for all three posts.
- [ ] Posted to the correct channel: Post 1 → #g4hackathon-multiverse-agents, Post 2 →
      #g4hackathon-people-choice, Post 3 → #g4hackathon-enterprise-impact.
- [ ] Track-2 X video tags **@Cerebras + @googlegemma** (in the X post text, not burned into the video).
- [ ] Every on-screen number is real `time_info`; speed framed as ~1,284 tok/s measured / ~1,500 headline
      / about 15× GPU — no invented precision. Any other figure labeled illustrative.
- [ ] No secrets / tokens / phone numbers / notification banners visible in any frame or post.
- [ ] Submitted before Mon Jun 29, 10:00 PT.
