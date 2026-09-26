# Origin — Design Principles (standing; apply by default, don't re-ask)

> **This file was rewritten on 2026-08-20.** The previous version described a product that no
> longer exists: it told you Origin was "robot readiness", that the funnel ended in a "readiness
> license", and that the background was `--bg #f6f8fc`. All three contradicted
> [CLAUDE.md](CLAUDE.md) — which explicitly forbids the readiness-license framing — and the live
> site, whose H1 then read *"Get your agent through security review, and prove what it did."*
> A design doc that disagrees with the shipped site is worse than no design doc: it hands the next
> pass a confident, wrong brief. Verify against `public/home.css` and the live pages before trusting
> anything below.

Target: frontier-lab quality. Audience: security reviewers and procurement at companies deploying
high-consequence agents — plus investors reading over their shoulder. Assume a hostile, fast read.

## Product framing
- **Origin is the evidence layer for high-consequence AI agents.** A deterministic,
  configuration-bound **reference check** exports session-signed evidence that a reviewer
  re-verifies offline. Public browser evidence is UNTRUSTED by default (its signer is unpinned); a
  changed bound field returns VOID.
- The funnel is: **describe the agent → run the reference check → get an attestation → re-verify it
  offline.** Not a site upload, not a license.
- **Physical AI (robots, fleets, spatial) is the Labs arc** — proof that the same evidence contract
  generalizes. It is never the headline and never the current product.
- Never write "certification" affirmatively, and never call an attestation a certificate. The
  customer's gate decides; Origin's checks produce evidence. `scripts/honesty-lint.mjs` enforces this.

## Anthropic frontend principles
- **Restraint.** One idea per screen; cut the second headline. Collapse depth behind disclosure.
- **One primary action per viewport.** The header rule is already pinned by
  `tests/e2e/investor-ready.spec.ts` — exactly one visible header CTA at every viewport. The rest of
  the page should inherit that discipline, not compete with it.
- **One signature moment per surface**, everything else calm and supporting.
- **The app is bright.** `--paper #f8f7f4`. Dark panels (`--graphite`) are a beat, never the ground.
- **The finish / escalate / refuse triad is the visual through-line** — `--verify` / `--warn` /
  `--danger`, coloured consistently at every step.
- **Reuse > invent.** New components render *process*; they never re-derive scores.

## Honesty (hard rule)
- **"Measured" = a real, oracle-scored run only.** Anything projected or illustrative is labeled
  **"projected"**. Never present a projection as measured. Never fabricate a metric.
- Synthetic demo data is labeled synthetic, on the surface where it renders.
- Results are **"reproducible under this verifier,"** never "safe" or "correct."
- State boundaries plainly. The hero's maturity line (*"Explore the working prototype. Not
  production SaaS or compliance certification. Evaluate a selected policy in your browser using
  synthetic scenarios. Origin does not contact or execute your named agent. Browser evidence is
  untrusted by default."*) is **pinned by `tests/e2e/investor-ready.spec.ts`** (the two
  `.hero__status` assertions in the first test) and by the `index.html` launch contract in
  `scripts/honesty-lint.mjs`, and **must stay visible in the hero** — treat it typographically,
  never by moving or softening it.

## Type
- **One system stack, no web font.** `--font-sans` and `--font-display` are the same stack:
  `'Avenir Next', Avenir, system-ui, -apple-system, 'Segoe UI', sans-serif` (`public/home.css`).
  No `@font-face` ships, so Apple devices render Avenir Next and Windows/Android fall back to their
  system UI face. Display and body differ by size, weight and tracking, not by family.
- **Only name families that load.** Inter and Space Grotesk are not loaded; a literal
  `'Space Grotesk'` in a page `<style>` silently renders the fallback. Use `var(--font-sans)` or
  `var(--font-display)`.
- The scale is a deliberate ladder: `--fs-11 … --fs-22` plus the display clamps. Extend it with a
  documented reason; don't add one-off sizes.
- Body measure stays at or under ~65ch (`.section__lede` is 62ch).

## Color & contrast
- **Measure, don't eyeball.** Body ≥ 4.5:1; large text and UI/focus indicators ≥ 3:1.
- **Passing is not the target.** A page where every tone sits at 4.5–5.0:1 reads grey and tires the
  reader even though nothing fails. Keep secondary and muted tones comfortably clear of the line.
- Three text tones is the budget, measured on `--paper`: `--ink` (13.2:1) · `--ink-soft` (6.7:1) ·
  `--steel` (5.7:1).
- **One accent**, spent on the primary action and brand moments — not on every icon and border.

## Motion
- Purpose must be nameable: feedback, spatial consistency, state indication, explanation.
- **No ambient infinite animation.** Constant motion is reserved for a genuine ongoing process. On a
  product whose claim is determinism, decorative pulsing is self-refuting.
- **Values a reader must trust are the stillest things on the page** — digests, verdicts, metrics,
  timestamps. A rolling digest reads as generated-for-show.
- `prefers-reduced-motion` ships with the motion, per-element, keeping opacity. Never the global
  `animation: none` sledgehammer.

## Tokens (don't introduce a new palette)
Defined once, in the `public/home.css` `:root`:
`--paper #f8f7f4` · `--paper-2 #fff` · `--paper-3 #edf1e7` · `--graphite #202e25` · `--ink #272d26` ·
`--ink-soft #4e5b48` · `--steel #59664f` · `--line #dfe4d8` · `--line-2 #c9d2c2` ·
`--signal #2b523b` (also `--signal-ink`) · `--signal-wash #e7eedf` · `--signal-hover #203f2d` ·
`--verify #0f7a57` · `--warn #8a5800` · `--danger #b23a30` · type ladder `--fs-11 … --fs-22` ·
radii `--radius` 22px / `--radius-sm` 10px · one system font stack (see Type).
Product workspaces (`src/shared/product-workspace.css`) define no tokens of their own and reference
these (a few one-off tints remain as literals). Console surfaces (`src/App.css`) keep their own
`:root` names (`--bg`, `--panel`, `--text`, `--accent`, `--con-*`) with values close to these;
`/proving-ground` loads both, and `product-workspace.css` maps the console names onto these tokens
inside `.pg-wrap`.

## Gates that will catch you
- `npm run css:version` — editing `public/home.css` **requires** a `?v=` bump across every HTML
  entry that references it. Use `npm run css:version:fix`. An unbumped edit once shipped new HTML
  against cached CSS and produced two header CTAs.
- `node ../../scripts/honesty-lint.mjs` — banned overclaims + required disclaimers, over page prose
  **and** meta/title.
- `npm run reachability` — orphaned-module ceiling.
- `npx playwright test` — the full e2e suite, run in a desktop (1280×720) and a mobile (390×844)
  project, including axe WCAG 2 A/AA.

## Verify-before-done (every change)
`npm run gates` ✅ + honesty-lint ✅ + `npx playwright test` ✅ → live on localhost (desktop + 375px,
zero console errors) → secret-scan → user inspects → push → deploy.
**Push, deploy, and model spend need explicit confirmation, per deploy.**
