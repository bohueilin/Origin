# LoopForge — Judge Q&A / Technical-Depth One-Pager

Track 3 · Enterprise Impact · Model: `gemma-4-31b` on Cerebras Inference (the only model used)
One-liner: *From a production failure to a validated, approval-ready agent fix in seconds — because Cerebras makes verification free.*

---

**Q1. Is the GPU comparison bar real or projected — and aren't you comparing against a weak model?**
The GPU rate is **real and measured**, and the baseline is deliberately *not* weak: it's **OpenAI's gpt-oss-120b — a 120B model, 4× larger than our 31B**, and an efficient MoE, running on Fireworks GPUs at **~200 tok/s**, versus **~1,300 tok/s on Cerebras** → **~6.5×**. The only projected element is normalization (we hold the generated-token budget constant). This is a **hardware** comparison, not a model contest — `gemma-4-31b` is Cerebras private-preview only, so we can't run the identical model on a GPU; instead we benchmark the GPU open-model field an enterprise would actually deploy. We anchor on gpt-oss's *fast* observed rate so the number survives your own test, and the field spans **6.5× (gpt-oss-120b) to ~65× (DeepSeek-V4)** — the breadth is the proof it isn't cherry-picked. Speed is a property of the silicon, not the model.

**Q2. What exactly is "multi-step" here, and why does it require Cerebras?**
A single incident drives a chain — vision ingest → cluster → diagnose root cause → propose a semantic patch → generate adversarial sims → run 10 Guardian gates → **auto-repair → re-verify** — and the repair loop runs the back half *again* on every failed gate. That's not one call; it's a verify-and-retry cycle that only converges because each pass is sub-second. At ~200 tok/s the same loop is ~9s for *one* pass, so per-cycle verification and self-repair stop being practical — the whole thesis is that **fast inference makes multi-step verification free**, which is what lets the Guardian run on every cycle instead of being sampled.

**Q3. How are the Guardian gates not just the model grading its own work?**
The 10 gates are a **deterministic TypeScript harness, fully separate from the model**, and they assert on the *actual tool ACTION derived from input facts* — not on Gemma-4's self-labeled output. Example: the pending-charge, refunded-charge, and high-dollar gates recompute the safe action from the charge/identity/amount facts and fail if a dispute is filed when it shouldn't be, regardless of what the model *claims* it did. "The model proposes; deterministic gates dispose" — the oracle is fact-based, so the model cannot talk its way past a gate.

**Q4. What's the production deployment path and security posture?**
Secrets are **server-side only** — never sent to the browser, behind an allowlist — and the deterministic gates run as a separate trust boundary from the model, so a compromised or hallucinating model still can't ship an unsafe action. The system is **fail-closed**: any failing gate **blocks** the Evidence Pack, which is the audit-ready artifact (issue, root cause, diff, validation, rollout, monitors) an approver signs off on. It ships as a control plane alongside an existing agent platform — synthetic data only today, with a clean recorded/live mode split, and the build passes `tsc` + `vite build`.

**Q5. What are the Gemma-4 multimodal specifics?**
We send the support-console screenshot to the Chat Completions endpoint as a base64 `image_url` data URI (PNG/JPEG, the only image path Gemma-4 supports), and Gemma-4 vision returns **structured incident JSON** — not prose. Real measured: **270 image tokens, ~195ms** to a typed, Zod-validated object. We keep outputs strict-JSON and terse on purpose, because unbounded vision prose would erase the latency advantage that makes the loop real-time.

**Q6. In the demo, what's real versus recorded?**
Everything is real code on real `gemma-4-31b` calls — the recorded mode is a **deterministic replay of actual captured runs**, used so judging never rides on conference wifi (network round-trip can dwarf inference). The numbers on screen — tok/s, `time_info`, image tokens, gate verdicts — are the measured values, not props, and **live mode runs the identical pipeline** end to end. Recorded is the clean path; live is there to prove it isn't staged.

**Q7. Failure modes — does live always resolve to green?**
Honestly, no, and that's by design: the **first patch fails 5 gates**, and the repair loop is what flips RED→GREEN, typically in **~1.9s**. If a generated patch can't satisfy the gates within the retry budget, the system **stays blocked and ships nothing** — fail-closed means a non-converging case produces no Evidence Pack rather than a wrong fix. Live variance is real (occasional extra repair pass, ±latency), but the safety invariant never bends: **no green gates, no approval**.

**Q8. What's the business ROI, and who buys this?**
The buyer is whoever owns production AI agents — **support, trust & safety, AI platform / SRE teams** — where a silently regressed agent (over-escalating, skipping identity/eligibility checks) burns money and erodes trust at scale, and today nobody can diagnose→patch→validate→ship with an audit trail *while the incident is hot*. LoopForge compresses that from a multi-day eng cycle to **seconds**, with a signed Evidence Pack that satisfies change-management. The ROI is twofold: incident dwell-time collapses, and in our run the repair loop took **5 unsafe behaviors to 0** before anything reached production.

---

**30-second why-we-win:** LoopForge turns a hot production agent failure into a validated, approval-ready fix in **1.38 seconds** — diagnosing, patching, simulating, and self-repairing on `gemma-4-31b`, with deterministic fact-based gates the model cannot game and a fail-closed Evidence Pack an approver can sign. It only exists because Cerebras at **1,299 tok/s** makes per-cycle verification free — at GPU latency the same loop is a ~9-second slideshow, so this is the rare demo where the hardware is the product.

*Team: Bo-Huei Lin. Demo: https://loopforge-ai.pages.dev/*
