# Granola design extraction (provenance)

**Source:** https://www.granola.ai/ (homepage) · **Method:** `agent-browser` (real Chrome via CDP) reading live `getComputedStyle`, `:root` CSS custom properties, and `document.fonts`. **Captured:** 2026-06-20.

All values below are **[CONFIRMED]** — read directly from Granola's shipped CSS custom properties (their internal design system is named **"oats"**, built on Tailwind v4). Raw capture: `/tmp/granola/tokens-raw.json`. Screenshots: `/tmp/granola/home-full.png`, `/tmp/granola/home-viewport.png`.

This file is the source of truth the compliance audit checks `design-system/` against.

## Fonts [CONFIRMED]

| Role | Granola font | CSS var | Classification |
| --- | --- | --- | --- |
| Display / headings | **Quadrant Notepad** | `--font-display` | Serif display (editorial, moderate contrast). Used large, tight negative tracking, weight 400. |
| Body / UI | **KMR Melange Grotesk** | `--font-sans`, `--default-font-family` | Neo-grotesque sans. Body at 14–16px, weights 400–600, slight positive tracking. |
| Mono | **JetBrains Mono** | `--font-mono` | Monospace (code). |

The table above records **Granola's own** fonts (provenance). They are proprietary/licensed — Granola's [brand post](https://www.granola.ai/blog/a-new-look-for-granola) names the pair as **Quadrant** (a *slightly mechanical slab serif*, by Matter of Sorts — bespoke) and **Melange** (KMR Melange Grotesk, by Kimera — paid retail); "Quadrant Notepad" is the internal cut name read from their CSS. **This design system does not use them.** It keeps the same *roles* (serif display + grotesque sans) but ships self-hosted OFL fonts: **Inria Serif** (display) + **Geist** (body) + **Geist Mono** (code). Full licensing + self-host steps: see [`FONTS.md`](./FONTS.md).

Weights shipped: light 300, normal 400, **book 430**, medium 500, semibold 600, bold 700.

## Color [CONFIRMED]

### Warm neutral ramp ("oats")
| Token | Hex |
| --- | --- |
| neutral-50 | `#fcfcf8` |
| neutral-100 | `#f7f7f2` |
| neutral-150 | `#f2f2ec` |
| neutral-200 | `#eaebe5` |
| neutral-300 | `#d5d5d2` |
| neutral-400 | `#acada8` |
| neutral-450 | `#9e9e99` |
| neutral-500 | `#818179` |
| neutral-600 | `#72726e` |
| neutral-700 | `#4e4d4b` |
| neutral-750 | `#363635` |
| neutral-800 | `#292929` |
| neutral-900 | `#212121` |
| neutral-950 | `#1e1e1e` |

### Semantic surfaces & ink
| Token | Hex | Notes |
| --- | --- | --- |
| background (page) | `#ffffff` | Page is white, **not** cream. |
| surface | `#f7f7f2` | Warm off-white panel — the signature "cream". |
| surface-sunken | `#f2f2ec` | |
| surface-raised / elevated | `#ffffff` | |
| ink-primary | `#292929` | Body + heading text. |
| ink-secondary | `#72726e` | |
| ink-secondary-strong | `#4e4d4b` | |
| ink-tertiary | `#acada8` | |
| ink-inverse | `#fcfcf8` | Text on dark fills. |
| hairline | `#47432a33` | **Warm-tinted** translucent border (the warmth cue). |
| stroke | `#d5d5d2` | Solid border. |
| border | `#e3e3e3` | hsl(0 0% 89%). |

### Accent — olive / lime green (signature)
| Token | Hex | Notes |
| --- | --- | --- |
| fill-accent | `#5b6f00` | **Primary green button** (dark olive). |
| fill-accent-hover | `#4c5616` | |
| ink-accent | `#788c15` | Green text/icon. |
| accent | `#94f27f` | Defined as `--color-accent` but **rendered 0×** — see note. |
| accent-strong | `#79d65e` | Defined as `--color-accent-strong` but **rendered 0×**. |
| accent-text | `#0d7916` | Green text. |
| accent-wash | `#93f27d33` | Translucent (#94f27f-based) — also unused. |

> **Empirical accent check (re-verified live, 1604 elements):** `--color-accent` `#94f27f` and `--color-accent-strong` `#79d65e` are defined in Granola's CSS but **never actually rendered** on the homepage. The bright accents they *do* render are **green-300 `#b2c248` (4×)** and **green-200 `#d1e043` (1×)** — and the olive `#5b6f00` (1×) for the CTA. This design system therefore maps its `accent` token to `#d1e043` and `accent-strong` to `#b2c248` (the real, visible limes), and drops the unused `#94f27f`/`#79d65e`.

Green ramp: 50 `#f2f6e1` · 100 `#e5eacd` · 200 `#d1e043` · 300 `#b2c248` · 400 `#788c15` · 500 `#5b6f00` · 600 `#434625`.

### Primary (dark) & danger
| Token | Hex |
| --- | --- |
| fill-primary | `#292929` |
| fill-primary-hover | `#4e4d4b` |
| danger (fill) | `#e95d3d` |
| danger-ink | `#bd4a30` |

### Tinted accent surfaces
green `#f2f6e1` · blue `#eaf4fe` · purple `#f3f0fa`

## Type scale [CONFIRMED]
| Token | size | line-height | letter-spacing |
| --- | --- | --- | --- |
| 2xs | 11px | — | — |
| xs | 12px | 16px | .02em |
| sm | 13px | 16px | .01em |
| base | **14px** | 18px | .01em |
| lg | 16px | 20px | — |
| xl | 20px | 1.4 | — |
| 2xl | 24px | 1.33 | — |
| 3xl | 30px | 1.2 | — |
| 4xl | 36px | 1.11 | — |
| 5xl | 48px | 1.0 | — |
| 6xl | 60px | 1.0 | — |
| 7xl | 72px | 1.0 | — |

Base body text is **14px** (not 16px). Headings use Quadrant Notepad at the large end with negative tracking.

Observed live nodes (computed): h1 86.4px / lh 0.93 / tracking −1.728px (≈ −.02em); h3 24px / lh 1.05 / tracking −.01em; p 14px / weight 500 / lh 18px / tracking .14px (.01em); body 16px / lh 24px / `#292929`.

Line-heights: tight 1.25 · snug 1.375 · normal 1.5 · relaxed 1.625.
Tracking: tight −.025em · normal 0 · wide .025em · wider .05em.

## Spacing, radius, shadow [CONFIRMED]
- **Spacing base unit:** `--spacing: .25rem` → **4px** scale (Tailwind default multiples).
- **Radius:** xs 2px · sm 4px · md 6px · **lg 8px (default)** · xl 12px · 2xl 16px · 3xl 24px · full 9999px. Buttons use 8px; nav pills use full.
- **Elevation:** mostly **flat with hairline borders** (most elements `box-shadow: none`). One shipped shadow: `--shadow-bottom-bar: 0px 4px 6px -2px #0000000d`. Prefer borders over shadows.
- **Containers (max-width):** sm 24rem · md 28rem · lg 32rem · xl 36rem · 2xl 42rem · 3xl 48rem · 4xl 56rem · 5xl 1014px · 6xl 72rem · 7xl 80rem.

## Motion [CONFIRMED]
Raw capture: `/tmp/granola/anim-raw.json`. Easing curves and keyframes read from shipped CSS.

| Curve | Value | Use |
| --- | --- | --- |
| ease-out-expo | `cubic-bezier(.16,1,.3,1)` | **signature** show/hide (dropdowns, dialogs, popovers) |
| ease-in-out-expo | `cubic-bezier(.87,0,.13,1)` | larger transitions |
| ease-out | `cubic-bezier(0,0,.2,1)` | fade-in-up |
| default | `cubic-bezier(.4,0,.2,1)` @ **150ms** | hovers / general transitions |

Keyframes (exact):
- `fade-in-up`: `opacity 0 → 1`, `translateY(20px → 0)`; played `0.6s ease-out forwards`.
- `overlayShow/Hide`: opacity 0↔1, 0.15s / 0.25s ease-out-expo.
- `contentShow` (centered dialog): `opacity 0→1` + `translate(-50%,-48%) scale(.96) → translate(-50%,-50%) scale(1)`, 0.15s ease-out-expo. Anchored dropdown variant: `translateY(-4px) scale(.96) → 0/1`.
- `accordion-down/up`: `height 0 ↔ content-height`, 0.2s ease-out.
- Utility: `pulse` (opacity .5), `spin` (rotate 1turn), `caret-blink`.

## Buttons & hover [CONFIRMED]
Live read of the hero CTA "Download for free": background `rgb(91,111,0)` = **#5b6f00** (`fill-accent`), text `rgb(252,252,248)` = **#fcfcf8** (`ink-inverse`), **font-weight 430** (book), padding **9px 24px**, **fully rounded (pill / `rounded-full`)**.

So Granola uses **two button shapes**: marketing/primary CTAs are **pills** (`rounded-full`); in-app/utility buttons (e.g. dark "Generate notes") use **`rounded-lg` (8px)**. Hover fills: `fill-accent-hover #4c5616`, `fill-primary-hover #4e4d4b`, `fill-soft-hover #56512e1f`. Links hover from `ink-secondary #72726e` → `ink-primary #292929`. Default hover transition is 150ms `cubic-bezier(.4,0,.2,1)`.

## Aesthetic summary (for the audit)
White page → warm off-white (`#f7f7f2`) panels with warm translucent hairlines → near-black ink (`#292929`) → **olive-green** primary action (`#5b6f00`) with white text → lime (`#d1e043`/`#b2c248`) decorative accents. Serif display headings, grotesque-sans body. Generous whitespace, 8px radius, flat/bordered (not shadow-heavy). Editorial, warm, minimal.
