# AGI House sprint — iteration log

Autonomous loop toward the AGI House win. Each entry: what shipped, verification, next.

## I1 — Autoplay hero film on the Trust page ✅
- **Built:** replaced the click-to-watch film card with a self-contained, **autoplaying, looping**
  inline SVG/CSS hero film (muted by nature — a motion graphic): the agent-economy node chain, a
  passport card that narrows across handoffs, one node going rogue + a kill ring + branch contained,
  a green "seal" check, and 4 cycling captions ending on "Trust that travels with the agent." Auto-
  swaps to a muted `autoplay loop` `<video>` if `story-travel.mp4` is ever added (home-page style).
  Kept a subtle "Watch the full film ↗" link to the Claude Design film. Respects reduced-motion.
- **Files:** `dashboard/index.html` (film CSS + keyframes; `setVideo()` rewrite).
- **Verified:** live on localhost:8765 — `.cpfilm` present, `cpfCard` animation running, 4 nodes,
  full-film link, **zero console errors**. Matches "autoplay, no sound, like the home page."
- **Next:** I2 — refit the 1Password adapter to the real `onepassword-sdk` shape.

_(Research in hand: docs-verified 1Password + Daytona integration brief — SDK resolve, op run,
Events API signinattempts/auditevents, Users-API :suspend, Daytona ephemeral + linked sandboxes,
with honesty caveats: itemusages simulated, service-account revoke console-only.)_

## I8 + I9 — Pitch assets from the winning-strategy research ✅
- **Built:** `DEMO_SCRIPT.md` (3-min no-slides script: lethal-trifecta cold open → "OAuth keeps the
  token armed 24h" → live JIT 1P secret → attenuation → injection + **instant cascading kill** →
  hash-chained ledger → market close; one-liner; objection rebuttals; live-vs-mock honesty; stat
  hygiene) and `WHY_WE_WIN.md` (the four-primitive moat, competitive map vs Okta/Auth0/MCP/SPIFFE/
  UCAN/Astrix, "is it a company" case, sponsor fit, stat-attribution corrections).
- **Why now:** AGI House rewards a live demo + a fast human story + "is this a company?"; pitch
  nights are 2-min no-slides; the AgentOps trust-console → company precedent is our exact shape.
- **Reprioritization (folds into the plan):** the **instant cascading kill-switch** is the demo's
  emotional peak and the field's universal weak point → make it unmissable in the dashboard, and add
  a **second relying party that rejects a revoked passport** (don't just toggle UI). Mirror **AP2 PoP**
  (cnf / RFC 9449) framing. Keep the "armed for 24h" killer line.
- **Honesty flags recorded:** 82:1 = CyberArk (not Gartner); EchoLeak 9.3 per Microsoft; drop
  "Cloudflare macaroons" (Fly.io/ForgeRock); verify 2026 citations.
- **Verified:** docs coherent + on-message; no code touched → gates still 24/24 + 22/22.
- **Next:** I2 (1P SDK adapter) → I4 (dual-plane + cascading kill, with a 2nd-RP rejection beat) →
  I7 ("steal the passport" live PoP attack button) → I6 (audit+identity panel).

## I2 — 1Password adapter → real `onepassword-sdk` shape ✅
- **Built:** `vault_onepassword.py` now fetches JIT in-memory via the **1Password SDK**
  (`Client.authenticate` + `client.secrets.resolve("op://…")`, lazy-imported, cached client) with the
  **`op` CLI** (`op read`) as automatic fallback; `backend_label` reflects which path served (SDK/CLI),
  shown in the ledger. Still masked, in-memory, scrubbed on revoke. Mock stays default.
- **Verified:** compiles; `make_vault()` with no env still returns the mock `Vault`; gates green.

## I3 — 1Password Events audit feed ✅
- **Built:** `passport_core/onepassword_events.py` (stdlib `urllib`) pulls the activity trail —
  `signinattempts`/`auditevents` **real** when `OP_EVENTS_TOKEN` is set, fully **simulated + labeled**
  offline. `itemusages` is **always** labeled simulated (service accounts don't emit it — honesty).
  `events_mode()` reports real+simulated vs simulated. Feeds the upcoming audit+identity panel (I6).
- **Verified:** new `tests/test_events.py` → **5/5** (offline feed non-empty, all `simulated:true`,
  itemusages always simulated, event shape, limit respected).

## I4 — Dual-plane cascading kill-switch ✅
- **Built:** kill now tears down **three planes** per victim, cascading to all descendants:
  capability (passport revoked) + credential (`vault.revoke_for` scrubs leases) + **identity**
  (`vault.suspend_identity`). Base `Vault.suspend_identity` logs an `IDENTITY_SUSPENDED` event
  (simulated + labeled); `OnePasswordVault` overrides it with the **real 1Password Users-API
  `:suspend`** (when `OP_USERS_API_TOKEN`+`OP_ACCOUNT_ID`+`OP_USER_MAP` set), honestly noting that
  service-account *token* revoke is console-only. Monitor calls it best-effort (never blocks
  containment).
- **Verified:** new `tests/test_dualkill.py` → **3/3** (both planes fire; cascades to child; mock
  labeled simulated). Full suite: core 24/24 · redteam 22/22 · events 5/5 · dualkill 3/3.
- **Next:** I5 (Daytona linked-sandbox delegation tree) → I6 (dashboard audit+identity panel + the
  dual-plane kill beat + a 2nd relying-party rejecting a revoked passport) → I7 ("steal the passport"
  live PoP attack button) → I10 (SETUP_REAL refresh) → I11 (honesty pass).

## I5 — Daytona linked-sandbox delegation tree ✅
- **Built:** `sandbox_daytona.py` `create()` now passes `linked_sandbox=parent.id` (the real parent
  handle) in addition to `ephemeral=True` + passport labels — so the parent/child delegation tree is
  first-class IN Daytona (queryable; parent reap can cascade to linked children). Mock unaffected.
- **Verified:** compiles; mock SandboxManager still default; gates green. Confirmed the **dual-plane
  kill now surfaces in dashboard runs** (ledger feed contains IDENTITY_SUSPENDED + SANDBOX_KILLED +
  REVOKED on a kill).

## I7 — "Steal the passport" + "Replay an action" live attack buttons ✅
- **Built:** new server `/attack?kind=steal|replay` runs a real proof-of-possession attack on the
  live engine and streams it; dashboard gets a "Try to break it:" row with two buttons + a result
  panel. **steal:** legit holder ALLOW → stolen passport with no key DENIED → forged-with-wrong-key
  DENIED. **replay:** signed action #1 ALLOW → same proof replayed DENIED (nonce reuse). Footer:
  "✓ Contained — inert without the holder's key. Ledger intact." (`server.py` run_attack + /attack
  route; `index.html` buttons + CSS + EventSource handler.)
- **Verified:** headless both kinds (steal → ALLOW/DENY/DENY; replay → ALLOW/ALLOW/DENY; intact);
  **live in preview** — clicked Steal → 3 rows + green Contained footer, **zero console errors**.
  Full suite still core 24/24 · redteam 22/22 · events 5/5 · dualkill 3/3.
- **Next:** I6 (dashboard 1Password-Events audit panel beside the ledger + a 2nd relying-party
  rejecting a revoked passport) → I10 (SETUP_REAL refresh) → I11 (honesty pass).

## I6a — Instant-revocation clincher: 2nd relying party rejects a revoked passport ✅
- **Built:** `/attack?kind=revoke` on the real engine + a third "⛔ Revoke (2nd party rejects)"
  button. Flow: legit agent acts (ALLOW) → **Relying party A** verifies the passport (ALLOW) →
  kill-switch (KILL, cascades capability+credential+identity) → **Relying party B** independently
  re-verifies the SAME passport → **DENIED**. Footer: *"Instant revocation … rejected the moment the
  kill-switch fires. No token-expiry wait."* This is the demo's emotional peak + the field's weak
  point (OAuth/Auth0 can't kill a live token instantly). Fixed a branch bug (steal `else` → `elif`)
  so revoke runs clean.
- **Verified:** headless all 3 kinds clean (steal ALLOW/DENY/DENY · replay ALLOW/ALLOW/DENY · revoke
  ALLOW/ALLOW/KILL/DENY, intact); **live in preview** — clicked Revoke → 4 rows + green footer,
  **zero console errors**. Gates: core 24/24 · redteam 22/22 · events 5/5 · dualkill 3/3.

## I10 — SETUP_REAL.md refreshed (exact env + real-vs-mock matrix) ✅
- **Built:** rewrote `SETUP_REAL.md` with key-by-key setup (OP_SERVICE_ACCOUNT_TOKEN + onepassword-sdk,
  OP_EVENTS_TOKEN, OP_USERS_API_TOKEN+OP_ACCOUNT_ID+OP_USER_MAP, DAYTONA_API_KEY+ALLOW_REAL_SANDBOX_KILL)
  and a **real-vs-mock matrix** stating exactly what's live with keys vs simulated+labeled by default
  (itemusages always simulated; service-account token revoke console-only; capability+credential kill
  always real). "Never made real: money movement / credential egress."
- **Next:** I6b — dashboard 1Password-Events **audit panel** beside the hash-chained ledger
  (`onepassword_events.recent_events()`, simulated/real labeled) → I11 honesty pass (audit every UI
  element is labeled) → final summary.

## I6b — Dashboard "Audit + identity" panel (1Password Events beside the ledger) ✅
- **Built:** new `/audit` JSON endpoint (server) → `onepassword_events.recent_events()`; a new
  dashboard panel "Audit + identity · 1Password Events" renders each event (kind · actor · detail)
  with a **simulated/real tag** per row + an `events_mode()` badge ("simulated · no OP_EVENTS_TOKEN"
  vs "real+simulated"), plus a note that signinattempts/auditevents are real with a token while
  itemusages are always simulated. Loads on page-load and after each run.
- **Verified:** `/audit` returns labeled JSON; **live in preview** — badge + 4 rows all tagged
  `simulated`, **zero console errors**. Gates green.

## I11 — Honesty pass ✅
- **Built/checked:** every mocked/simulated surface is now explicitly labeled — header pills
  `credentials · mock` / `sandbox · mock`, audit badge + per-row simulated tags, itemusages always
  simulated, identity-plane simulated without keys, service-account revoke console-only (in
  SETUP_REAL + suspend note). Fixed a terminology inconsistency: the rail's initial-paint labels
  still said **"Kill"** while the engine uses the humanized **"Booking stopped" / "Buying stopped"** —
  aligned the client `SCENARIOS` map to match (no "kill" language left in the user-facing rail).
- **Verified:** rail now reads "Booking stopped"; film autoplaying; audit panel populated; zero
  console errors. Full suite green.
- **Status:** backlog I1–I11 complete. Stretch next: I12 (AP2/MCP-auth interop bridge note) + a
  route-level smoke test, then the FINAL SUMMARY as the ~4h window closes (~15:21).

## I12 — Interop note + route smoke test + demo polish ✅
- **Built:** (a) `WHY_WE_WIN.md` "Interop — we wrap the ecosystem" section: a passport wraps an **AP2**
  mandate (reusing `cnf`/RFC 9449 PoP), slots in as an **MCP authorization extension** (filling MCP's
  named revocation gap), and layers on **SPIFFE** identity — complementary, not competitive ("BYO
  identity/payments/tools — the passport makes them scoped, provable, killable"). (b) New
  `tests/test_routes.py` — exercises all 8 scenario combos (kill + sealed-intact + **no secret leak**),
  branch-only containment, and all three /attack flows (steal ALLOW/DENY/DENY · replay ALLOW/ALLOW/DENY
  · revoke ALLOW/ALLOW/KILL/DENY) + the audit feed labeling. (c) `DEMO_SCRIPT.md` stage-craft now
  points judges at the live 🪪/♻/⛔ buttons + the audit panel.
- **Verified:** **routes 6/6**; full suite core 24/24 · redteam 22/22 · events 5/5 · dualkill 3/3 ·
  routes 6/6. Mobile checked in preview — attack buttons wrap, audit panel + hero film fit 375px.
- **Status:** planned backlog **I1–I12 COMPLETE**. Demo is competition-ready. Relaxing the loop
  cadence to periodic polish; FINAL SUMMARY to be written as the ~4h window closes (~15:21).

## UX1 — Investor-grade landing-page redesign (comprehensive UX audit) ✅
- **Researched** world-class dev-infra/AI landing pages (Evil Martians 100-devtool study, YC landing
  formula, live hero copy from Stripe/Linear/WorkOS/Clerk/Modal/Resend/Aembit/Descope) → a 10-criterion
  scorecard. Audited the Passport page as a YC partner: scored **10.5/30 (prototype)** — great demo,
  but read as a dev console: no hook, no value prop, no primary CTA, no close.
- **Redesigned** into a landing page (matches the proven conversion order): hero eyebrow + brand H1 +
  outcome/control subhead + **dual CTA** (See it live / Get early access) + **"Built on 1Password +
  Daytona" trust strip**; a **"Live proof" caption** framing the demo; a **3-step "How it works"**;
  a **"Why not just OAuth?"** 4-card differentiation block; and a **closing pitch + CTA** ("Every agent
  should carry a passport"). Hero/closer CTAs wired to the live demo (scroll + run).
- **Re-scored 27/30 (investor-grade).** Deliverable: `UX_AUDIT.md` (scorecard before/after, findings,
  changes, remaining recs: real early-access form, a named design-partner quote, GitHub/Docs links,
  optional dark-mode variant, OG image).
- **Verified:** live in preview (hero + all new sections render), **zero console errors**, mobile
  stacks cleanly; HTML well-formed; gates still core 24/24 · redteam 22/22 · events 5/5 · dualkill 3/3
  · routes 6/6. Local-only, no push.

## UX2 — README front-door (doc index) ✅  [13:06]
- **Built:** prepended a "▶ Start here — 60-second demo + doc index" block to `README.md` (how to run
  → 8765; the 3 demo moments: run scenario · steal/replay/revoke · audit panel; live-vs-mock note) and
  a one-line index to PLAN / DEMO_SCRIPT / WHY_WE_WIN / THREAT_MODEL / SETUP_REAL / UX_AUDIT / LOG +
  the test commands — the front door for a judge or Codex. Did not clobber the existing README body.
- **Verified:** doc-only; gates still core 24/24 · redteam 22/22 · events 5/5 · dualkill 3/3 · routes 6/6.
- **Holding — demo-ready.** Backlog I1–I12 + UX1–UX2 complete. Next tick: final summary near ~15:21.

## 3D1 — Multi-agent collaboration in 3D (Travel concierge)  — user request
- **Built:** a real-time **Three.js** scene on the Passport page (`dashboard/index.html`) — a taller
  **Concierge** orchestrator delegates a scoped passport to **six humanoid vendor agents** in a ring
  (Airline · Hotel · Transport · Payments · Connectivity · Activity·EG). A glowing passport token
  travels desk→agent each beat; the agent raises its arms (does the task) and a green ✓ + green label
  confirm the booking. **Five complete.** The sixth (foreign **Activity** agent) reads a poisoned tour
  confirmation, **lunges for the passport** (out of scope) → red **kill-ring** pulse → it **dims to grey,
  collapses, and gets a red ✕** ("Access revoked instantly — and only this branch dies"). Resolution
  beat holds ~8s: *"5 of 6 booked. One agent stopped, the trip stands."* Cinematic auto-orbit camera,
  ACES tone-mapping, soft shadows, depth fog, billboard CanvasTexture labels + ✓/✕ marks, live tally
  chips ("5 booked / 1 stopped") + synced caption strip. 27s deterministic loop.
- **Tooling note:** "Gemma" is an LLM, not a 3D engine — used real-time Three.js (deterministic,
  reproducible, no generative artifacts), consistent with our "engine is the source of truth" ethos.
- **Offline/local:** vendored `three.module.js` (r160, 1.27MB) into `dashboard/`; added `"js"` to the
  static MIME map in `server.py` (root-only, no subdirs → no path traversal) + an importmap in the page.
- **Robustness:** rAF when visible, `setTimeout(80)` fallback when the tab is hidden (THREE.Clock keeps
  wall-time → seamless resume on refocus); reduced-motion renders a static final frame; WebGL-absent
  shows a graceful fallback line.
- **Verified live (8765):** scene mounts (canvas 1070×540, WebGL OK), timeline advances 0→5 booked then
  1 stopped and loops, failure caption flips red, **zero console errors**; desktop + mobile (375px, no
  overflow, scene renders) screenshots captured. Gates still green: core 24/24 · redteam 22/22 ·
  events 5/5 · dualkill 3/3 · routes 6/6. Local-only (agent-passport/ untracked).

- **Holding — demo-ready** (13:37). 3D1 shipped + verified this tick; gates green. No further polish warranted; window closes ~15:21 → next tick writes the FINAL SUMMARY.

## EMAIL1 — The deliverable: post-run summary email (Travel concierge)  — /goal request
- **Built:** a world-class, self-contained **summary-email artifact** on the Passport page
  (`dashboard/index.html`), placed right after the 3D scene so the arc reads **process (3D) →
  deliverable (email) → try-it (live demo)**. Styled as a real transactional email (mac window chrome,
  subject, from/to meta, blue 90%-booked summary band) using the page's warm-paper tokens.
- **Content (exactly to spec):** subject **"Trip to Egypt — Your personalized agent booking"**,
  6 agents dispatched · 5 booked · 1 needs you · **$6,184.50 total**. Per-agent rows, each with the
  scoped credential it used (ties every line back to the passport story):
  (1) **Airline** EgyptAir JFK⇄CAI + itinerary/manage links; (2) **Hotel** Marriott Mena House, Bonvoy
  points (no card) + reservation links; (3) **Transport** two bookings — **Uber Reserve** + **AVIS** —
  each linked; (4) **Payments** Chase ••4827 one-time virtual card, **overall (not itemized) total
  $6,184.50**; (5) **Connectivity** Verizon TravelPass + Airalo eSIM, intl roaming, IMEI-scoped;
  (6) **Activity** — **5 experiences listed individually** (Pyramids/Sphinx, Nile cruise, Grand Egyptian
  Museum, Abu Simbel — all ✓ Booked; **White Desert safari ✕ Stopped**) with a plain-English reason
  block (poisoned confirmation → tried to exfiltrate passport+card → out of scope → access revoked,
  hold rolled back, nothing shared/charged) + three fix CTAs (Rebook with a fresh scoped agent · Book
  it myself · See the ledger entry). Footer seal: tamper-evident ledger 48 entries · chain verified ✓ ·
  *"Permission ≠ intent. Access ≠ trust."*
- **Research:** grounded in real patterns — TripIt-style consolidation (N confirmations → one master
  itinerary), Stripe/Resend transactional minimalism, Airbnb "show it then act," mobile-first
  (WebSearch: reallygoodemails/Stripe receipts, travel-confirmation best practices).
- **Also fixed:** stray `var(--ok)` (undefined) in the 3D tally CSS → `var(--allow)`.
- **Verified live (8765):** 6 rows + 5 activities + fail block + correct subject/total all present;
  **zero console errors**; desktop + mobile (375px, no overflow) screenshots captured. Gates green:
  core 24/24 · redteam 22/22 · events 5/5 · dualkill 3/3 · routes 6/6. Local-only (agent-passport/ untracked).

- **Holding — demo-ready** (14:03). EMAIL1 shipped + verified this tick (desktop+mobile, zero console errors); gates green. No further polish warranted; window closes ~15:21 → next tick writes the FINAL SUMMARY.
- **Holding — demo-ready** (14:29). No high-value polish outstanding; gates green; window closes ~15:21 → next tick writes the FINAL SUMMARY.

---

# ★ FINAL SUMMARY — Passport · AGI House build window (2026-06-24, ~11:21 → 14:55)

**Passport — the identity, scoped-authorization, and kill-switch layer for multi-agent systems.**
Local-only, zero-dependency (Python 3.9 stdlib; Ed25519 if `cryptography` present, HMAC-SHA256 otherwise).
The loop ran to completion; this is the closing record. **The autonomous loop ends here — no further wakeup.**

## What got built (chronological)
- **I1–I12 (engine + dashboard hardening):** real signed/attenuating passports; proof-of-possession +
  anti-replay nonces; reference monitor with complete mediation; **dual-plane cascading kill-switch**
  (capability revoke + credential lease scrub + identity `:suspend`); hash-chained tamper-evident ledger;
  parameterized scenario engine — Travel concierge + Procurement buyer × single↔multi-agent (A2A) ×
  domestic↔international; three live **break-it** attacks (🪪 Steal · ♻ Replay · ⛔ Revoke-2nd-party);
  **Audit + identity** panel (1Password Events beside our ledger); humanized copy ("Booking stopped"),
  run summary, numbered phase dividers, color-coded triad.
- **UX1 — investor-grade landing redesign:** hero (eyebrow "The trust layer for AI agents" + outcome
  subhead + dual CTA + trust strip) → problem/why-now band → live proof → how-it-works (3 steps) →
  "Why not just OAuth?" (4 differentiators) → close. Scorecard 10.5/30 → **27/30**.
- **UX2 — README front-door:** "▶ Start here" (run cmd → :8765, the 3 demo moments, live-vs-mock note,
  one-line doc index + test commands).
- **3D1 — Travel-concierge multi-agent 3D scene** (real-time Three.js, vendored offline): a Concierge
  orchestrator delegates scoped passports to **six humanoid vendor agents** in a ring; five complete
  (green ✓), the foreign **Activity** agent is hijacked → red kill-ring → dims/collapses → red ✕
  ("Access revoked — only this branch dies"). Cinematic auto-orbit, ACES, soft shadows, 27s loop,
  visibility-resilient (rAF→timer fallback), reduced-motion + WebGL-absent fallbacks.
- **EMAIL1 — the deliverable artifact:** a transactional summary email ("Trip to Egypt — Your
  personalized agent booking") accounting for all 6 agents with the scoped credential each used;
  Activity agent lists all 5 experiences (4 booked, 1 stopped with plain-English reasoning + 3 fix
  CTAs); footer seal (ledger 48 entries, chain verified ✓; "Permission ≠ intent. Access ≠ trust").
  Narrative arc now: **process (3D) → deliverable (email) → try-it (live demo)**.

## Gate results (final, PACE=0)
`test_core` **24/24** · `test_redteam` **22/22** contained · `test_events` **5/5** ·
`test_dualkill` **3/3** · `test_routes` **6/6**. Server live on :8765 (HTTP 200). Zero console errors;
desktop + mobile (375px) verified.

## Real-vs-mock matrix (be honest on stage)
- **Real now, no keys:** signed/attenuating passports, PoP + anti-replay, reference monitor, the
  **cascading kill-switch**, the hash-chained ledger, the whole scenario engine, the 3D scene, the email artifact.
- **Real with keys (flip at the event):** 1Password JIT `secrets.resolve` (Service Account), Daytona
  ephemeral + linked sandboxes, 1P Events-API audit trail, Users-API `:suspend` (identity-plane kill).
- **Honestly mocked + labeled:** per-fetch `itemusages` events (service accounts don't emit them);
  service-account *token* revocation is console-only (we kill the user + the capability). The email
  artifact is a representative deliverable mockup (links are anchors).

## What's left for when 1Password / Daytona keys arrive
1. Set `OP_SERVICE_ACCOUNT_TOKEN` (+ optional `OP_EVENTS_TOKEN`, `OP_USERS_API_TOKEN`+`OP_ACCOUNT_ID`+
   `OP_USER_MAP`) → JIT `op://` resolve + real Events/Users-API kill flip from simulated to real (see SETUP_REAL.md).
2. Set Daytona key → real ephemeral linked sandboxes + cascade reap (sandbox_daytona.py already wired).
3. Optional next UX (27→30): real waitlist form (replace mailto), one named design-partner/advisor quote
   or honest traction number, header GitHub/Docs links, OG image from the hero/3D, optional dark variant.
4. Optional: wire EMAIL1 to render from the *actual* live-run results (currently a faithful static artifact).

## Demo-day checklist
- [ ] `cd agent-passport && python3 dashboard/server.py` → open http://localhost:8765 (PACE=0.6 default; PACE=0 instant).
- [ ] Hero → scroll: 3D scene autoplays (six agents, one stopped) → the summary email → live demo.
- [ ] Travel · multi-agent · international → **Run simulation** (hijacked Activity contained branch-only).
- [ ] Let a judge break it: 🪪 Steal → DENIED · ♻ Replay → DENIED · ⛔ Revoke → 2nd party rejects instantly.
- [ ] Audit + identity panel (two independent planes). Contrast single-agent (one identity = whole keychain dies).
- [ ] Backup screen-recording ready; stats hygiene (82:1 = CyberArk; EchoLeak 9.3 per Microsoft; no "Cloudflare macaroons").
- [ ] One-liner: "Passports for AI agents — least-privilege credentials you can kill in one click, with a
      black-box flight recorder for every action. On 1Password and Daytona."

**Status: COMPLETE — competition-ready. Loop closed 14:55. Local-only; agent-passport/ untracked (no push/deploy).**
