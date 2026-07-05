# Origin — agent-evidence iteration changelog

**Date:** 2026-07-04 · **Branch:** hud-factorydad-1 (production) · **Positioning:** the evidence layer for AI agents.

This pass took the already-repositioned site from "coherent copy" to "coherent copy **with a real, verifiable evidence artifact** and a genuinely interactive product surface," and cleaned out the last of the dead robot subsystem.

---

## Iteration 2 (2026-07-04) — proof precision, claim safety, domain/contact readiness, conversion trust

**P0**
- **/brief overclaim fixed** — "get one blocked agent workflow through review — and hand you the evidence package that does it" → the mapped, non-guaranteeing offer copy.
- **/proof stale TR-A001 line fixed** — no longer says TR-A002 is "forthcoming"; now "TR-A001 is authored … the machine-emitted sandbox trace is TR-A002, now available; TR-A003 forthcoming when earned."
- **/app scenario proof-specificity** — the Refund scenario links to TR-A002 as its *exact* machine-emitted mirror; Production change + PII export now read "This scenario is **simulated** — TR-A002 shows the same pattern on the refund workflow." Head badges: "Machine-emitted trace available" (refund) vs "Simulated · same evidence pattern" (others).
- **/auth value sentence** restored: "Invited teams use the Console to review policy verdicts, approvals, proxy events, blocked actions, and evidence packages" (+ noscript).
- **Clean-domain migration is now code-configurable** — a `siteUrlRewrite` Vite plugin (`vite.config.ts`) rewrites canonical/OG/llms/sitemap/robots + the contact email across the whole dist from `SITE_URL`/`CONTACT_EMAIL` env; default = byte-identical no-op. Verified: `SITE_URL=… npm run build` leaves zero stale host in dist. Owner runbook: `docs/domain-and-inbox-cutover.md`.
- **Overclaim + stale-identity sweeps** clean across the funnel + client source.
- **Live bug caught + fixed (the big one):** the lead-form submit handler was dropping every qualification field (agent, what-it-touches, blocker, sign-off, workaround, urgency) and still referenced a stale robot-era `floor` field — in the client body, the mailto fallback, AND the server (`functions/api/lead.ts`). And the modal's `INTENT_COPY` had **no** entry for the live `review`/`blocker` intents, so it fell back to "**Book a floor demo · tell us about your floor and robots**" — stale robot copy showing on every "Book an Agent Evidence Review" click. All rewritten to agent-evidence; the form now sends the full qualification payload + CRM context (cta_source, role_path, page_path, opened_at).

**P1**
- **/proof "verify this artifact" module** — added a copy-command button + a plain-English explainer ("the published JSON commits each event to the next; the final digest commits the entire run; change any byte and re-verification fails") on top of the existing digest / event-count / JSON-download / `npm run proof:verify`.
- **Lead form → CRM readiness** — hidden context fields (role_path, page_path, opened_at) populate on open; full field set documented in `docs/lead-crm-fields.md`.
- **/brief** already carried the version/date, print styles, shortlink, and "Send this to your security or platform lead" line — verified.
- `docs/customer-proof-update-playbook.md` — how to publish TR-A003 / a design-partner quote when earned, without overclaiming.

**P2**
- `docs/discovery-tracker.md` verified/enhanced (11-column internal tracker).
- Mobile re-checked at 375px: no horizontal scroll on / , /proof (JSON excerpt scrolls internally), or /app (scenario switcher usable).

**Validation:** `npm run gates` green (build · lint · verify:evidence 40/40 · proof:verify · vitest 279/279); real-browser Playwright QA of the verify module, the (fixed) lead modal + hidden fields, the /app switcher + badges, and mobile.

---

## Iteration 1 (2026-07-04)

## P0 — must-do

### 1. TR-A002 — a real machine-emitted sandbox trace (the headline)
- New deterministic emitter `scripts/generate-tr-a002.mjs`: builds a 12-event agent-evidence trace for the payments-ops refund workflow (proposal → policy verdict → proxy hold → approval → sandbox execution → action recorded → over-scope retry → deny → **blocked** → digest sealed) and commits every event to a **real SHA-256 hash chain** (each `event_hash` = SHA-256 of the event's canonical JSON + the previous hash; the sealing event's hash **is** the final digest).
- New verifier `scripts/verify-tr-a002.mjs` + `npm run proof:verify`: independently re-derives the chain and fails if any byte changed (verified: a tamper test flipping one amount makes it exit non-zero).
- Artifacts published at `public/proof/tr-a002.json` (full 12-event trace) + `tr-a002-summary.json`. Final digest: `ca1d4690206e4dcf3d654b907d02d2bccf9bcdc16ddc555071fec21874578b32`.
- `proof:verify` added to the `gates` script. Deterministic pseudo-timestamps → the published digest is reproducible.
- **Honesty:** the artifact's own `label` says it is machine-emitted over a SIMULATED, SANDBOXED workflow — not a customer deployment, not production, not a performance claim, no live money.

### 2. /proof rebuilt around the real TR-A002
- TR-A002 promoted from "in progress" to **available now**: executive card, the 12-event flow (policy-state coloured, red at the block), the full digest, verbatim JSON excerpt (first + sealing event with real hashes), download links, the `npm run proof:verify` command, and a "what it shows / does not show" pair. TR-A001 stays the authored specimen; TR-A003 stays "when earned."

### 3. Overclaim + coherence sweep
- Homepage fixes: "Origin **owns** the approval path" → "**focuses on** the approval path"; metrics north-star softened to "prepared for security review … approved only when the customer's reviewer accepts the risk"; the prooftwo "loop working end to end in a sandbox" reframed (the machine-emitted version is now TR-A002); TR-A002 evidence card promoted to available.
- Site-wide: `public/404.html` ("This floor isn't on the map" → "This page isn't in the record"; title de-robot'd) and `public/robots.txt` comment updated to the agent-evidence tagline.
- Full-repo grep sweep: zero forbidden robot/physical-AI product language across the funnel (/, /app, /proof, /trust, /brief, /auth, /llms.txt, /legal); zero overclaim outside the honest "we say X, not Y" contrast.
- Removed **stale robot evidence artifacts** `public/evidence/trace-00{1,2}-audit.json` + the dead `scripts/recordTrace002.mjs` recorder (they still shipped robot content in dist).

## P1

### 4. /app — 3-scenario Evidence Console
- Scenario switcher (accessible `role=tablist`, arrow-key + click): **Refund exception** / **Production change** / **PII export**. Each drives the full panel set (proposal queue → verdict → proxy → approval → side-effect log → **blocked over-scope action, in red** → hash-chain audit → evidence export). Progressive enhancement: all three scenarios are readable stacked with JS off; the inline script shows one at a time when JS runs. Simulated/sandbox labels + honest footer retained.

### 5. 90-second demo — a product moment
- Each of the 8 steps now carries a concrete monospace "console readout" (e.g. `payments.refund · $480.00 → order_8842 · HELD`) in policy-state colours; the block step is the unmistakable red climax (`$920.00 · over $500 ceiling · BLOCKED & RECORDED`) and links to the real TR-A002.

### 6. /trust, /brief, /auth
- /trust: status-labeled cards (Available now / Pilot-specific / By request / Not finalized) across data, telemetry, retention, access, encryption, audit, incident, responsibility split, and a security packet (DPA/subprocessors/retention/checklist/incident-contact) — no SOC 2 / ISO / certification claims.
- /brief: version+date, print stylesheet, evidence-package diagram, "Not ready if" list, TR ladder with TR-A002 now machine-emitted, a plain-text shortlink (no fake QR).
- /auth: invite-only private-pilot copy tightened; CTA "Book an Agent Evidence Review."
- llms.txt + legal: TR-A002 described as available/machine-emitted; "selected customers" → "selected pilot participants or design partners."

### 7. Mobile
- Fixed a horizontal-scroll bug at phone widths: the long header CTA button is hidden ≤700px (the sticky bottom CTA + burger cover conversion), and `min-width:0` on the hero grid items + `overflow-x:clip` on the body remove the residual overflow. Verified zero horizontal scroll at 375px.

## P2

- `docs/discovery-tracker.md`: internal (non-published) customer-discovery template — 11-column table + example rows, a discovery-call checklist tied to the lead-form fields, a "real signal" definition, and a do-not-publish reminder.
- Removed the **orphaned old-robot React console** subtree (`src/main.tsx`, `src/App.tsx`, `src/components/RuntimeConsole.tsx`, `src/auditTrace.ts` + its test) — dead code no HTML entry loaded, now that /app is static.
- Rewrote the stale e2e `tests/e2e/smoke.spec.ts` to the new site, including an in-CI TR-A002 hash-chain integrity test.

## Validation
- `npm run gates` green: build (tsc + vite) · eslint · verify:evidence (40/40) · **proof:verify (TR-A002 chain)** · vitest (279/279).
- Real-browser (Playwright) QA: every funnel page has one h1, correct positioning, no robot language, no overclaim; /app scenario switch works; /proof shows the real digest; mobile has no horizontal scroll.

## Adversarial QA (8 skeptic agents) + fixes
- Ran an 8-agent skeptic audit of every funnel surface. index.html and brief.html came back clean; the rest surfaced findings.
- **Fixed:** auth copy incoherence — "Invited teams use the Console" (implied multi-user access) reconciled with the owner-gated reality ("The Console shows …"); "while we work with design partners" (implied existing partners) → "during the closed pilot" (AuthPage.tsx + auth.html). Reinforced "sandbox" on /app's TR-A002 references. Made legal noindex consistent (privacy now matches terms).
- **Not fixed — owner-ops, not code (see below):** the repeated "domain contains physical-ai" finding. `origin-physical-ai.pages.dev` is the live Cloudflare Pages hostname; canonical/OG tags correctly point to the real URL, and renaming would break the live site. This is a custom-domain migration, not a copy fix. No user-facing product copy says "Origin Physical AI" (grep-clean).
- **Rejected as false positives:** "review-ready" (the *approved* term per the honesty rules, not an overclaim), "/proof may not exist" (verified HTTP 200), "present-tense demo framing" (page is labeled private-pilot / simulated throughout).

## Known-open (founder/ops, not code)
- **Custom domain + brand hostname** — migrate off `origin-physical-ai.pages.dev` to a clean domain (e.g. an `origin*.` domain that doesn't read "physical"), and update canonical/OG/sitemap/robots + the `hello@` email to it. This is the single highest-value owner-ops cleanup; the skeptics flagged the hostname 6×.
- Real inbox/CRM for the `hello@` contact (placeholder only today).
- TR-A003 design-partner trace — when a design partner actually runs it.
- Separate noindex demo surfaces (/foundry, /soc, /passport, /clip, /rsi) keep their own robot/hackathon framing; they are not part of the agent-evidence funnel and are not linked from it. og:site_name on a few still reads "Origin Physical AI."
