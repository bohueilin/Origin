# LoopForge — 60-Second Demo Recording Guide

**Record:** https://loopforge-ai.pages.dev/ (or `npm run dev` locally) · **Mode:** Recorded (default on load — deterministic, instant, no network risk).

Recorded mode replays real captured `gemma-4-31b` runs, so every number on screen (tok/s, image tokens, gate verdicts) is measured, not a prop. **Don't click the blue "Run live" during the take** (it fires a 5–15s real run). Stay in Recorded.

---

## The flow at a glance

1. **0:00–0:10 — Product intro:** the enterprise pain + how LoopForge helps (say it over the Command Center).
2. **0:10–0:18 — Speed:** Cerebras finishes the whole loop ~6× faster than a GPU.
3. **0:18–0:26 — Multimodal:** Gemma 4 vision reads the support screenshot → structured incident.
4. **0:26–0:35 — Root cause:** the agent escalated before the safety checks.
5. **0:35–0:40 — Patch + simulations:** rewrites the workflow, stress-tests it.
6. **0:40–0:50 — Repair loop (HERO):** first patch fails 5 gates → auto-repairs → red→green.
7. **0:50–0:56 — Evidence Pack:** approval-ready, blocked until all 10 gates pass.
8. **0:56–0:60 — Close:** customers resolved on first contact, in seconds.

---

## 1. Setup (2 min)
- Do Not Disturb on; close other tabs, hide bookmarks, clean desktop — no notifications/emails/keys on screen.
- Browser at **1440×900**, zoom **100%**.
- Open https://loopforge-ai.pages.dev/ — animations auto-play once on load.
- Rehearse the scroll once (silent) to learn the timing.

## 2. Record (macOS)
- **⌘ + Shift + 5** → **Record Selected Portion** → box the browser → mic **off** → **Record**. Stop with ⌘+Shift+5.
- **Easiest path:** record the screen **silently** (scroll to the beats), then add voiceover after in **iMovie/CapCut**.
- **Start a take:** press **⌘ + R** to replay the animations, then scroll top→bottom over ~60s.

## 3. The 10-second product intro (say this first, over the Command Center)

> **Enterprise AI support agents silently break in production — customers get bounced to a human instead of fixed. LoopForge repairs the agent itself in seconds, so the next customer is resolved on first contact.**

*(That's the pain — agents regress and customers get escalated, not resolved — and the fix — LoopForge repairs the agent's workflow fast.)*

## 4. The rest of the narration (continue over the scroll)

> And it's fast — one model, Gemma 4 on Cerebras: the whole repair loop runs in about one-and-a-half seconds, roughly six times faster than a GPU. It reads the failed support screenshot with Gemma 4 vision and pulls out the structured incident. It finds the root cause — the agent escalated before checking identity, charge status, and eligibility — and rewrites the workflow. A Guardian checks every fix: the first patch fails five safety gates, so LoopForge auto-repairs and re-verifies, flipping them red to green. Out comes an approval-ready Evidence Pack, blocked until all ten gates pass — so customers are resolved on first contact, in seconds, not escalations.

*(Intro + body ≈ 150 words ≈ 60s at a calm pace.)*

## 5. Timed shot-list (scroll + say)

| Time | Show | Saying |
|------|------|--------|
| **0:00–0:10** | **Command Center** (title + posture strip) — hold here for the intro | "Enterprise AI support agents silently break — customers get bounced instead of fixed. LoopForge repairs the agent itself in seconds, so the next customer is resolved on first contact." |
| **0:10–0:18** | **Speed Race** (big blue 6.5×, 1,299 vs 200 tok/s) | "And it's fast — Gemma 4 on Cerebras, the whole loop in ~1.5 seconds, ~6× faster than a GPU." |
| **0:18–0:26** | **Multimodal Ingest** (screenshot → fields, 270 image tokens) | "It reads the failed support screenshot with Gemma 4 vision and pulls out the structured incident." |
| **0:26–0:35** | **Failure Cluster → Root Cause** | "It finds the root cause — the agent escalated before checking identity, charge status, and eligibility." |
| **0:35–0:40** | **Workflow Diff → Simulations** | "…and rewrites the workflow, stress-testing it." |
| **0:40–0:50** | **Repair Loop (HERO)** — pause ~2s on RED→GREEN | "A Guardian checks every fix — the first patch fails five gates, so it auto-repairs and re-verifies, red to green." |
| **0:50–0:56** | **Validation Gates → Evidence Pack** | "Out comes an approval-ready Evidence Pack, blocked until all ten gates pass." |
| **0:56–0:60** | **Hold on Evidence Pack** | "So customers are resolved on first contact — in seconds, not escalations." |

**Pacing:** scroll slowly; **pause on the Repair Loop** so the red→green flip lands (it's the hero); end on the "Approval-ready rollout packet" header.

## 6. Export & post
- Trim to **≤60s**, export **1080p MP4**.
- **Discord** `#g4hackathon-enterprise-impact` + **X** (tag @Cerebras + @googlegemma) — paste from `docs/SUBMISSION.md`, attach video.

## Optional: "it's really live" B-roll (5–10s)
After the main take, click the blue **Run live (beta)** once and capture the few seconds where gates flip green on a *real* Cerebras run — splice it in as proof it isn't staged.
