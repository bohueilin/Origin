# AGENTS.md — rules for implementing UI

When you implement any UI in a project that adopts this design system, follow these rules. They are mandatory, not suggestions. The system is pixel-faithful to granola.ai; the goal is that every screen looks like it belongs to the same product.

## Setup (once per project)
1. Add `tailwind-preset.js` to `presets` in `tailwind.config.js` (see `tailwind.config.example.js`).
2. Load `tokens.css` once globally (gives CSS-var access + font fallbacks).
3. Load the fonts (see `DESIGN.md` → Fonts): **Inria Serif** (display), **Geist** (body), **Geist Mono** (code) — self-hosted, OFL 1.1, wired via `examples/fonts/fonts.css`. No CDN.

## The rules
1. **Never hardcode values.** No raw hex, rgb, or px for color, spacing, radius, type, or shadow in markup or styles. Use preset utilities (`bg-surface`, `text-ink-secondary`, `rounded-lg`, `p-4`, `text-base`) or `var(--ds-*)`. If a value you need isn't a token, stop and add it to the tokens — don't inline it.
   - **No Tailwind arbitrary-value brackets** for design values: `bg-[#fff]`, `text-[14px]`, `p-[13px]`, `rounded-[7px]` are banned (they bypass tokens, validation, and theming). Use the named utility. Run `bash design-system/lint-design.sh <dir>` to catch violations.
2. **Text = semantic ink tokens.** Body copy `text-ink-primary`; supporting text `text-ink-secondary`; captions/meta `text-ink-tertiary`. On dark fills use `text-ink-inverse`. Default body size is `text-base` (14px), not 16px.
3. **Headings use the display serif.** `font-display` for h1–h3, with tight tracking at large sizes (`tracking-tight`). Body/UI uses `font-sans`. Never set a heading in the sans font or body in the serif.
4. **Surfaces, not boxes.** Page background is white (`bg-background`). Panels/cards sit on `bg-surface` (`#f7f7f2`). Separate regions with the **warm hairline** (`border-hairline`) or `border-stroke` — prefer borders over shadows. Use shadows (`shadow`, `shadow-sm`) sparingly for true overlays only.
5. **One green, used with intent.** The primary action is the dark olive `bg-fill-accent` (`#5b6f00`) with `text-white`. Bright greens (`accent`, `green-200/300`) are decorative highlights only — never body text on white (fails contrast). Green text uses `text-accent-text` (`#0d7916`).
6. **Primary vs secondary buttons.** Primary CTA = `bg-fill-accent` (green) **or** `bg-fill-primary` (near-black `#292929`), white text, `rounded-lg`, `px-4 py-2.5`. Secondary = white/`bg-surface` fill, `border-stroke`, `text-ink-primary`. Pills/toggles use `rounded-full`.
7. **Spacing is the 4px scale.** Only use scale steps (`p-2 p-3 p-4 p-6 p-8`…). Be generous: this is an airy, editorial layout. Section padding ≥ `py-16`.
8. **Radius is 8px by default.** `rounded-lg` (8px) for buttons/cards/inputs; `rounded-full` for pills/avatars. Don't invent radii.
9. **Focus is visible.** Interactive elements get a visible focus ring (`ring-2 ring-ring` / `--ds-ring`). Never remove outlines without replacing them.
10. **Contrast ≥ WCAG AA.** Body text on its background must be ≥ 4.5:1. `ink-primary` passes everywhere; `ink-secondary` passes on white (4.83:1) but **just misses on `surface` (4.49:1)** — for body text on `bg-surface`/tinted panels use `ink-secondary-strong`. `ink-tertiary` (2.26:1 on white) is for disabled states and placeholders only — never for readable content.
11. **Hover & motion use the tokens.** Interactive fills darken on hover to their `-hover` token (`hover:bg-fill-accent-hover`, `hover:bg-fill-primary-hover`); links go `text-ink-secondary → hover:text-ink-primary`. Default transition is `transition` (150ms, default ease). Entrances use `animate-fade-in-up`; menus/popovers/dialogs use `animate-dropdown-show`/`animate-content-show` (ease-out-expo); accordions use `animate-accordion-down/up`. Don't invent durations/curves — and respect `prefers-reduced-motion`.

## Button shapes (Granola uses both — match context)
- **Marketing / primary CTA → pill** (`rounded-full`), e.g. green `bg-fill-accent` `text-ink-inverse` `font-book`, `px-6 py-2.5`.
- **In-app / utility button → `rounded-lg`** (8px), dark `bg-fill-primary` or secondary surface.

## Self-check before you finish
- Run `bash design-system/lint-design.sh <your-ui-dir>` → must report 0 violations.
- Grep your output for raw `#` hex, bare `px`, and `*-[` arbitrary values — none outside tokens.
- Confirm headings are `font-display`, body is `font-sans`, body is `text-base`.
- Confirm the only saturated green used as a large fill is `fill-accent`; hovers use `-hover` tokens.

See `DESIGN.md` for the why behind each choice and a full token reference.
