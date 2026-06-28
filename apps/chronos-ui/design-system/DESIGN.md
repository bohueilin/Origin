# Design system — Granola-style

A pixel-faithful adaptation of [granola.ai](https://www.granola.ai/)'s visual language, captured live from their shipped CSS (their internal system is named **"oats"**). Provenance and exact values: [`granola-extraction.md`](./granola-extraction.md). Machine-readable copy: [`tokens.json`](./tokens.json). Consumption rules for agents: [`AGENTS.md`](./AGENTS.md).

## Design intent
**Editorial, warm, and calm.** The look reads like a well-set notebook: a white page, warm off-white panels, near-black ink, and a single confident olive-green for action. Whitespace does the work; borders (not heavy shadows) define structure. A serif display voice over a quiet grotesque body gives it an authored, human feel rather than a generic SaaS dashboard.

Every choice below traces to a value observed on granola.ai — there are no invented defaults.

## Foundations

### Color — *why these*
- **White page, warm off-white surfaces.** The page is pure `#ffffff`; content panels use `surface` `#f7f7f2`. The warmth is subtle and comes mostly from the **hairline** border `#47432a33` (a warm brown-tinted translucent), not from a cream page. This keeps text crisp while feeling soft.
- **Warm-gray ink ramp.** Text is `#292929` (not pure black) on a warm neutral ramp — softer, more editorial than cold grays.
- **One signature green.** Olive `#5b6f00` is the primary action; `#788c15` for green text/icons; bright lime `#d1e043` / `#b2c248` strictly as decorative highlights. Restraint is the point — green means "do this." (Granola's `--color-accent` `#94f27f` is defined but never rendered, so we don't use it — `accent` maps to the lime they actually show.)

| Use | Token / utility | Hex |
| --- | --- | --- |
| Page background | `bg-background` | `#ffffff` |
| Panel / card | `bg-surface` | `#f7f7f2` |
| Sunken | `bg-surface-sunken` | `#f2f2ec` |
| Primary text | `text-ink-primary` | `#292929` |
| Secondary text | `text-ink-secondary` | `#72726e` |
| Tertiary / meta | `text-ink-tertiary` | `#acada8` |
| Text on dark | `text-ink-inverse` | `#fcfcf8` |
| Hairline border | `border-hairline` | `#47432a33` |
| Solid border | `border-stroke` | `#d5d5d2` |
| Primary action (green) | `bg-fill-accent` | `#5b6f00` |
| Primary action (dark) | `bg-fill-primary` | `#292929` |
| Green text | `text-accent-text` | `#0d7916` |
| Decorative highlight | `bg-accent` / `bg-green-300` | `#d1e043` / `#b2c248` |
| Danger | `bg-fill-danger` / `text-ink-danger` | `#e95d3d` / `#bd4a30` |

### Fonts — *the voice*
Same role pairing as Granola (serif display + grotesque sans), realized with self-hosted OFL fonts — **no licensed/proprietary fonts, no CDN**.
- **Display / headings → `font-display`** = **Inria Serif** (a warm, slightly editorial serif; weights 300/400/700). Set headings large with tight tracking (`tracking-tight`, ≈ −0.02em).
- **Body / UI → `font-sans`** = **Geist** (clean neo-grotesque, weights 400–700). Body runs small (14px) at weight 400–500 with slight positive tracking.
- **Code → `font-mono`** = **Geist Mono** (weights 400/500).

> All three are SIL Open Font License 1.1 and **self-hosted** — the `.woff2` files and `OFL-*.txt` licenses live in [`examples/fonts/`](./examples/fonts/), declared via [`examples/fonts/fonts.css`](./examples/fonts/fonts.css). No external font request. Full licensing + download/self-host steps: see [`FONTS.md`](./FONTS.md).

### Type scale (confirmed)
Body default is **`text-base` = 14px**. Each size carries its line-height (and tracking) in the preset.

| Token | Size | Line-height | Use |
| --- | --- | --- | --- |
| `text-7xl` | 72px | 0.95 | Hero display |
| `text-5xl` | 48px | 1.0 | Page title |
| `text-3xl` | 30px | 1.2 | Section heading |
| `text-2xl` | 24px | 1.33 | Card title |
| `text-lg` | 16px | 20px | Lead paragraph |
| `text-base` | 14px | 18px | Body |
| `text-sm` | 13px | 16px | Secondary |
| `text-xs` | 12px | 16px | Caption / label |

### Spacing — 4px base
Use only scale steps: `1`=4 `2`=8 `3`=12 `4`=16 `6`=24 `8`=32 `12`=48 `16`=64 `20`=80 `24`=96. Layout is airy: section padding ≥ `py-16`; card padding `p-6`; control padding `px-4 py-2.5`.

### Radius — 8px default
`rounded-lg` (8px) is the workhorse (buttons, cards, inputs). `rounded-full` for pills/avatars/toggles. Scale: xs 2 · sm 4 · md 6 · lg 8 · xl 12 · 2xl 16 · 3xl 24.

### Elevation — borders first
Granola is near-flat. Define structure with `border-hairline` / `border-stroke`. Reserve `shadow` (`0 4px 6px -2px #0000000d`) and `shadow-lg` for genuine overlays (menus, modals, floating bars).

## Components (see `examples/`)
- **Buttons** — primary (green or dark, white text, `rounded-lg`, `px-4 py-2.5`), secondary (surface + `border-stroke`), ghost (text only), pill (`rounded-full`). Visible focus ring.
- **Cards** — `bg-surface-raised`/`bg-surface`, `border-hairline`, `rounded-lg`, `p-6`. Title `font-display text-2xl`, body `text-base text-ink-secondary`.
- **Inputs** — white fill, `border-stroke`, `rounded-lg`, `text-base`, focus → `ring-2 ring-ring`. Labels `text-sm text-ink-secondary`.
- **Nav** — text links `text-ink-secondary` hover `text-ink-primary`; pill CTA `rounded-full`.
- **Tags/pills** — tinted surface (`bg-tint-green`/`bg-green-100`), `text-ink-accent`, `rounded-full`, `text-xs`.

## Do / don't
| Do | Don't |
| --- | --- |
| `bg-surface` panels on white | A second saturated background color |
| One green for action | Green body text on white (contrast fail) |
| `font-display` headings, `font-sans` body | Mixing the two roles |
| `border-hairline` to separate | Drop shadows everywhere |
| `text-base` (14px) body | 16px body by default |
| 4px-scale spacing | Arbitrary `13px`/`27px` gaps |
