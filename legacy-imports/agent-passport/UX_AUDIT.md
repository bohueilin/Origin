# Passport — Website UX Audit + Redesign (investor-grade)

Audited the live Passport page (localhost:8765) as a YC partner seeing it for the first time, against
a research-backed rubric (Evil Martians' 100-devtool study, the YC landing formula, and live hero copy
from Stripe/Linear/WorkOS/Clerk/Modal/Resend/Aembit/Descope). Then redesigned it from a *demo console*
into a *world-class landing page*. All changes verified live, zero console errors. Local-only.

## Scorecard (0–3 each; 28–30 = investor-grade)
| # | Criterion | Before | After |
|---|---|--:|--:|
| 1 | 5-second clarity (what + who + why, in the hero) | 1 | 3 |
| 2 | Outcome headline (result for an ICP, not a feature) | 1 | 2.5 |
| 3 | Single dominant CTA (one primary, ≤1 secondary) | 0 | 3 |
| 4 | Live proof, shown working (not a screenshot) | 3 | 3 |
| 5 | Trust strip ("Built on 1Password + Daytona") early | 1 | 3 |
| 6 | 3-step "how it works" | 0 | 3 |
| 7 | Differentiation/moat stated explicitly | 1.5 | 3 |
| 8 | Named social proof / honest traction | 0 | 1 |
| 9 | Decreasing density (loud hero, scannable rest) | 1 | 2.5 |
| 10 | Premium polish, one signature moment, not templated | 2 | 3 |
| | **Total** | **10.5 / 30** (prototype) | **27 / 30** (strong → investor-grade) |

## What was wrong (before)
- **No hook.** The page opened as a dev console: brand + 4 debug pills + a "Run scenario" button.
  The headline ("Trust that travels with the agent") is on-brand but doesn't say *what it is*; the
  subhead was a dense 5-line paragraph full of jargon (A2A/ADK). A YC partner couldn't answer
  "what is this + who's it for" in 5 seconds.
- **No conversion path.** No primary CTA, no "get access," no close. The page just… ended on a panel.
- **Demo-first with no framing.** The live demo (its strongest asset) wasn't introduced as *proof of
  a product* — it read as a tool.
- **Moat implicit.** The "why not just OAuth" argument lived only in docs, not on the page.

## What changed (the redesign — matches the research's proven conversion order)
1. **Hero rebuilt** → eyebrow "The trust layer for AI agents" (says what it is) + the brand H1 +
   a crisp **outcome+control subhead** ("signed, scoped, instantly-revocable… kill its access in one
   click… Not in 24 hours. Now.") + **dual CTA** (primary "See it live — 60-second demo" / secondary
   "Get early access") + a **trust strip** ("Built on 1Password + Daytona · Ed25519-signed ·
   proof-of-possession · instant cascading kill-switch · tamper-evident ledger").
2. **"Live proof" caption** above the demo — frames the console as proof of a product, not a tool
   ("Watch a hijacked agent get killed everywhere — in one click. This isn't a video.").
3. **"How it works · three steps"** — Issue a passport → Attenuate & verify (PoP) → Kill & audit.
4. **"Why not just OAuth scopes?"** differentiation block — 4 cards (attenuation that only narrows ·
   proof-of-possession · instant cascading kill · tamper-evident ledger), the moat stated explicitly.
5. **Closing pitch + CTA** — "Every agent should carry a passport." + dual CTA + the AGI House /
   1Password + Daytona badge. The single primary action (run the live demo) is repeated at the close.
6. Hero/closer CTAs wired to the live demo (smooth-scroll + run). Mobile verified (sections stack).

Final section arc: **Hero → Problem/why-now (landscape band) → Live proof (demo + 3 live attacks) →
How it works → Differentiation → Close.** Exactly the order top dev-infra pages converge on.

## On the brief's specifics
- **Video illustration / "3D animation":** the hero "60-second story" is a self-contained, autoplaying,
  looping motion-graphic film (the agent-economy mesh → narrowing passport → hijack + kill → seal); a
  "Watch the full film" link points to the Claude Design film. True **3D** lives in the sibling product
  (the Origin factory proving-ground, Three.js) — recommend keeping the Passport hero 2D (faster, on
  message); cross-link to the 3D proving ground rather than duplicating it here.
- **Passport story / multi-agent / cross-border:** the two scenarios (Travel concierge, Procurement
  buyer) across single↔multi-agent (A2A) and domestic↔international already tell the cross-border
  multi-agent story on the real engine; the new caption + how-it-works make it legible in seconds.

## Remaining recommendations (to push 27 → 30)
1. **Real early-access capture** — swap the placeholder `mailto:` for a waitlist form (Tally/Typeform)
   or a real address; add a friction-reducer micro-line ("Open source · no card").
2. **One named design-partner / advisor quote** (or honest traction: GitHub stars, waitlist count) —
   the only criterion still at 1/3. One real quote >> none.
3. **GitHub / Docs links** in the header (tertiary CTAs for the developer who wants depth).
4. **Consider a dark-mode variant** for the "premium/technical" read dev-infra buyers expect — optional;
   the warm-paper identity is already distinctive and not templated.
5. **OG/social image** = a still from the hero film, so shared links carry the signature moment.
6. **Header tidy** — the 4 mock pills can move beside the demo controls (where they're contextual),
   leaving the header as brand + one CTA.

Sources: Evil Martians "100 devtool landing pages (2025)"; VC Corner "YC landing page formula";
live hero copy from WorkOS/Modal/Resend/Clerk/Linear/Stripe/Aembit/Descope.
