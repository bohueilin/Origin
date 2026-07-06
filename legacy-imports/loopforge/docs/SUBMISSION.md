# LoopForge — Submission Package

Track 3 · Enterprise Impact · Cerebras × Google DeepMind Gemma 4 Hackathon
Demo surface: https://loopforge-ai.pages.dev/ (Recorded mode is the demo path)

---

## 📤 Discord post — `#g4hackathon-enterprise-impact`

**Project Name:** LoopForge — Enterprise Agent Repair OS

**Team Members:** Bo-Huei Lin (@your-handle)

**Project Description:**
Production AI agents silently regress — the workflow around the model goes stale and they start over-escalating and skipping checks at scale, and today nobody can diagnose, patch, validate, and ship a fix with an audit trail while the incident is still hot. LoopForge closes that loop entirely on `gemma-4-31b`/Cerebras: Gemma 4 vision reads a support-console screenshot into structured incident JSON, clusters the failures, diagnoses the root-cause AOP logic gap, proposes a semantic workflow patch, then runs a deterministic 10-gate Guardian harness that asserts on the real tool action — not the model's self-label. When the first patch fails 5 safety gates, LoopForge auto-repairs on Cerebras and re-verifies, flipping gates RED → GREEN in ~1.9s, and emits an approval-ready Evidence Pack that stays BLOCKED until every gate passes. At ~1,299 tok/s the full diagnose→patch→simulate→verify→repair loop runs in 1.38s — versus ~9s on OpenAI's gpt-oss-120b, a 120B GPU model (6.5×), and ~65× faster than DeepSeek-V4 — making verification effectively free, so the Guardian can run on every cycle and self-repair becomes practical at a latency no GPU can touch. (gemma-4-31b is Cerebras-only, so we benchmark the GPU open-model field; speed is a property of the silicon, not the model.)

**GitHub Repository:** https://github.com/bohueilin/loopforge

**Live Demo:** https://loopforge-ai.pages.dev/ (recorded mode — the deterministic demo path; runs entirely in the browser)

**Demo Video:** (Attached)

### Why this wins Enterprise Impact
- **Business Impact:** Compresses diagnose → patch → validate → ship for a regressed production agent from a multi-hour war-room into 1.38s with a signed Evidence Pack — the repair loop took 5 unsafe behaviors to 0 before anything reached production.
- **Production Readiness:** Fail-closed by design — secrets are server-side and allowlisted (never sent to the browser), deterministic gates run as a separate trust boundary from the model, synthetic data only, and the Evidence Pack is BLOCKED unless all 10/10 gates pass; build is green on `tsc` + `vite build`.
- **Technical Excellence:** A deterministic TypeScript Guardian harness over Zod-validated strict-JSON structured outputs, asserting on the actual tool action derived from input facts — "the model proposes; deterministic gates dispose" — not on the model's self-reported answer.
- **AI Differentiation:** One model — `gemma-4-31b` on Cerebras — runs the whole multimodal loop from vision ingest (270 image tokens / 195ms) through self-repair at 1,299 tok/s, so the entire verify-and-repair loop finishes (1.38s) in less time than OpenAI's 120B gpt-oss takes to answer once on a GPU (~9s) — 6.5×, and ~65× vs DeepSeek-V4. Fast inference is what makes multi-step verification and self-repair free.

---

## 🐦 X / Twitter post (tag @Cerebras + @googlegemma)

**Tweet 1 (lead, ~250 chars):**
Production AI agents silently regress. LoopForge diagnoses the bug, patches the workflow, runs 10 safety gates & self-repairs — the whole loop finishes before a GPU answers once.

gemma-4-31b on @Cerebras is 6.5× faster than OpenAI's gpt-oss-120b on GPU.

#Gemma4 #Cerebras

**Tweet 2 (reply):**
Depth: Gemma 4 VISION reads a support-console screenshot → structured incident JSON (270 image tokens, 195ms).

Then a deterministic Guardian harness runs 10 FACT-BASED gates on the real tool action — not the model's self-label.

First patch fails 5 gates. Auto-repair flips RED→GREEN.

**Tweet 3 (reply):**
Why it works: at ~1,299 tok/s the full loop runs in 1.38s vs ~9s for OpenAI's 120B gpt-oss on a GPU (65× vs DeepSeek-V4). Verification becomes FREE — so the Guardian runs every cycle and self-repair is actually practical.

It's a hardware win: speed is silicon, not model.

Built on @googlegemma + @Cerebras. Repo: github.com/bohueilin/loopforge

> Attach the 60s video to Tweet 1. Reply with 2 and 3 within the first minute (reply velocity drives reach). Post in a US-morning window.

---

## Pre-submit checklist
- [ ] Replace `@your-handle` with the final team/social handle, or remove it.
- [ ] Push the repo public (or keep private and omit the link).
- [ ] Record the 60s video per `docs/DEMO_SCRIPT.md`, in Recorded mode, 1440×900, no secrets on screen.
- [ ] Post the Discord note + attach the video in `#g4hackathon-enterprise-impact`.
- [ ] Post the X thread, tag @Cerebras + @googlegemma, attach the video.
