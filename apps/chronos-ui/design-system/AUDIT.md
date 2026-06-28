# Compliance audit — Granola-style design system

**Method:** 4 parallel adversarial auditors, each checking one dimension of `design-system/` against the source-of-truth extraction (`granola-extraction.md`, `/tmp/granola/tokens-raw.json`, `/tmp/granola/anim-raw.json`) and the rendered gallery screenshots (`/tmp/design-system/*.png`). Findings were then fixed and re-verified. **Date:** 2026-06-20.

## Result: ✅ COMPLIANT (all findings resolved)

The **token layer is pixel-faithful** to granola.ai — color, typography, spacing, radius, and motion values showed **zero drift** across `tokens.css`, `tailwind-preset.js`, and `tokens.json`. All issues were in the example markup and have been fixed.

## Auditor 1 — Color fidelity → PASS (0 blockers)
- Every hex (neutral 50–950, green 50–600 + bright, red ramp, semantic surfaces/ink, `hairline #47432a33`, `stroke`, `border #e3e3e3`, `fill-accent #5b6f00`, `fill-accent-hover #4c5616`, `accent #94f27f`, `accent-text #0d7916`, `danger #e95d3d`, tints) matches Granola's shipped `--color-oats-*` values exactly.
- `tokens.css` / `tailwind-preset.js` / `tokens.json` are mutually consistent (identical hex multisets).
- `examples/index.html` applies all color via token utilities — no raw hex in markup/inline styles (hex appears only in the token-definition config block and as swatch text labels).
- Notes (intentional, not violations): `ring` maps to Granola's `--oats-border-focus`; the dark Enterprise card's "Talk to sales" uses bright `accent` as an inverse-context button while the primary action fill remains `#5b6f00`.

## Auditor 2 — Typography / spacing / radius / shadow → 1 fixed
- PASS: font stacks (serif display + grotesque-sans body roles), full type scale + confirmed line-heights/letter-spacings, `book 430` weight applied to the primary pill CTA, 4px spacing scale, radius (pill marketing CTAs vs `rounded-lg` in-app), restrained shadows.
- **FIXED [low]:** `text-7xl` line-height was `0.95`; extraction confirms `--text-7xl--line-height: 1`. → set to `1.0` in `tailwind-preset.js` and the gallery's inline mirror.

## Auditor 3 — Motion / interaction → values PASS; a11y fixed
- PASS: keyframes (`fade-in-up`, `dropdown-show`/`content-show`, `accordion`) and easing curves (`ease-out-expo cubic-bezier(.16,1,.3,1)`, default `(.4,0,.2,1)`, `ease-out (0,0,.2,1)`) and durations (150ms / 0.6s / 0.15s / 0.2s) match the raw capture exactly in both `tokens.css` and the preset. `prefers-reduced-motion` honored. Hover fills use `-hover` tokens.
- **FIXED [high/med]:** focus rings were missing on nav links, nav Download button, in-card "Generate notes" & "Talk to sales", dropdown menu items, accordion triggers, and the footer link. → added `focus-visible:ring-2 ring-ring` (with inset/offset variants where appropriate) to all. Re-verified: **0 of 25 interactive elements** lack a visible focus indicator (disabled excluded).

## Auditor 4 — Token discipline / accessibility → 2 fixed
- PASS: `lint-design.sh` reports 0 violations (exit 0); no arbitrary-value brackets or raw hex used as styling; all controls have accessible names; decorative SVGs `aria-hidden`; disabled button marked `disabled`; button shapes follow the pill-vs-`rounded-lg` convention.
- Contrast table (WCAG): `ink-primary` on white 14.55:1 ✓, on surface 13.54:1 ✓; `ink-inverse` on green button 5.49:1 ✓; on dark 14.15:1 ✓; `ink-primary` on bright accent 10.58:1 ✓.
- **FIXED [med]:** `ink-secondary` on `surface` = 4.49:1 (just under AA) → surface-panel body text switched to `ink-secondary-strong` (#4e4d4b, ~8:1).
- **FIXED [high]:** `ink-tertiary` on white = 2.26:1 was used for real content (hero availability line, footer, section labels, help text, accordion icons) → switched to `ink-secondary` (4.83:1). `ink-tertiary` is now used only for disabled state and input placeholders (a11y-exempt). `AGENTS.md` rule 10 corrected to state this accurately.

## Re-verification after fixes
| Check | Result |
| --- | --- |
| `bash design-system/lint-design.sh design-system/examples` | ✅ 0 violations (exit 0) |
| Interactive elements missing focus ring | ✅ 0 / 25 |
| `text-ink-tertiary` on readable content | ✅ none (only disabled + placeholders) |
| Gallery re-render (`/tmp/design-system/gallery-final.png`) | ✅ all sections intact, look matches Granola |
| Token values vs `granola-extraction.md` | ✅ pixel-faithful, no drift |

## Standing note
`lint-design.sh` catches token-bypass (arbitrary values, raw hex) but **not** contrast or focus — those require the manual/audit pass above. Re-run the parallel audit after substantial UI changes.

## Addendum — typography updated post-audit
Typography was subsequently changed to **self-hosted** OFL fonts — **Inria Serif** (display), **Geist** (body), **Geist Mono** (code) — replacing the original Granola brand-font leads + free fallbacks. Color, spacing, radius, and motion tokens are unchanged. Contrast/focus findings above are unaffected (text colors unchanged). See [`FONTS.md`](./FONTS.md).
