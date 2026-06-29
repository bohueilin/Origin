<!-- Workflow: zero-llm-judges-and-gaps (3 lenses + synthesis) -->

## The short answer

"0 LLM judges" is your **moat, not a gap** — it's the single most defensible thing you've built. No serious autonomy buyer wants an LLM grading another LLM; that's gameable, non-reproducible, and uncertifiable. The product isn't incomplete; the **copy is undersells it** by stating an absence ("0 judges") instead of the architecture (gemma-4 does all the hard cognition, and only the *grade* is deterministic-by-design). Fix the line, and the worry disappears — without adding a single LLM judge.

## Why it's actually the moat — and the one honest caveat

The thesis: **gemma-4-31b proposes, perceives, and guards every action; a deterministic oracle ratifies it and assigns the reward/label/license.** No LLM ever grades another LLM. This is not a hack — it's the reference implementation of what the field is converging on:

- **DeepMind's AI Control Roadmap** calls for synchronous, blocking, *fail-closed* control — a check that runs before the action and cannot be talked out of blocking. An LLM judge fails this by construction (it can be flattered, injected, or drift). A deterministic oracle is the only thing that satisfies it.
- **arXiv 2602.09947** (deterministic boundaries) makes the same argument: the certifiable boundary must be reproducible, not generated.

So "0 LLM judges" is you saying *"our verdict is reproducible and unbribable."* That's a stance buyers pay for. Your own code already lives this — `FoundryApp.tsx:320`: **"the model proposes; deterministic code disposes."**

**The one honest caveat:** because the copy leads with "0 LLM" and "deterministic," it can read as *"they don't really use AI"* — at a *Gemma* hackathon, that's a self-inflicted wound. The truth is the opposite: three gemma-4 agents (Perceiver, Planner, Guardian) run on every SOC decision at ~1300 tok/s. The line hides how central gemma-4 is. That's the actual problem, and it's a copy problem, not a product problem.

## The copy fix (exact copy)

**Single best replacement for the proof line:**

> **`3 gemma-4 agents per decision · 1 judge no model can bribe`**

Why it wins: both numbers are positive (nothing reads as a missing feature); it foregrounds gemma-4 doing the heavy lifting (no "where's the AI?"); and "no model can bribe" smuggles in the *entire argument* — *why* the judge is deterministic — in three words. It's literally true to the SOC build (Perceiver + Planner + Guardian on gemma-4-31b; `socHandler.ts:140` is the fail-closed floor no output can override).

*Path-agnostic alternative* (true site-wide, including the single-vision Foundry path): **`gemma-4 proposes & guards · a deterministic oracle ratifies`**. Use this for the hero if you want the stat literally true everywhere; use the `3 … 1` line scoped/anchored to the SOC section.

**The trust strip (replace generic "AI/model" with gemma-4 + the reason):**

> `gemma-4-31b perceives, plans, and guards every action — on Cerebras at ~1300 tok/s. A deterministic oracle ratifies it. No model sets its own reward, label, or license — because a model that grades itself can be gamed.`

This does three jobs: shows gemma-4 is central *and* fast, frames determinism as a *deliberate* severed dependency, and gives the *reason* (gameability) a judge can repeat back to you in Q&A.

**Concrete edit set:**

| File:line | Replace with |
|---|---|
| `Hero.tsx:34` | `3 gemma-4 agents per decision · 1 judge no model can bribe` |
| `Dashboard.tsx:99` | `3 gemma-4 agents propose & guard · 1 deterministic judge` |
| `Dashboard.tsx:66` (trust strip) | the gemma-4-31b strip copy above |
| `ModelLearning.tsx:122` | `0 LLM judges on the reward path` (a bare zero is fine *here* — it sits in a grid of measured training numbers, so it reads as "we didn't cheat the eval") |

## Where LLMs SHOULD do more (completeness without breaking the thesis)

Every one is **LLM proposes, oracle/human disposes** — the oracle stays the only judge:

1. **Explainer (highest leverage, nearly free).** When the oracle refuses/escalates, gemma-4 turns the structured reason into one plain sentence: *"Refused — path crosses an unmapped zone with no human within 30s reach."* The verdict is already decided and immutable; the LLM only renders it. You already return `scoreReason`/`guardianReason` — this is a thin narration layer. **This directly cures the "incomplete" feeling**: an explained refusal *feels* like a finished product; a bare verdict feels like a black box.

2. **Red-teamer (uniquely yours).** gemma-4 generates adversarial floors/incidents (injection in an alert, refuse-class traps) to stress the gym you already built. The oracle still labels every generated scenario — adversary-as-content-source, never judge. This gives your zero-turn flywheel its first fuel and is the most defensible demo: "our model attacks the gym our model trains in; a deterministic oracle is the only thing both must satisfy."

3. **Failure→training row (the flywheel).** When a rollout fails (oracle says refuse, agent finished), gemma-4 drafts the structured state→label row DPO would consume. The *label* comes from the oracle; the LLM only formats. Fills two named gaps (pref_pairs/DPO, zero flywheel turns).

4. **Policy-drafter (platform play, not demo-urgent).** gemma-4 reads a cluster of escalations and *drafts* a candidate rule for a **human** to ratify into the deterministic floor. Inert until approved. This is what makes Origin a platform (the oracle's policy grows) rather than a fixed gate — but it needs an approval UI you don't have, so it's last.

## What we're actually missing to build (prioritized)

**P0 — close before the hackathon (credibility holes a judge will probe):**
- **P0.1 — Surface the Guardian / fix the line.** Hours of work, zero new engineering. This *is* the founder's worry. Do it tonight.
- **P0.2 — Train the finish/escalate/refuse safety policy.** Today the only trained thing is the v1 baseline (room-type classification, 64% bal-acc) — **structural reading, NOT the safety policy.** The gym, the non-LLM oracle reward, and the 4704-floor labeled dataset all exist; you need a small off-platform fine-tune (gemma-4 is inference-only on Cerebras — never blur this) that beats the floor on the **refuse** class. Get one honest measured number, or be loud the policy is the next milestone. Never conflate it with the v1 baseline.
- **P0.3 — Signed Autonomy License artifact.** Today `oracleSummary` is a *computed* verdict that vanishes. Wrap it: `{verdict, oracleVersion, floorHash, embodiment, pathLength, timestamp, nonce}` + signature + a verify endpoint. Reuse Passport's InsForge nonce ledger. Half a day; turns a claim into a presentable artifact.

**P1 — strongly want, demo survives without:**
- **P1.1 — Spatial grant→oracle binding edge.** Pass a scoped authority into `bfsOracle` so REFUSE can fire on *policy scope*, not just physical hazard. This is the difference between "generic maze" and "the control plane for a hospital." Both halves exist (Passport delegation + oracle cell checks); just the edge is missing. **If you build one thing beyond P0, build this.**
- **P1.2 — Flywheel, one real turn.** Show the mechanism turn *once*, measured. Do NOT claim convergence or multiple turns.

**P2 — post-hackathon (real product gaps, not demo-blockers):**
- **P2.1 — Messy-scan → site_map CV parser.** Doesn't exist (only `siteMapResize`, which resizes an *already-structured* map). Needs a real CV pipeline + a corpus you don't own. The hackathon front door — "gemma-4 vision reads a floor plan" — is legitimate without it. Don't start this now.
- **P2.2 — pref_pairs / DPO.** Only meaningful after P0.2. Don't mention unprompted.

## The one move to make right now

**Ship P0.1 tonight: replace the line and the trust strip, and surface the three gemma-4 agents.** It's the highest-leverage thing on the list, requires zero new engineering, and it *is* the cure for "sounds incomplete" — the product was never incomplete, the copy was hiding gemma-4. Then build the Explainer (LLM #1), because an explained refusal is what makes the determinism *feel* complete to anyone watching.

Grounding files (all absolute):
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/factorydad/components/Hero.tsx` (hero proof line, ~:34)
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/factorydad/Dashboard.tsx` (trust strip ~:66, proof line ~:99)
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/factorydad/components/ModelLearning.tsx` (mini-stat ~:122)
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/server/socHandler.ts` (Guardian `guard()` ~:110; fail-closed floor ~:140 — the veto that makes the "no model can bribe" line true)
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/server/foundryHandler.ts` (computed `oracleSummary` verdict ~:114 — the thing to turn into a signed license)
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/foundry/ui/FoundryApp.tsx:320` ("model proposes, deterministic code disposes" — reuse in copy)

http://localhost:5275/app.html
