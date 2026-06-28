# design-system

A standalone, **Granola-style** UI design system that coding agents follow when implementing UI. It is **pixel-faithful** to [granola.ai](https://www.granola.ai/) — every value was captured live from their shipped CSS with `agent-browser` (see [`granola-extraction.md`](./granola-extraction.md)).

This folder is intentionally decoupled from the rest of the repo (no numbered plan owns it). Adopt it from any project or future UI.

## Files
| File | Purpose |
| --- | --- |
| [`AGENTS.md`](./AGENTS.md) | **Start here when building UI.** The mandatory rules agents follow. |
| [`DESIGN.md`](./DESIGN.md) | Style guide: intent, rationale, full token reference, do/don't. |
| [`tokens.css`](./tokens.css) | Source-of-truth CSS variables (primitive + semantic layers). |
| [`tailwind-preset.js`](./tailwind-preset.js) | Tailwind preset (the consumption format). |
| [`tailwind.config.example.js`](./tailwind.config.example.js) | How to wire the preset into a project. |
| [`tokens.json`](./tokens.json) | Machine-readable token export. |
| [`granola-extraction.md`](./granola-extraction.md) | Provenance: exact captured values. |
| [`FONTS.md`](./FONTS.md) | Font licensing (brand fonts can't be redistributed) + free OFL alternatives + self-host steps. |
| [`examples/`](./examples/) | Rendered component gallery built from the preset. |
| [`AUDIT.md`](./AUDIT.md) | Compliance report (examples vs. extraction). |

## Quick start (for an agent)
1. Read [`AGENTS.md`](./AGENTS.md).
2. Add `tailwind-preset.js` to `presets` in your `tailwind.config.js`.
3. Load `tokens.css` and the fonts — **Inria Serif** + **Geist** + **Geist Mono**, self-hosted under `examples/fonts/` (see [`FONTS.md`](./FONTS.md)).
4. Build UI from preset utilities only — never hardcode hex/px.

## Preview the examples
```bash
open design-system/examples/index.html      # macOS
# or: python3 -m http.server -d design-system/examples 8000
```

## The look in one line
White page → warm off-white (`#f7f7f2`) panels with warm hairline borders → near-black ink (`#292929`) → one olive-green action (`#5b6f00`) → serif display headings over grotesque-sans body. Airy, editorial, flat.
