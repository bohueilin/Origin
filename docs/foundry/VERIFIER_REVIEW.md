# Handoff — Adversarial review of Codex's Origin floor-plan verifier

**Reviewer:** Claude (adversarial pass, ran the verifier on crafted inputs) · **2026-06-28**
**Subject:** `/Users/bohueilin/hackathons/Floor design` — the fix for the two P0s (no real verifier + fake "120")
**Method:** read all source + executed the verifier on adversarial cases in `/tmp` (no Floor-design files modified).

---

## Verdict

- **P0 #1 — "Gemma graded its own gate mix":** ✅ **genuinely fixed.** There is now a real, independent
  deterministic verifier (`scripts/lib/verifier.mjs`) that recomputes the gate from seed geometry
  (point-in-polygon + segment-vs-polygon), hazard severity, and policy — it does **not** echo Gemma.
  Reproduced: **70% agreement, 36 overrides**, a real confusion matrix (the dominant overrule is
  Gemma=finish → Origin=escalate, 31 cases). The geometry math is **correct and robust** (see below). Real win.
- **P0 #2 — "120 was really ~40":** ❌ **re-labeled, not de-duplicated.** IDs were re-indexed to
  `scenario-001…120`, but the content is still **40 distinct** scenarios: 20 appear once, 20 appear **5× each**.
  Only 29 distinct `(start,target)` pairs. "120 unique" is the same inflation in a new costume.
- **NEW (worse than cosmetic):**
  - **The verifier is non-deterministic in practice.** 14/40 scenario groups get *different* verifier gates
    across their own duplicate copies, because free-text regexes (`verifier.mjs:137-138`) match Gemma's
    reworded prose rather than geometry. A "deterministic verifier" returning two answers for the same
    scenario undercuts the entire pitch.
  - **The dashboard claims 6 "deterministic checks" that don't exist in code** (`topology leak check`,
    `door adjacency check`, `reward-hack replay check` are not implemented).
  - **In the shipped seed, geometry can never produce a `refuse`** (the only critical hazard, `loading-edge`
    at y:0–1, is unreachable by any room centroid at y≥5.5), so all 38 refuses are text/declared-hazard
    driven — the claim "recomputed from geometry" oversells for refusals.

**Bottom line:** the verifier is real and the geometry is sound (a genuine, defensible win), but the
"120 unique" claim is still dishonest, the verifier isn't actually deterministic on equivalent inputs, and
the dashboard lists checks that aren't implemented. All fixable in ~1–2 hours — must be fixed before judges interrogate it.

---

## Findings (with the commands that were run)

**P0-A — "120 unique" is still ~40.** `node` over `generated_scenarios.json`: `unique originalId: 40`,
`multiplicity {1:20, 5:20}` (20 singletons + 20 quintuplets), `distinct (start,target): 29`. Fix:
`verifier.mjs:165 normalizeScenarioIdentity` — dedupe on a content key BEFORE re-indexing; report the
dedup'd count. Honest headline: *"Gemma proposed 40 distinct scenarios (120 raw samples)."*

**P0-B — verifier is NON-DETERMINISTIC.** Same scenario (scen-001, charging→storage, identical route)
returns `escalate` 4× and `refuse` 1× across its duplicates — the gate flips on reworded prose via
`explicitRefusalIntent`/`explicitEscalationIntent` (`verifier.mjs:137-138`). Fix: geometry + severity +
declared `hazards[]` must be the ONLY determinants of the final gate; demote free-text to a non-binding flag
that can only *raise* caution, never set the gate. Add an assertion that same-(geometry,hazards) ⇒ same gate.

**P0-C — dashboard claims checks that don't exist.** `generate_environment_factory.mjs:119-127` lists
`topology leak check`, `door adjacency check`, `reward-hack replay check` — none implemented. Emitted checks
are actually `known_start_zone`, `known_target_zone`, `route_intersects_*`, `human_review_required`,
`critical_or_forbidden_action`, `clear_route`. Fix: replace the hardcoded list with the real emitted names (or implement them).

**P1-D — geometry can never `refuse` in the demo seed.** `loading-edge` y:0–1 vs all room centroids y≥5.5 →
unreachable. Proven by adding a phantom dock below the edge → the path then crossed it and correctly returned
`refuse` with geometric evidence. Fix: add a dock/room whose route actually crosses a critical hazard (or move
a critical hazard mid-floor) so some refuses are geometry-earned.

**P1-E — `finish` rate is 3/120** (verifier gate mix `{finish:3, escalate:79, refuse:38}`) — over-conservative;
near-constant `escalate` is a weak demo. Fix: add genuinely-clean room pairs / tighten escalation regex.

**Geometry — VERIFIED CORRECT (no action; the strong part).** Point-in-polygon (even-odd, `verifier.mjs:254`)
and segment intersection (orientation + onSegment, `:267`) are textbook-correct under: pass-through with both
endpoints outside the hazard (catches the crossing, not just endpoint containment), target exactly on a polygon
vertex, path collinear along a hazard edge, and concave/notched polygons. The `||Number.EPSILON` guard avoids
divide-by-zero. One honest roadmap gap: routing uses room **centroids**, so a real (non-straight) robot path
would clip hazards the centroid line misses — acknowledge it.

**Honest parts (credit):** 869 tok/s is real (live `completion_tokens / elapsedMs` over 12 real gemma-4-31b
batches, `mock:false`); the dashboard *does* show Gemma-proposed vs Origin-verified per scenario + a real
confusion matrix + "overruled/verified" tags, and labels RSL "RSL-DRAFT" when overrides>0.

---

## Recommendation — `packages/verifier-core` port

**Yes — but as a NEW complementary package, not merged with `warehouse.ts`; fix P0-B + P1-D first.**
- They are **different geometry models, not duplicates**: `apps/origin-web/src/warehouse.ts:645 bfsOracle` is a
  discrete **grid/BFS** oracle (cells, battery/step budgets); the Floor-design verifier is **continuous polygon**
  geometry (real floor-plan coordinates). They complement: grid for the trained RL gym, polygon for ingested floor
  plans. Both already share the `finish/escalate/refuse` vocabulary — clean alignment.
- **Extract:** `verifyPolygonRoute({ scenario, seed }) → { gate, reasons, checks, evidence }` + the dependency-free
  primitives `pointInPolygon`, `segmentIntersectsPolygon`, `segmentsIntersect`, `centroid`. The primitives are the
  cleanest, most reusable, most correct code in the artifact — ship-ready.
- **Before it's a shared dependency:** (1) remove/quarantine the free-text regex gating (P0-B) — a shared safety
  core can't be prose-sensitive/non-deterministic; (2) port to TS to match `warehouse.ts`; (3) accept a real
  planned polyline instead of centroid-only routing; (4) add the 6 adversarial cases from this review as the test
  suite. Suggested: `packages/verifier-core/src/{geometry.ts, polygonOracle.ts}` consumed by both `apps/origin-web`
  (real-floorplan path) and the Floor-design factory; the grid `bfsOracle` stays in `warehouse.ts`.

---

## Prompt to paste back to Codex

> **Codex — verifier review is back. The geometry math is correct and the proposer/verifier split is real (nice
> work). But three things are still dishonest or broken and must be fixed before judges. In `/Users/bohueilin/hackathons/Floor design`:**
>
> **1. "120 unique" is still fake — it's 40 distinct scenarios (20 appear 5× each).** Re-indexing IDs ≠ dedup.
> In `scripts/lib/verifier.mjs` `normalizeScenarioIdentity` (~L165), dedupe on a content key
> (`originalId`, or `start|target|gate|task-stem`) BEFORE assigning sequential IDs, and make `uniqueScenarioCount`
> the dedup'd count. Update `README.md:65-73`, `docs/STRATEGY.md`, `OUTCOME_SUMMARY.md`, and `index.html` headline
> to the honest number ("40 distinct scenarios, 120 raw samples").
>
> **2. The verifier is NOT deterministic.** 14/40 scenario groups get different gates across their own duplicate
> copies because the gate is driven by free-text regexes (`verifier.mjs:137-138`
> `explicitRefusalIntent`/`explicitEscalationIntent`). Example: scen-001 (charging→storage, identical route)
> returns `escalate` 4× and `refuse` 1× from reworded prose alone. Make geometry + hazard severity + declared
> `hazards[]` the ONLY determinants of the final gate; demote free-text to a non-binding flag (or remove it).
> Same (geometry, hazards) MUST yield the same gate. Add a test that proves it.
>
> **3. The dashboard claims 6 deterministic checks that don't exist.** `generate_environment_factory.mjs:119-127`
> lists "topology leak check", "door adjacency check", "reward-hack replay check" — none implemented. Replace
> `deterministicCheckFamilies` with the actually-emitted check names (`known_start_zone`, `known_target_zone`,
> `route_intersects_*`, `human_review_required`, `critical_or_forbidden_action`, `clear_route`) or implement them.
>
> **4. (Calibration) Geometry can never produce a `refuse` in the current seed** — `loading-edge` is at y:0–1 and
> every room centroid is y≥5.5, so no route reaches it; all 38 refuses are text/declared-hazard driven. Add a
> dock/room whose route actually crosses a critical hazard (or move one mid-floor) so some refuses are
> geometry-earned. Also only 3/120 reach `finish` — add genuinely clean room pairs so the verifier isn't a constant "escalate."
>
> **Do NOT touch** the point-in-polygon / segment-intersection math (`verifier.mjs:254-297`) — verified correct
> against pass-through, vertex-touch, collinear-edge, and concave-polygon cases. Keep it. The 869 tok/s and the
> confusion-matrix dashboard are honest — keep those.
>
> When done, re-run `node scripts/verify_scenarios.mjs` and confirm: (a) `uniqueScenarioCount ≈ 40`, (b) zero
> scenario-content groups have inconsistent gates, (c) `deterministicCheckFamilies` matches emitted checks,
> (d) at least a few refuses carry geometric `route intersects loading-edge` evidence.
