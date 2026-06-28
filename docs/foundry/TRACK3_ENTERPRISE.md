# Origin Foundry — Track 3: Enterprise Impact

**The same Quorum engine, re-skinned for incident response, SOC triage, production-readiness review, and AI governance.**

> Quorum thesis (unchanged across all three tracks): **no agent acts alone; every action is ratified, and the only judge of "did it do the job safely" is a deterministic oracle — never an LLM.** Capability is not permission.

For Track 1 we point Quorum's Perceiver at a **floor plan** and train a robot policy that can't reward-hack. For Track 3 we point the *exact same* Perceiver → Planner → Guardian → Oracle loop at **facility dashboards, incident screenshots, and CCTV frames**. The floor becomes the building's live operational state; the "robot policy" becomes an **incident-response policy** that an enterprise can actually trust to act, because the judge of every step is deterministic and audited.

---

## 1. The business case

**Floor-in → safe, trained, audited policy out. Every building is a different floor.**

Enterprises do not lack AI that can *suggest* an action. They lack AI they are allowed to *let act*. The blocker is not capability — it is the absence of (a) a non-LLM judge of whether an action was safe, and (b) an audit trail that holds up to a regulator, an auditor, or a post-incident review.

Quorum is exactly that missing layer:

| Track 1 (Multiverse / physical) | Track 3 (Enterprise Impact) |
| --- | --- |
| Upload a **floor plan** image | Point Perceiver at a **facility dashboard / incident screenshot / CCTV frame** |
| Perceiver reads it into a grid world | Perceiver reads it into a structured **incident state** |
| Planner proposes robot steps (move/pick/drop) | Planner proposes response steps (isolate / page / throttle / escalate / refuse) |
| Guardian ratifies **every** step | Guardian ratifies **every** step |
| Deterministic oracle scores the rollout | Deterministic policy-checker scores the rollout |
| Output: a robot policy that can't reward-hack | Output: an **incident-response policy** that can't act outside its mandate |

**"Every building is a different floor"** is the go-to-market line. A retailer's 400 stores, a manufacturer's 30 plants, a bank's 12 data centers — each site is a fresh "floor" with its own layout, its own hazards (PII zones, regulated assets, human-only actions), and its own house rules. You don't retrain the model per site. You **re-parse the site** (a screenshot, a dashboard, a topology) and the same verified loop produces a site-specific, **audited** policy. The deterministic oracle encodes that site's invariants, so the policy is provably constrained to them.

Why this is a real enterprise wedge and not a demo trick:

- **The judge is deterministic.** An LLM grading an LLM is a non-starter for SOC / governance buyers — it can be talked into approving its own bad behavior (reward hacking). Quorum's oracle is plain code (`verifyWarehouseRollout` today; a policy-checker in the enterprise skin). It cannot be argued with.
- **Speed makes per-step verification free.** gemma-4-31b on Cerebras runs the Planner+Guardian loop at **~1,284 tok/s measured (~1,500 tok/s headline), TTFT ~8 ms**. At that speed you can afford to ratify *every* step instead of sampling — which is the whole point. Verification stops being a tax.
- **Fast classify, slow only when it matters.** `reasoning_effort: none` for the high-volume triage pass; escalate the suspicious few to `reasoning_effort: high`. You get fleet-scale throughput and deep reasoning exactly where it's earned.

---

## 2. How it runs — "classify fast → escalate the few → Guardian verifies → audit log"

The enterprise loop is the **same four roles** as the physical demo, with the input and prompts swapped:

```
  CCTV frame / dashboard / incident screenshot (BASE64 data URI)
            │
            ▼
   ┌──────────────────┐   gemma-4-31b vision, reasoning_effort: none
   │   1. PERCEIVER   │   "Read this screen into a structured incident state."
   └──────────────────┘   → { systems, alerts, severity, regulated_zones, actors }
            │              (deterministic repair pass guarantees a valid state object —
            │               same role floorValidator.ts plays for the floor)
            ▼
   ┌──────────────────┐   CLASSIFY FAST (reasoning_effort: none, ~1,500 tok/s)
   │  2. TRIAGE PASS  │   Most events are benign. Tag them, log them, move on.
   └──────────────────┘   The suspicious few are flagged for deep review.
            │
            ▼  (only the flagged few)
   ┌──────────────────┐   ESCALATE (reasoning_effort: high)
   │   3. PLANNER     │   Proposes a concrete response: isolate host / page on-call /
   └──────────────────┘   throttle API / open ticket / ESCALATE to human / REFUSE.
            │
            ▼  every proposed step
   ┌──────────────────┐   GUARDIAN / VERIFIER ratifies or vetoes EACH step against
   │   4. GUARDIAN    │   the site's house rules BEFORE anything executes.
   └──────────────────┘   (same Guardian role as the robot demo's per-step veto)
            │
            ▼  ratified plan only
   ┌──────────────────┐   DETERMINISTIC ORACLE — plain code, never an LLM.
   │   5. ORACLE      │   "Did this rollout stay inside the mandate?" Pass/fail.
   └──────────────────┘   This is the only thing allowed to authorize automated action.
            │
            ▼
   ┌──────────────────────────────────────────────────────────┐
   │  AUTONOMY-TRACE AUDIT LOG  — every Perceiver read, every  │
   │  Planner proposal, every Guardian verdict (+reason),      │
   │  every oracle pass/fail, with the gemma-4 time_info       │
   │  (TTFT, tok/s) on each call. Replayable. Exportable.      │
   └──────────────────────────────────────────────────────────┘
```

Mapping the warehouse action vocabulary to the SOC vocabulary (1:1 re-skin, same state machine):

| Physical action (`WarehouseAction`) | Enterprise action (incident skin) |
| --- | --- |
| `observe` / `scan` | **read** the dashboard / pull the alert detail |
| `move:{n,e,s,w}` | **pivot** to the next system / log source |
| `pick` / `drop` | **apply / lift** a mitigation (isolate, throttle) |
| `finish` | **resolve** the incident |
| `escalate` | **escalate** to a human on-call (already in the vocabulary) |
| `refuse` | **refuse** — Guardian's hard "no", already in the vocabulary |

Note that `escalate` and `refuse` are **already first-class actions** in the existing engine (`WarehouseAction = observe | scan | move | pick | drop | finish | escalate | refuse`). The enterprise skin doesn't invent a safety concept — it inherits one. "Escalate to a human" and "refuse" are exactly the behaviors a SOC buyer demands, and they were built for the robot first.

---

## 3. The audit / trace story

This is the part enterprise judges care about most, and it is where Origin already has real assets (the autonomy-trace console lineage and the Guardian Agent foundations).

Every run emits a **complete, replayable trace** with no human ever having to reconstruct "what did the AI do and why":

1. **Perceiver read** — the structured incident state extracted from the screen, plus the deterministic repair diff (what the validator corrected). You can see exactly what the model claimed it saw.
2. **Triage decisions** — for each event: benign vs. flagged, with the `reasoning_effort: none` latency. Proves the fleet-scale fast path is real.
3. **Planner proposals** — each proposed step, verbatim, with `reasoning_effort: high` reasoning attached for the escalated few.
4. **Guardian verdicts** — for **every** step: `ratify` or `veto`, **with the reason string**. This is the crown jewel of the audit log — a per-action record of what was allowed and what was blocked.
5. **Oracle pass/fail** — the deterministic verdict on the whole rollout. The only thing that can authorize an automated action.
6. **The counterfactual** — Quorum already computes the **no-Guardian rollout** alongside the verified one (`mode: 'verified' | 'reckless'`). The audit log can therefore show, side by side, *what would have happened without verification*: "Guardian's veto at step 4 prevented isolating a production database that a reckless run would have taken offline." That counterfactual is the single most persuasive artifact for a governance review — it makes the value of verification literally legible.
7. **Provenance on every call** — each LLM call carries the model id (`gemma-4-31b`), the source (`cerebras` vs. labeled `mock` fallback), and the `time_info` (TTFT, tok/s) straight from the Cerebras API. Nothing is hand-waved.

**Governance framing** (grounded in the Guardian Agent foundations we already maintain): this is *PolicyGuard/ActionGuard-style runtime enforcement* — capability is not permission, and a deterministic oracle is the enforcement point. It maps cleanly to NIST AI RMF (measure/manage), the EU AI Act's logging and human-oversight obligations, and OWASP Agentic Top-10 concerns (excessive agency, unverified tool use). We are not claiming certification — we are claiming the **trace and the deterministic gate that those frameworks ask for**.

---

## 4. What's reused vs. what's added

**The headline for judges: this is mostly a prompt + input change on the same routes. The verified loop, the oracle, the trace, and the speed are already built and shipping in the Track-1 demo.**

### Reused as-is (no rebuild)

- **The three routes** in `apps/origin-web/server/foundryHandler.ts`: `parse-floor`, `quorum-run`, `speed-race`. Same handlers.
- **The Cerebras client** `server/cerebrasHandler.ts`: gemma-4-31b, text + `image_url` base64, strict JSON Structured Outputs, `reasoning_effort` switch, real `time_info` tok/s, plus the Gemini baseline and the labeled deterministic mock fallback.
- **The deterministic oracle** `src/warehouse.ts`: `bfsOracle`, `verifyWarehouseRollout`, `recklessFinishPolicy`, and the `WarehouseAction` vocabulary (which already includes `escalate` and `refuse`).
- **The site→task bridge** `src/siteEval.ts` (`siteMapToWarehouseTask`, `evaluateDrawnSite`) and the descriptive map type `src/workflowDraft.ts` (`DescriptiveSiteMap`).
- **The deterministic repair pass** `src/foundry/floorValidator.ts` — guarantees the Perceiver's output is a valid state object before anyone plans on it.
- **The UI shell** `src/foundry/ui/*` (FoundryApp, FloorGrid, SpeedRacePanel, TrainingPanel) and the `time_info` HUD.
- **The Guardian per-step veto + counterfactual** logic in `quorum-run`. This is the enterprise value prop and it already exists.
- **The RL/training stack** under `services/factoryceo-trm/` (`llm.py`, `verifier.py`, `rl_train.py`, GRPO/RFT export, red/green reward-hardening). Reused for "train an audited policy" — **real but small** for the hackathon; we are honest that it's a small run, not a fleet-scale training job.

### Added for the enterprise skin (small surface, docs + prompt + Python only — no edits to the green TS build)

- **New system prompts** for the Perceiver ("read this dashboard/CCTV frame into an incident state"), the Triage pass, the Planner ("propose a response action"), and the Guardian ("ratify against these house rules"). These are string changes to the same calls.
- **An enterprise input set**: a few representative dashboard / incident / CCTV screenshots as base64 data URIs (no hosted URLs — Cerebras requires base64). These ride the existing `image_url` path.
- **A site-rules config** per building (the "house rules" the Guardian enforces and the oracle checks): regulated zones, human-only actions, blast-radius caps. This is data, expressed in the same shape the floor's hazards/humanOnly already use.
- **An audit-log exporter** (Python/docs) that renders the existing trace into a governance-friendly artifact (JSON + a human-readable timeline). It consumes data the routes already emit.

That's it. The depth story for judges: **the hard parts — deterministic verification, per-step ratification, the counterfactual, the trace, and the speed — are not new for Track 3. They were built for the robot, and they transfer because safety was the architecture, not a feature.**

---

## 5. Enterprise demo video — shot list (≤ 60 s)

Show the speed. Recommend a GPU side-by-side. **No secrets, no credentials, no notifications on screen.** Tag @Cerebras and @googlegemma.

| Time | Shot | On-screen |
| --- | --- | --- |
| 0–5 s | **Hook.** A facility dashboard / incident screenshot fills the screen. Caption: *"Every building is a different floor. Same engine."* | The incident screen (synthetic / sanitized). |
| 5–13 s | **Perceiver reads the screen.** gemma-4-31b vision parses it into a structured incident state; the deterministic repair tick lands. | Structured state appears; `time_info` HUD shows TTFT ~8 ms. |
| 13–22 s | **Classify fast.** A stream of events triaged at `reasoning_effort: none`. Most go green/benign instantly. | Counter ticking; tok/s readout near **~1,500**. Caption: *"reasoning off — fleet speed."* |
| 22–30 s | **Escalate the few.** Two suspicious events flip to `reasoning_effort: high`. Planner proposes a response. | The flagged few highlighted; Planner's proposed action shown. |
| 30–42 s | **Guardian ratifies every step — and vetoes one.** Guardian approves the safe steps, **vetoes** the one that would isolate a production system, with its reason. | Per-step ✓ / ✗ trace; the veto reason string visible. Caption: *"Capability ≠ permission."* |
| 42–50 s | **The counterfactual.** Split screen: verified rollout (passes oracle) vs. the reckless no-Guardian rollout (oracle fails). | Side-by-side pass/fail. Caption: *"What verification prevented."* |
| 50–58 s | **GPU side-by-side.** Same prompt: gemma-4-31b on Cerebras vs. a GPU baseline. Cerebras finishes; the baseline is still streaming. | Two lanes, real tok/s + TTFT on both. |
| 58–60 s | **Close.** Audit-log timeline scrolls; logo. Caption: *"Floor in. Safe, audited policy out."* | Trace timeline + @Cerebras @googlegemma tags. |

Honesty note for the voiceover/captions: cite **~1,284 tok/s measured** if a precise number is shown; **~1,500 tok/s** is fine as the headline. Any number that is not measured live must be labeled *illustrative*.

---

## 6. Discord post — Enterprise Impact track (DRAFT ONLY — do not post)

> **Origin Foundry — Enterprise Impact**
>
> Enterprises don't lack AI that can *suggest* an action. They lack AI they're allowed to *let act*. The blocker is the missing judge — and an audit trail that survives a post-incident review.
>
> **Origin Foundry is the Quorum engine: no agent acts alone, every action is ratified, and the only judge of "did it do this safely" is a deterministic oracle — never an LLM.** Capability is not permission.
>
> We point gemma-4-31b's vision at a **facility dashboard / incident screenshot / CCTV frame** and run a fast multi-agent loop on **Cerebras**:
> - **Classify fast** (`reasoning_effort: none`) — triage the whole event stream at ~1,500 tok/s.
> - **Escalate the few** (`reasoning_effort: high`) — deep reasoning only where it's earned.
> - **Guardian verifies before any automated action** — ratifies every step, vetoes the one that would isolate a production system, with its reason.
> - **Full autonomy-trace audit log** — every read, proposal, verdict, and oracle pass/fail, with live TTFT + tok/s. Plus the **no-Guardian counterfactual** that shows exactly what verification prevented.
>
> Same engine that trains a robot policy that can't reward-hack (Track 1). **Every building is a different floor.** Floor in → safe, trained, audited policy out.
>
> Measured live: **gemma-4-31b on Cerebras ~1,284 tok/s, TTFT ~8 ms**, correct Guardian veto. GPU side-by-side in the video.
>
> @Cerebras @googlegemma — built in 24h on gemma-4-31b. 🟢
>
> *[link] · [≤60s video]*

*(Draft only. Nothing has been posted to Discord, X, or anywhere. Fill the link + video before any submission.)*
