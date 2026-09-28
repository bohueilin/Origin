# Site evaluation — 26 September 2026

**Baseline report, corrected 27 September 2026.** Implementation is approved, including H01 and H09 and removal of the unsupported H10 claims. H11 remains a placeholder by owner decision. The findings below describe the evaluated baseline; subsequent fixes are tracked in their implementation PRs.

## Evaluated surface and method

This evaluates a **local combined candidate**: `da6c281` (T1, T4, T5, T6), plus the separate T3 patch `da784dd`, over `118f9b7`. This is not a claim about the deployed site. Source line references use `da6c281`; T3 adds only the separately reviewed save guard and associated UI. The candidate includes the final reviewed playback-plan correction. All browser contexts were anonymous and external requests were blocked. Provider calls, accounts, uploads, payments, production edge behavior and authenticated screens were not exercised.

The retained [collector](../../apps/origin-web/scripts/site-eval.mjs) inspected all **25 routes** at **1440×900, 375×812, and 320×640**, without `isMobile`. It saved 75 full-page screenshots and 25 JavaScript-off screenshots, plus two focused skip-link screenshots. Full-page contact sheets and enlarged mobile crops were visually reviewed; DOM text and component source supplied the reading-level detail on long pages. [Evidence index](evidence/2026-09-26/README.md) retains the compact baseline measurements. Screenshots and expanded diagnostics are generated per commit as CI artifacts, outside Git history.

Measurements cover solid-background contrast, axe checks (including unresolved cases), computed type and line measure, target rectangles, the first eight keyboard focus stops, headings, landmarks, overflow, CSS motion definitions and computed reduced-motion styles. CLS is the largest session window observed through four seconds after load. LCP and first-load transfer bytes are frozen before scrolling or interaction. Separate repeated runs confirmed legacy layout shifts. Existing and new browser tests cover the interactive verifier, failure, consent, navigation and motion states; this is not a complete assistive-technology or WCAG certification.

**Performance limits:** byte counts below are cold-browser **development-server diagnostics**, including Vite, React development modules and source maps. They are not compressed production bundle sizes. Timings are unthrottled local measurements, not a field percentile. Persistent asset weight and duplicate requests are reported separately. Images/gradients, SVG glyphs and group-opacity contrast require manual interpretation; the solid-color checker explicitly leaves complex backgrounds unresolved. Redundant glyphs are not classified as failed meaningful text.

Reproduce from `apps/origin-web` with the evaluated candidate served locally:

```sh
BASE_URL=http://localhost:5290 OUT_DIR=/tmp/origin-site-evaluation \
  SOURCE_LABEL="describe the exact candidate" node scripts/site-eval.mjs
```

The collector is read-only apart from writing its output folder; it submits no forms. Local filesystem prefixes in Vite resource URLs are redacted from saved JSON. Every generated route `.json` carries the route, dimensions, selectors, values, text, and audit details. One supplemental no-JS screenshot attempt failed under concurrent browser load; the complete successful matrix supplies that unchanged fallback, and the three corrected sRGB contrast captures were retained.

## Route inventory

All 25 local URLs returned HTTP 200, including the explicit `/404.html` file; this does not establish production unknown-route status handling. “Stable” below describes this initial page inspection, not a blanket approval.

| Route | Job | Primary action | Status | Evidence |
|---|---|---|---|---|
| `/` | Introduce the evidence workflow | Run reference check | Reflow / shell | [375 px diagnostics](evidence/2026-09-26/home-375.json) |
| `/app` | Inspect an authored review workflow | Choose a scenario | Reflow / type | [375 px diagnostics](evidence/2026-09-26/app-375.json) |
| `/proof` | Inspect and recheck trace provenance | Download sandbox trace | Type / measure | [375 px diagnostics](evidence/2026-09-26/proof-375.json) |
| `/trust` | Explain available controls and boundaries | Inspect an artifact | CTA reflow / measure | [375 px diagnostics](evidence/2026-09-26/trust-375.json) |
| `/verify` | Recompute artifact integrity | Verify JSON | Stable; measure | [375 px diagnostics](evidence/2026-09-26/verify-375.json) |
| `/over-grant` | Explore synthetic delegated authority | Widen a diagram leaf | Stable; measure | [375 px diagnostics](evidence/2026-09-26/over-grant-375.json) |
| `/security` | Exercise verifier mechanisms | Run a synthetic check | Stable; measure | [375 px diagnostics](evidence/2026-09-26/security-375.json) |
| `/reference-check` | Evaluate a selected policy locally | Run reference check | Stable; measure | [375 px diagnostics](evidence/2026-09-26/reference-check-375.json) |
| `/labs` | Choose a research demonstration | Explore an experiment | Type / measure | [375 px diagnostics](evidence/2026-09-26/labs-375.json) |
| `/simulation` | Inspect a deterministic simulated plan | Play or step; export evidence | Type / measure | [375 px diagnostics](evidence/2026-09-26/simulation-375.json) |
| `/operations` | Compare a seeded simulated shift | Run a new shift | Reflow / authority wording | [375 px diagnostics](evidence/2026-09-26/operations-375.json) |
| `/proving-ground` | Edit a synthetic floor and inspect oracle results | Edit floor; inspect evidence | Owner wording / type | [375 px diagnostics](evidence/2026-09-26/proving-ground-375.json) |
| `/reference-check-vs-runtime` | Distinguish local evaluation from proposed enforcement | Open reference check | Stable; measure | [375 px diagnostics](evidence/2026-09-26/reference-check-vs-runtime-375.json) |
| `/brief` | Summarize the workflow | Run reference check / print | CTA reflow / type | [375 px diagnostics](evidence/2026-09-26/brief-375.json) |
| `/passport` | Preview scoped fixture permissions | Inspect a use case; owner sign-in | Copy / shell / fallback | [375 px diagnostics](evidence/2026-09-26/passport-375.json) |
| `/foundry` | Inspect a local floor sample | Load sample | Targets / CLS / type | [375 px diagnostics](evidence/2026-09-26/foundry-375.json) |
| `/soc` | Explore synthetic tool-policy decisions | Choose an experiment | Claims / CLS / fallback | [375 px diagnostics](evidence/2026-09-26/soc-375.json) |
| `/clip` | Compare one synthetic prompt response | Run latency comparison | No-JS / type | [375 px diagnostics](evidence/2026-09-26/clip-375.json) |
| `/capture` | Structure site inputs locally | Choose a template | Copy / CLS / fallback | [375 px diagnostics](evidence/2026-09-26/capture-375.json) |
| `/auth` | Explain owner-only access | Sign in / request review | Illustration label / type | [375 px diagnostics](evidence/2026-09-26/auth-375.json) |
| `/admin` | Gate the owner console | Sign in | Illustration label / type | [375 px diagnostics](evidence/2026-09-26/admin-375.json) |
| `/404.html` | Recover from an unknown route | Back to Origin | Label / shell | [375 px diagnostics](evidence/2026-09-26/404-375.json) |
| `/rsi/rsi_dashboard.html` | Read a published research snapshot | Inspect the snapshot; return to Labs | Reflow / claims / type | [375 px diagnostics](evidence/2026-09-26/rsi-rsi_dashboard-375.json) |
| `/legal/privacy-policy.html` | Read stated data-handling terms | Read; return to Origin | Owner copy / focus contrast | [375 px diagnostics](evidence/2026-09-26/legal-privacy-policy-375.json) |
| `/legal/terms-of-service.html` | Read stated service terms | Read; return to Origin | Owner copy / focus contrast | [375 px diagnostics](evidence/2026-09-26/legal-terms-of-service-375.json) |

## Findings, ordered by severity

Tiers: **1 broken/exclusionary; 2 trust-damaging; 3 legibility/hierarchy; 4 feel; 5 cohesion; 6 polish**. Each row is one defect or one shared-rule defect with its affected routes. Proposed values are reviewable targets, **not applied fixes**. `[OWNER]` means approval or authoritative input is required. Integrity/schema fields and dated evidence must remain unchanged when display wording is corrected.

| ID · tier | Route(s) · source | Current value | Exact proposed change | Why · evidence |
|---|---|---|---|---|
| A01 · 1 | RSI · `public/rsi/rsi_dashboard.html:65,111` | Document width 473 px at both 375 and 320; +98 / +153 px. Long identifiers and fixed/min-content grid tracks escape the page. | At ≤700 px use `minmax(0,1fr)` tracks, `min-width:0` on grid children and `overflow-wrap:anywhere` on identifiers; stack `.cf-fam` into one column where needed. Keep wide data tables in labeled, keyboard-reachable overflow containers. Target document width exactly 375 / 320 px. | Substantial content sits outside the reading area. [320 measurement](evidence/2026-09-26/index.json). |
| A02 · 1 | `/app` · `app.html:65–68` | `.ec__col` becomes 304.1 px inside 272 px available; document 328 px at 320. | Mobile grid `grid-template-columns:minmax(0,1fr)`; `.ec__col{min-width:0}` and wrap long queue/verdict strings. Target 0 px document overflow. | Review workflow requires lateral panning. [320](evidence/2026-09-26/index.json). |
| A03 · 1 | `/` · `public/home.css:1045` | `.notgrid` minimum card width 300 px; document 324 px at 320. | `repeat(auto-fit,minmax(min(100%,300px),1fr))`; retain existing 14 px gap. | Boundary cards are clipped at the narrow viewport. [320](evidence/2026-09-26/index.json). |
| A04 · 1 | `/brief`, `/trust` · `public/home.css:145` | `white-space:nowrap` gives CTA widths 278.1 and 270.1 px inside narrower padded containers; +6 / +4 px document overflow. | At ≤375 px, affected CTAs `white-space:normal;max-width:100%;min-width:0;line-height:1.4;text-align:center`. Keep a ≥44 px target. Target 0 px overflow. | Primary actions must remain fully reachable. [Brief](evidence/2026-09-26/index.json), [Trust](evidence/2026-09-26/index.json). Internal table scrolling is a separate, intentional behavior. |
| A05 · 1 | `/operations` · `operations.html:45,65` | Min-content sizing expands `.ops-wrap` children to 302.4 px; document 326 px at 320. | `.ops-wrap,.ops-grid{grid-template-columns:minmax(0,1fr)}` at ≤820 px; grid children `min-width:0`; wrap long control text. Preserve the desktop two-column grid. | Controls and result panels escape the viewport. [320](evidence/2026-09-26/index.json). |
| A06 · 1 | `/foundry` · `src/foundry/ui/foundry.css:116` | Three benchmark links are 11.5 px high; nearest safe target spacing 23.6 px. Axe `target-size` fails all three. | `.fdy-benchstrip a{display:inline-flex;align-items:center;min-height:44px;font:500 .75rem/1.5 ui-monospace,monospace}`; retain wrapping and 14 px horizontal gap. | Actual AA spacing failures, beyond a preference for larger buttons. [375 checks](evidence/2026-09-26/foundry-375.json). |
| A07 · 1 | Both legal pages · `public/editorial.css:135` | Generic legal anchor color overrides the focused skip link: `#2b523b` on `#272d26`, **1.59:1**. Focus ring is visible, text is not legible. | `.legal-page .skip-link{color:var(--on-dark)}` = `#f4f6ee` on `#272d26`, **12.93:1**. Preserve text and focus behavior. | Keyboard-only path to the document fails contrast. [Focused measurements](evidence/2026-09-26/focus-check.json), [settled focus geometry](evidence/2026-09-26/focus-check.json). |
| A08 · 1 | `/clip` · `clip.html:52` | JS off: empty main; only the skip-link text remains (20 characters), with no visible job or recovery action. | Add an HTML fallback with `<h1>Latency comparison</h1>`, text “This synthetic comparison needs JavaScript. No request has been sent.” and a ≥44 px “Back to Labs” link to `/labs`. | Complete dead end without JavaScript or after module failure. [JS off measurements](evidence/2026-09-26/clip-375.json). |
| H01 · 2 | `/proving-ground` **[OWNER]** · `src/proving-ground/ProvingGroundPage.tsx:154–185` | Large L0–L4 ladder, “Verified Readiness Level”, permission-like tier names, “fleet readiness credential”. | Display lead: “`{finished} of {episodes} synthetic robot-type evaluations finish under the fixed oracle`”; detail: “Synthetic tier `{id}` under this fixed verifier; no deployment permission”; button: “Sign synthetic floor evidence”. Replace the visible ladder with per-type outcomes if approved. Keep digest-bound artifact fields untouched. | A small disclaimer does not neutralize the dominant authority ladder. [375 measurements](evidence/2026-09-26/proving-ground-375.json); `fleetReadiness.ts` counts terminal `finish` outcomes; its oracle self-replay is not an independent policy–oracle comparison. |
| H02 · 2 | `/operations` · `src/simulation/OperationsPage.tsx:166`; `operations.html:36` hero | L4 leads the result and the UI says the fleet “earns” a signed readiness credential. | Lead “Synthetic shift targets met” / “Synthetic shift targets not met”; detail “Tier `{rsl_level}` on this seeded simulated shift only”; button “Sign synthetic shift evidence”. | The computed SLA result cannot grant fleet operating authority. [375 text](evidence/2026-09-26/operations-375.json). |
| H03 · 2 | `/capture` · `src/components/CaptureConsole.tsx:163,856` | “Run customer-owned readiness demo”; evaluation occurs “before it earns live authority”; “measured readiness boundary”. | “Run synthetic site evaluation”; “Inspect whether the simulated policy finishes, escalates, or refuses; operating authority requires separate approval”; “Measured outcomes under this synthetic verifier”. | The local fixture and representation pipeline does not authorize a robot. [1440 text](evidence/2026-09-26/index.json). |
| H04 · 2 | RSI · `public/rsi/rsi_dashboard.html:474–555` | Headings say “CUSTOMER-OWNED”, “customer rows” and “Customer-owned readiness”; adjacent prose identifies an Origin-owned synthetic floor. | Visible section label “Origin-owned synthetic demo”; metric label “Synthetic demo rows”; section title “Synthetic policy evaluation”. Retain historical machine identifiers only as clearly labeled schema metadata. | The display promotes a schema lane into apparent real-customer provenance. [375 text](evidence/2026-09-26/rsi-rsi_dashboard-375.json). |
| H05 · 2 | RSI · `public/rsi/rsi_dashboard.html:638–700` and readiness ladder at `1340` | “LEARNED POLICY READY FOR LIMITED PILOT”, “limited pilot evidence”, “Robot-Readiness Gym”. | “Synthetic held-out thresholds passed”; “Evidence from the reviewed synthetic demo only; no pilot or deployment approval”; “Synthetic evaluation gym”. Preserve underlying results and source labels. | Passing synthetic thresholds is evidence for a decision, not release authority. Same [snapshot evidence](evidence/2026-09-26/rsi-rsi_dashboard-375.json). |
| H06 · 2 | `/soc` · `src/foundry/soc/SocConsole.tsx:107,758` | “Origin is that roadmap, shipped”; “Run the live SOC — DeepMind’s roadmap, shipped”. | “This prototype explores selected agent-control patterns”; “Run the synthetic incident workflow”. Keep references as references, without implying endorsement or complete implementation. | The component runs defined scenarios; it does not establish a deployed control architecture. [375 text](evidence/2026-09-26/soc-375.json). |
| H07 · 2 | `/soc` · `src/foundry/soc/SocConsole.tsx:192,221,568` | “cost of earning a guarantee”, “Speed buys correctness”, categorical GPU comparisons; fallback result can say an injection was “blocked”. | Heading “Accuracy within a time budget”; prose “Compare observed scenario outcomes and timing under the displayed assumptions”; result “Synthetic policy decision `{verdict}` in `{ms}` ms”, with “illustrative fallback” before any fallback number. | Latency and fixture outcomes do not establish prevention, platform superiority or a correctness guarantee. Source distinguishes live/fallback data; public copy must carry that distinction. [1440 text](evidence/2026-09-26/index.json). |
| H08 · 2 | `/passport` · `src/passport/ui/components/Home.tsx:208`; `src/passport/ui/App.tsx:306` | “IN A LIVE SCENARIO” badges and “run Passport live” next to a static-fixture local-demo boundary. | Badge “Demo scenario”; banner “Read-only preview — owner sign-in enables the local demo.” | “Live” makes fixture execution sound like a connected customer workflow. [375 measurements](evidence/2026-09-26/passport-375.json). |
| H09 · 2 | Both legal pages **[OWNER]** · privacy `:27`, terms `:30` | “available through a founder-led pilot program”; “currently offered … to selected pilot participants”. | Factual wording approved 27 September: “Origin is a prototype. The public demonstration uses synthetic data. Any external evaluation requires a separate agreement.” | Conflicts with the public homepage’s no-pilot posture. The report records the approved copy change; implementation is a separate task. [Privacy](evidence/2026-09-26/legal-privacy-policy-375.json), [Terms](evidence/2026-09-26/legal-terms-of-service-375.json). |
| H10 · 2 | Privacy **[OWNER]** · `public/legal/privacy-policy.html:62` | General claim of append-only hash-chained policy/tool-call logs and “A DPA and a security review are available on request.” | Removal approved 27 September. Narrow factual sentence: “Public demonstration artifacts use the verification mechanisms identified with each artifact.” Do not promise a DPA without an approved document. | A checked-in trace format does not prove service-wide operational logging or document availability. Same privacy evidence; no legal conclusions inferred. |
| H11 · 2 | Terms **[OWNER]** · `public/legal/terms-of-service.html:75` | Visible “Governing-law placeholder”. | **Owner decision (27 September): retain the placeholder.** No jurisdiction or operating-entity clause is invented. | The published document is visibly unfinished. [Terms screenshot measurements](evidence/2026-09-26/legal-terms-of-service-375.json). |
| H12 · 2 | `/auth`, `/admin` · `src/auth/AuthPage.tsx:330`, `src/auth/AdminPortal.tsx:45` | `review.webp` is a large desktop illustration with no visible AI/fictional-setting label; the whole aside is aria-hidden. | Add visible caption “AI-generated illustration · fictional people and setting” at 12 px/1.5, `#4e5b48` on opaque `#f8f7f4` (**6.73:1**); expose the caption to assistive technology. | The same image is clearly labeled on public editorial pages. [Auth measurements](evidence/2026-09-26/auth-375.json), [Admin measurements](evidence/2026-09-26/admin-375.json). |
| H13 · 2 | `/` · `index.html:161`; `src/home/enhance.ts:430` | Demo panel 3 still says “produce a readiness level” and “READINESS LEVEL”. | Say “produce scored outcomes under the fixed oracle”; label “EVALUATION RESULT”. Keep configuration-bound artifact fields unchanged. | The home demonstration must use the same authority boundary as the reference check. [Baseline text](evidence/2026-09-26/home-375.json). |
| A09 · 3 | `/capture`, `/soc`, `/foundry`, `/passport` · `capture.html:43`, `soc.html:58`, `foundry.html:59`, `passport.html:58` | JS-off mains have no h1. Capture/SOC render only the outer shell; Passport has explanatory text but no usable visible return path. | Give each fallback one h1 naming its job, one 14 px/1.65 explanatory paragraph, and a 44 px `/labs` link. Hide fallback content only after a successful mount; preserve it on module failure. | Three of the four pages already link to Labs. The missing h1 and useful fallback hierarchy are a legibility issue; preserve existing return links. [Fallback screenshots](evidence/2026-09-26/README.md). |
| L01 · 3 | `/brief` · `public/editorial.css:104,110,118` | Boundary, five-step descriptions and evidence-rung prose are 12 px. | Screen prose `var(--fs-14)` = `.875rem`, line-height `1.65`; preserve independent print rules and recheck pagination. | These sentences establish the evidence boundary. [Typography](evidence/2026-09-26/index.json). |
| L02 · 3 | `/app`, `/proof` · `app.html:130,159,182`; `proof.html:134` | Explanatory prose 12–13 px; proof-status/trace-available labels 11 px. | Prose `.875rem/1.65`; integrity labels `.75rem/1.5`; ordinary short UI labels may remain `.6875rem/1.5`. Apply by semantic role, not all `p` tags. | The most consequential labels are smaller than the agreed floors. [App](evidence/2026-09-26/index.json), [Proof](evidence/2026-09-26/index.json). |
| L03 · 3 | `/labs`, `/trust` · `public/editorial.css:10,59` | Full boundary descriptions and per-lab verifier explanations are 12 px. | Full-sentence boundary/verifier prose `.875rem/1.65`; retain standalone figure captions at `.75rem/1.5`. | Long qualifiers function as prose, not tiny metadata. [Labs](evidence/2026-09-26/index.json), [Trust](evidence/2026-09-26/index.json). |
| L04 · 3 | `/proving-ground` · `src/App.css:3741,3859`; `src/shared/product-workspace.css:163` | Fleet tags 8 px; active label 10.5 px; robot-code glyphs 10 px; several result/scope sentences 12–13 px. | Ordinary labels ≥`.6875rem/1.5`; fleet/evidence labels ≥`.75rem/1.5`; full sentences ≥`.875rem/1.65`. Keep each editing cell ≥44 px and its labeled horizontal scroller. | Tiny fleet membership labels make the scene harder to interpret. [375 typography](evidence/2026-09-26/proving-ground-375.json). The 375/320 page itself now has **0 px** overflow. |
| L05 · 3 | `/capture` · `src/App.css:557`; `src/components/CaptureConsole.tsx` | Panel kickers 10 px; ledger labels 10.5 px; instructional prose 11.5–13 px. | Labels `.6875rem/1.5`; pipeline/source-status labels `.75rem/1.5`; explanatory prose `.875rem/1.65`. | A complex intake page needs readable provenance and instructions. [375 typography](evidence/2026-09-26/capture-375.json). |
| L06 · 3 | `/foundry`, `/soc` · `src/foundry/ui/foundry.css:212,217,238,292`; `src/foundry/soc/soc.css:43,104` | Source/scope paragraphs 12.5–13.5 px, including illustrative-training and model-feature disclaimers. | Full-sentence notes `.875rem/1.65`, `max-width:75ch`; integrity tags `.75rem/1.5`. | Limitations deserve the same legibility as the claim. [Foundry](evidence/2026-09-26/index.json), [SOC](evidence/2026-09-26/index.json). |
| L07 · 3 | `/clip` · `src/foundry/clip/clip.css:36` | “SYNTHETIC INCOMING MESSAGE” 10 px; request disclosure 13 px; footer guidance 12 px. | Fixture tag `.75rem/1.5`; request disclosure/footer `.875rem/1.65`. | Provenance and external-request disclosure fall below their semantic floors. [375](evidence/2026-09-26/clip-375.json). |
| L08 · 3 | `/passport` · `src/passport/ui/passport.css:362` | Scenario/integrity badges and sponsor roles 10.5 px; scenario prose 13 px. | Scenario badges `.75rem/1.5`; ordinary roles `.6875rem/1.5`; prose `.875rem/1.65`. | Readers should not need zoom to distinguish a demo scenario from a real action. [375](evidence/2026-09-26/passport-375.json). |
| L09 · 3 | `/operations`, `/simulation` · `operations.html:82`, `simulation.html:78` | Long scope notes 13 px; operation caption 12 px. | Scope prose `.875rem/1.65`; caption may remain `.75rem/1.5` if short. | Simulation limitations are essential prose. [Operations](evidence/2026-09-26/index.json), [Simulation](evidence/2026-09-26/index.json). |
| L10 · 3 | `/auth`, `/admin` · `src/auth/authPage.css:33,54,59` | Request guidance 12 px, access note 11 px, alternative-action sentence 13 px. | Full sentences `.875rem/1.65`; retain kickers at `.6875rem/1.5`. | Access restrictions and next steps are functional instructions. [Auth](evidence/2026-09-26/index.json), [Admin](evidence/2026-09-26/index.json). |
| L11 · 3 | RSI · `public/rsi/rsi_dashboard.html:62,1360` | Long source/boundary paragraphs 13 px; “we are here” 10 px. | Prose `.875rem/1.65`; status label `.75rem/1.5`; add the shared type variables to this page. | Dense research results need clear status and scope. [375](evidence/2026-09-26/rsi-rsi_dashboard-375.json). |
| L12 · 3 | `/404.html` · `public/editorial.css:145` `.nf__visual figcaption` | Generated-illustration label 11 px. | `.75rem/1.5` = 12 px, retaining its opaque background and current dark text. | It is a provenance label, with a 12 px floor. [375](evidence/2026-09-26/404-375.json). |
| L13 · 3 | Most explanatory routes · `src/shared/product-workspace.css:7,26`; `public/editorial.css:128`; page-specific scope notes | Long desktop prose measures 78–170ch: product scope 86ch; operations note 158.1ch; legal prose 89.7ch; research source notes 149.3ch. | Constrain explanatory paragraphs and `.product-hero__scope`, `.workspace-intro p`, `.sec-note`, `.rc-hint`, `.pg-note`, `.ops-note`, `.sim-note`, `.fdy-brainline`, research `.sub`, and legal `p,li` to `max-inline-size:75ch`. Keep tables and short metric rows unconstrained. | Sentence lines should end before they become a tracking exercise. The exact selectors, widths and computed ch are in each route’s `typography` array. [Evidence index](evidence/2026-09-26/README.md). |
| L14 · 3 | RSI · `public/rsi/rsi_dashboard.html:1347` | h2 “Readiness ladder” jumps to h4 “Geometry” and four peer cards. | Change the five card headings to h3; preserve their 15 px visual size initially, then use the shared heading token during type cleanup. | Heading hierarchy is structural, independent of size. Axe `heading-order` identifies the first skipped level. [375 checks](evidence/2026-09-26/rsi-rsi_dashboard-375.json). |
| L15 · 3 | `/soc` · `src/foundry/soc/soc.css:42` | Direction arrows `#6b6555` on `#2a3b2f` / `#204a37`: **2.05 / 1.73:1**. | Use `#c0cbbc` (the shared token is not loaded on this route): **7.09 / 5.97:1**. Mark redundant arrows aria-hidden while preserving the ordered text sequence. | Direction in the control sequence is difficult to see. [Computed contrast](evidence/2026-09-26/soc-375.json). |
| L16 · 3 | `/foundry`, `/soc`, `/capture` · `foundry.html:59`, `soc.html:58`, `capture.html:43` and their stylesheet heads | Late base styling moves the body; the footer is painted before React content. Development repeat CLS: **0.091–1.000**. Production follow-up still shifts (maximum **0.1367**), versus target ≤0.01. | Load the existing base stylesheet in the HTML head, set initial body margin to 0 and reserve the mount with `min-height:100vh;display:flow-root` while enhancement is active. Remove reservations for real no-JS fallback. Target ≤0.01 across three plain-viewport runs per width. | The initial reading position changes materially. [18 repeated measurements](evidence/2026-09-26/legacy-cls.jsonl) include body/footer sources; The [18 production repeats](evidence/2026-09-27-production/legacy-cls.jsonl) confirm footer movement; repair remains warranted. |
| F01 · 4 | `/foundry`, `/soc` · `src/foundry/ui/foundry.css:84–86,311` | Reduced motion still performs `translateY(-1px)` on hover over 80 ms ease. | In reduce mode set hover transform `none`; transition only color/background/border-color/opacity for **120 ms ease**. | Preserve feedback without positional movement. [Settled hover measurement](evidence/2026-09-26/supplement.json). |
| F02 · 4 | `/proving-ground` 3D · `src/components/ProvingGround3D.tsx:449–459` | Animation resets after the final tick +2.6 and continues when the scene is offscreen. A manual pause exists. | Clamp at the final tick, stop advancing offscreen/hidden, and restart only on Play; preserve the pause control and final frame. No added entrance animation. | Align 3D with the newly finite 2D/operations previews. This is pre-existing behavior, now corrected by the T5 review repair (finite playback and hidden/offscreen rendering suspension). Source loop is the evidence; no production GPU/power claim is made. |
| F03 · 4 | `/` · `src/home/cinematic.ts:37` | Hero `play()` fetches **422,320 B** despite `preload="none"`; local initial load also fetches below-fold art. | Preserve one-shot/pause semantics; defer hero media until deliberate play or ship a verified smaller source set. Target **≤450,000 B production first load** at 375 px; remeasure on a local production build before claiming success. Keep poster and caption. | Persistent media weight survives removing development tooling. [Resource list](evidence/2026-09-26/home-375.json). No encoding or asset swap is approved by this report. |
| F04 · 4 | `/capture` · `src/brainClient.ts:8`; template catalog consumers | Two cold requests for `library.json`, **2,940,187 B each**. | **Production follow-up: no deduplication change needed.** One catalog request, 167,747 transfer bytes (167,447 encoded; 2,939,887 decoded) at 375 px. Keep the current production fetch behavior. | Avoid transferring the same static catalog twice. [Resources](evidence/2026-09-26/capture-375.json). The duplicate was a development-only observation; [production resources](evidence/2026-09-27-production/capture-375.json) show one request. |
| C01 · 5 | Shared editorial footer · `index.html:239`; `public/home.css:613` | Markup uses `.site-footer__grid`; CSS styles `.site-footer__inner`. Brand and navigation stack on desktop. | Apply the existing grid to `.site-footer__grid`: `display:grid;grid-template-columns:1.4fr 1fr;gap:32px`; one column ≤700 px. | A mismatched class breaks the intended common footer. [Home viewport summaries](evidence/2026-09-26/index.json). |
| C02 · 5 | `/app`, `/proof`, comparison, Labs subapps, account, legal, 404 · `public/home.css:222,612`; `passport.html:58`; `public/editorial.css:124` | Multiple header/footer patterns and logo treatments; owner-console link absent from several public subapp shells. | Public editorial pages share Product / Demo / Evidence / Trust and the same footer groups; Labs pages use Origin / Back to Labs plus Privacy / Terms / Owner console. Labels 14 px/1.5, standalone actions ≥44 px. Keep owner-console wording explicitly restricted. | Consistent return paths improve orientation. Account and 404 can retain a compact shell with “Back to Origin”. [All route landmarks/links](evidence/2026-09-26/README.md). |
| C03 · 5 | `/passport` · `passport.html:58`; `src/passport/ui/components/Home.tsx` | Static fallback paragraph remains above the mounted app; second header uses a browser-blue underlined Passport wordmark. | Hide `.pp-static-intro` only when `#passport-root` has rendered children; keep the in-app local-demo boundary. Brand link `color:var(--ink);text-decoration:none;font-size:27px;line-height:1.2`. | Duplicate introduction and inconsistent brand treatment obscure the start of the app. The current band is light in this snapshot, not the previously reported dark band. [375 measurements](evidence/2026-09-26/passport-375.json). |
| C04 · 5 | Shared styles and page-local rules · e.g. `public/home.css:706`; `src/shared/product-workspace.css:7`; complete source list linked | Static inventory finds **1,473 hex-bearing CSS declarations outside `:root`**, including styles not active in this anonymous matrix; size literals also bypass the ladder. | Move repeated palette values into root tokens, then use semantic tokens: ink `#272d26`, soft `#4e5b48`, muted `#59664f`, signal `#2b523b`, paper `#f8f7f4`; ordinary type uses existing `--fs-*`. Keep role-specific status colors and measured contrast. | This is a maintenance inventory, **not 1,473 visual failures**. [Exact files/lines](evidence/2026-09-26/source-literals.json). No blind global replacement. |
| C05 · 5 | RSI · `public/rsi/rsi_dashboard.html:4`; `public/sitemap.xml` | The research snapshot is crawlable but omitted from the 12-URL sitemap; all other audited non-sitemap tools are noindex or legal pages. | Recommended `meta name="robots" content="noindex,follow"` for this bounded snapshot, with its existing public links intact. Alternatively explicitly choose it as an indexed destination and update the sitemap. | This is an indexing-policy inconsistency, not proof of a crawl failure. The owner should pick one policy. [Robots metadata](evidence/2026-09-26/rsi-rsi_dashboard-375.json). |
| C06 · 5 | Labs shell footer / standalone secondary links · Labs HTML shell styles | Several Labs-shell standalone links have 18–23 px height; the shared editorial footer is already 44 px at 375. Spacing usually prevents an AA failure. | Standalone navigation links `display:inline-flex;align-items:center;min-height:44px`; retain inline prose-link exceptions. | Align with the requested 44 px usability goal. Do not count these as the measured Foundry failures in A06. [Target rectangles](evidence/2026-09-26/README.md). |
| P01 · 6 | `/` · `index.html:237` gate-freshness text | Axe reports one `region` item for the gate-freshness notice outside a landmark. | Put that notice inside the existing `main` or footer contentinfo, without changing copy or introducing another h1. | Minor landmark completeness. [Axe node](evidence/2026-09-26/home-375.json). |

The table contains **8 Tier 1, 13 Tier 2, 17 Tier 3, 4 Tier 4, 6 Tier 5, and 1 Tier 6 findings**. All confirmed Tier 1–3 findings are included. Eleven findings are in Tiers 4–6, below the 25-item limit. Additional omitted findings: Tier 4 = 0; Tier 5 = 0; Tier 6 = 0. Repeated instances of a shared-rule defect are retained in the measurement files, not counted as separate findings.

## Production follow-up — 27 September

The production preview at `6c9f932` used public anonymous auth fixtures, optional backend fetches disabled, and external requests blocked. It is a local production build, not a live-site speed claim. The [follow-up evidence](evidence/2026-09-27-production/README.md) records six initial route/viewport captures and 18 repeated CLS measurements.

| Finding | Production observation | Decision |
|---|---|---|
| F04 catalog duplication | One request at 375 px; 167,747 B transferred, 2,939,887 B decoded | No production deduplication repair |
| L16 legacy layout | `/foundry` max 0.136700, `/soc` max 0.136700, `/capture` max 0.136700 | Reserve the enhanced mount; preserve no-JS fallback |
| F02 3D playback | Repaired in the preceding motion PR, with loop/offscreen/hidden-tab regression tests | Do not implement it twice |

The report now contains 49 baseline findings after adding H13 and reclassifying A09. H11 is deliberately retained; F04 does not reproduce in production. Screenshot binaries and expanded diagnostics are CI artifacts. The committed baseline keeps only its report, README, summary, supplementary files and 375 px diagnostics.

## Measurement ledger

All initially rendered pages have one visible h1 with JavaScript enabled; the RSI ladder is the observed heading-order failure. JavaScript-off exceptions are A08/A09. Landmark and keyboard checks otherwise found visible focus rings in the sampled stops. The legal skip-link text contrast is a distinct focus-state failure missed by the initial axe scan.

Solid-color text meets 4.5:1 (or 3:1 for qualifying large text) outside the confirmed findings and redundant icon candidates. For example, white on the primary `#2b523b` button is **8.85:1**; muted `#59664f` on paper `#f8f7f4` is **5.70:1**. Opaque caption panels should be preserved over images. The audit does not turn unresolved image/gradient checks into passes.

The local matrix is recorded below. Bytes include development overhead. Max CLS is the largest of the three viewport observations, not a field statistic. The retained repeat measurements are stronger evidence for the three unstable legacy routes.

| Route | Max observed CLS | 375 px LCP element | 375 px first-load transfer B |
|---|---:|---|---:|
| `/` | 0.000261 | `video.cin-hero__film` | 1,147,518 |
| `/app` | 0.000000 | `p.ec__lede` | 484,929 |
| `/proof` | 0.000000 | `h1` | 608,211 |
| `/trust` | 0.000000 | `img` | 654,113 |
| `/verify` | 0.000000 | `p.section__lede` | 4,251,105 |
| `/over-grant` | 0.000000 | `p.section__lede` | 4,236,449 |
| `/security` | 0.000000 | `p.section__lede` | 4,212,717 |
| `/reference-check` | 0.000000 | `p.product-hero__scope` | 4,183,646 |
| `/labs` | 0.000000 | `img` | 643,667 |
| `/simulation` | 0.000000 | `p.section__lede` | 9,890,653 |
| `/operations` | 0.000000 | `p.section__lede` | 3,971,429 |
| `/proving-ground` | 0.003125 | `img` | 11,938,715 |
| `/reference-check-vs-runtime` | 0.000000 | `p.section__lede` | 514,115 |
| `/brief` | 0.000000 | `p.brief__lede` | 541,937 |
| `/passport` | 0.000000 | `p.pp-hero-lede` | 5,952,239 |
| `/foundry` | 1.000000 | `p.fdy-hero__sub` | 3,843,916 |
| `/soc` | 1.000000 | `p.fdy-hero__sub` | 3,614,643 |
| `/clip` | 0.000000 | `h1` | 3,425,055 |
| `/capture` | 0.178000 | `p.flow-sub` | 11,190,130 |
| `/auth` | 0.000000 | `h1.ap-title` | 4,737,696 |
| `/admin` | 0.000000 | `p.ap-sub` | 6,855,468 |
| `/404.html` | 0.000000 | `img` | 216,010 |
| `/rsi/rsi_dashboard.html` | 0.000000 | `h1` | 181,903 |
| `/legal/privacy-policy.html` | 0.000000 | `p.intro` | 117,642 |
| `/legal/terms-of-service.html` | 0.000000 | `p` | 116,748 |

The 12 sitemap URLs contain no `noindex` declaration. `/app` is intentionally noindex and absent from the sitemap; the scope includes it as a served route, not a thirteenth sitemap entry. RSI is the policy exception in C05. The [navigation check](evidence/2026-09-26/navigation-check.json) found no missing fragments on the audited pages and no HTTP failures among 32 local linked destinations; external destination availability and production email obfuscation were not tested.

### Motion and interaction inventory

[Motion inventory](evidence/2026-09-26/motion-inventory.json) retains every observed transition/animation declaration, duration, easing, iteration count and media condition, plus computed normal/reduced styles per route. CSS definitions for inactive states are retained as definitions, not represented as tested live interactions. Key behavioral checks:

| Surface | Current timing / trigger | Reduced motion / evaluation |
|---|---|---|
| Shared buttons, links, nav | Typically 120 ms cubic-bezier(.23,1,.32,1) movement and 120–200 ms feedback | Shared movement suppressed; feedback remains. Foundry/SOC hover exception F01 is measured. |
| Home demo steps | 200 ms cubic-bezier(.23,1,.32,1), 4 px entrance on explanatory children | None under reduce. Verdict readouts and their ancestors stay still. |
| Lead dialog | 180 ms cubic-bezier(.23,1,.32,1), 6 px + scale .985; backdrop 180 ms linear | Opacity-only 120 ms linear; close instant. T6 browser tests verify both. |
| Delegation inheritance path | Opacity 200 ms cubic-bezier(.23,1,.32,1) | Opacity retained, no transform; actual parent pointers determine the path. Counts change instantly. |
| Home film | One-shot video, user pause; no loop | Paused at initial reduced-motion load. It currently fetches on normal-motion load (F03). |
| Operations and 2D floor | Finite playback; 2D discrete step 460 ms; manual pause and visibility suspension | Static final frame initially. Editing a floor reconciles to the new final frame. Verified by regression tests. |
| Simulation | Frame-driven deterministic replay with Pause / Step / Restart and a finite final frame | Initial reduced mode is static; explicit controls remain. No trust value is tweened. |
| Proving-ground 3D | Frame loop, repeats after end +2.6 ticks; pause present | Initial reduced mode selects 2D. Explicit 3D/offscreen behavior remains the separate proposal F02. |
| Robot type illustration | 350 ms entrance (`embodiment-fade`) | Removed under reduce; descriptive illustration, not verdict evidence. |
| Passport conditional states | CSS includes 0.28–0.35 s entrances; 0.7 s ledger effect; 0.9–1.8 s pulse/dot/mic cycles | Global reduced override disables animation and positional movement. These owner/action states were source-inspected, not run against live credentials. Exact declarations are in the inventory. |
| Foundry/Clip conditional results | CSS entrances and bar transitions plus returned-data replay | No comparison/provider call made for this audit. The checked-in browser suite verifies explicit request consent and replay boundaries. |

### Honesty checks against implementation

| Surface | Code/evidence read | Conclusion |
|---|---|---|
| Reference check / verifier / security | `ReferenceCheckPage.tsx`, `VerifyPage.tsx`, examples, credential verification, `checkFeedback.ts`, `SecurityPage.tsx` | Selected policy versus deterministic synthetic tasks; session signer remains unpinned; input edits invalidate current results; displayed check stamps are feedback, not signed payload changes. |
| Over-grant | `SecurityPage.tsx` (`DelegationPanel`), corpus analyzer and benchmark verification | Static tree and generated corpus are separate experiments. The highlighted path follows the tree’s parents. Published benchmark counts are not substituted for in-page counts. |
| Proof / review console | TR-A001/TR-A002 labels, published trace generator/verifier and `app.html` scenario wiring | Authored review states are clearly scoped; TR-A002 is a machine-emitted sandbox chain. No customer-execution evidence is established. |
| Floor / simulation / operations | `ReflectAlign.tsx`, `MultiRobotSim.tsx`, `ProvingGround3D.tsx`, `fleetReadiness.ts`, simulation pages | Deterministic modeled geometry and descriptive playback remain distinct. Visible readiness framing remains H01–H03. |
| Foundry / Clip | Foundry component, provider-enable/consent branches, fixed illustrative learning series, Clip request/replay state | Public sample and external-request conditions are explicit. Benchmark source/provenance links remain. Static learning points are not a training run. |
| SOC / Passport | SOC scenarios, source/fallback conditions, Passport read-only guard and scenario cards | Hero boundaries are helpful; contradictory deeper “shipped”, guarantee, and “live” strings are H06–H08. |
| Account / legal | Auth/Admin anonymous guards; both served legal documents | Account creation is visibly closed; owner access is explicit. Illustration labels and factual legal-copy questions remain H09–H12. No authenticated control claim was tested. |
| Home / Labs / brief / comparison / 404 | Served HTML, shared enhancement/cinematic scripts and local route checks | Core evidence boundaries and illustration captions are present. No withdrawn recording was reintroduced. Remaining exceptions are in the findings table. |

## What works — protect this

1. **The evidence boundary is visible at the point of use.** Browser-local synthetic evaluation, unpinned session signatures and artifact integrity are increasingly explained beside the action.
2. **The oracle remains the authority.** Model suggestions, descriptive playback, deterministic evaluation and permission are distinguishable in the working mechanisms. Preserve that distinction while correcting the remaining labels.
3. **The editorial palette and hierarchy already work.** Warm paper, restrained green, readable large headings and one primary action per home section are coherent. Keep the existing visual direction.
4. **Reviewers can inspect artifacts.** The public trace, verifier, source/provenance links and current-versus-proposed trust structure reward examination rather than relying on decoration.
5. **Feedback is now calm and concrete.** Still verdicts, fresh timestamps, explicit pause controls and meaningful path highlighting improve comprehension without animating trust values.
6. **The robot imagery has a defensible role.** Original generic illustrations and labeled modeling assumptions communicate type without pretending to be vendor specifications or physical validation.

## Five highest-leverage moves

1. **Repair access and narrow-screen use:** A01–A09. Start with the legal skip-link contrast, actual Foundry target failures, RSI reflow and meaningful no-JS fallbacks.
2. **Make dominant labels match the evidence lane:** H01–H12, with explicit owner decisions for the readiness ladder and legal text. Preserve schemas and dated evidence.
3. **Apply semantic type floors and readable measures:** L01–L15. Prose 14 px, ordinary labels 11 px, integrity labels 12 px, prose ≤75ch; avoid enlarging every short metric indiscriminately.
4. **Finish the shared shell and legacy loading state:** L16, C01–C03 and C06. Use consistent return paths, correct footer grid ownership and stable initial geometry.
5. **Reduce purposeful motion and persistent bytes:** F01–F04 after the above. Validate on a production build before claiming production performance savings; do not add decorative motion.

## September 18 audit follow-through

| Prior issue | Current status / evidence |
|---|---|
| Trust page represented proposed enforcement as current operation | **Fixed in the shipped redesign.** Current cards distinguish available local checks and proposed controlled execution. H09/H10 are narrower remaining legal-copy contradictions. |
| Labs looked like undifferentiated product cards; public upload authority was unclear | **Fixed in the shipped redesign.** Different experiment jobs and public-sample/local-backend boundaries are visible; Foundry consent tests pass. Small labels remain L03/L06. |
| Proof lacked clear trace provenance and honest copy failure | **Fixed.** Machine-emitted sandbox trace leads, authored specimen stays separate, and copy failure is tested. Type/line-measure work remains. |
| Brief described runtime-proxy architecture as the current product | **Fixed.** The workflow now describes local policy evaluation and independent checking. Small boundary prose remains L01. |
| Verifier/reference-check results survived changed inputs | **Fixed.** Current revision checks and invalidation tests pass; repeated checks now also expose a fresh still timestamp. |
| Floor edits left an old signed artifact visible | **Fixed.** Input-digest binding controls visibility of the current signed result; the separate save-before-delete repair is also verified. |
| Over-grant mobile tables and floor-editor notes obscured meaning | **Fixed for the audited initial state.** Mobile analyzer labels and descriptive-note boundaries are explicit. |
| Clip sent a provider request automatically or implied replay was a live race | **Fixed at entry.** Explicit disclosure and consent precede requests; returned-data replay is distinguished. SOC retains separate contradictions H06/H07. |
| Account entry looked like public signup; owner status was ambiguous | **Fixed for the anonymous entry.** Closed creation and owner-only access are explicit. Authenticated and production-provider behavior was not revalidated in this visual audit. |
| 404 and research pages were isolated; legal pages lacked visual consistency | **Improved.** 404 recovery, Labs return and research provenance exist; legal styling is aligned. Remaining fallback, legal copy and focused contrast issues are listed. |
| Old note said the redesign was uncommitted | **Historical note is stale.** The redesign shipped in PR #65 (`48a1df8`). The old document itself was not edited in this task. |

The earlier 375 px proving-ground overflow did **not** reproduce: the current document is 375 / 320 px wide and the floor editor uses its own labeled scroller. Do not “fix” that intentional grid scrolling by shrinking its editing cells.

## Additions considered and rejected

- **New hero imagery, fake product footage, logos or a replacement Passport AI clip:** they add no verifiable evidence and risk new provenance confusion.
- **Animated scores, hashes, BRI or verdicts:** the measured value must be still and immediately readable.
- **Scroll reveals, skeleton shimmer, autoplay recordings or more ambient loops:** no named feedback or explanation purpose justifies them here.
- **A universal giant heading/button treatment:** the site needs semantic floors and consistent roles, not more visual weight everywhere.
- **Hiding overflow with `overflow-x:hidden`:** it would conceal controls and identifiers instead of correcting reflow.
- **Treating every <24 px inline link as a WCAG failure:** spacing and inline-text exceptions matter. A06 is measured; C06 is an explicit usability goal.
- **Renaming signed schema fields to clean up copy:** display wording can change without silently invalidating existing evidence.
- **Recomputing published RSI metrics or editing protected legal/evidence text during this audit:** that would exceed the report’s authority and introduce unsupported claims.

## Verification and decision boundary

The original combined runtime candidate passed the required checks locally:

- Honesty lint: **clean**, 21 served pages + 173 React copy files, 28 banned patterns, 3 required disclaimers, 9 launch contracts.
- Visible-text tests: **4/4**.
- App gates: **788 tests across 95 files**, build/lint, evidence and trace re-verification, reachability, CSS version, three benchmark checks and OG-presence check all passed.
- Full Playwright: **252 passed, 3 skipped**. External browser requests were blocked; fixture responses were local. A fresh rerun on the report branch without T3 passed **776 unit tests across 94 files / 250 browser tests**, with the same 3 skips; honesty was clean (172 copy files) and visible-text was 4/4.
- Visual coverage: **75 initial page captures + 25 no-JS captures + 2 focus captures**, with all routes represented. A focused viewport capture confirmed that occasional sticky-header clipping in very long Chromium full-page images was a capture artifact, not document reflow; the JSON contains the actual target geometry. The T4 acceptance matrix separately passed all **78** measurements at ≤0.01 (maximum 0.001657). New legacy-route failures are reported, not hidden by the green functional suite.
- Changes in this report PR are the collector, report and evidence only. No design fix, merge, deploy, schema change, live credential use, or rewrite of legal text, canonical URLs, robots, OG images, backend configuration or dated proof/trust artifacts occurred.

The corrected report collector subsequently completed the same 102-image matrix against the production preview at `6c9f932`, including all eight supplemental outputs. The required verification on this corrected report branch passed honesty lint, visible-text 4/4, app gates (778 tests in 96 files), and Playwright (284 passed, 3 skipped).

**Recommendation:** implement the approved reflow, factual-copy, typography and shell groups, preserving signed formats and evidence boundaries.


**Next three actions:** (1) complete the approved groups with measured or regression-tested changes; (2) run the release gates and deploy the verified UI; (3) record the updated live demonstrations and validate the media release.
