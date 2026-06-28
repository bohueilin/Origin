# Fonts

## What this design system ships
Three **self-hosted, OFL 1.1** fonts — no CDN, no proprietary/licensed fonts:

| Role | Font | Weights bundled | Source |
| --- | --- | --- | --- |
| Display / headings (`font-display`) | **EB Garamond** | 500 | [Google Fonts](https://fonts.google.com/specimen/EB+Garamond) · [georgd/EB-Garamond](https://github.com/georgd/EB-Garamond) |
| Body / UI (`font-sans`) | **Geist** | 400 / 500 / 600 / 700 | [Google Fonts](https://fonts.google.com/specimen/Geist) · [vercel/geist-font](https://github.com/vercel/geist-font) |
| Code (`font-mono`) | **Geist Mono** | 400 / 500 | [Google Fonts](https://fonts.google.com/specimen/Geist+Mono) · [vercel/geist-font](https://github.com/vercel/geist-font) |

The `.woff2` files (latin subset) and the `OFL-*.txt` license files live in [`examples/fonts/`](./examples/fonts/) and are declared in [`examples/fonts/fonts.css`](./examples/fonts/fonts.css). `examples/index.html` loads that one stylesheet — **zero external font requests**. The family names (`"EB Garamond"`, `"Geist"`, `"Geist Mono"`) match the stacks in `tokens.css` / `tailwind-preset.js`.

> Note: Display headings use EB Garamond at weight 500 (`--ds-font-display-weight`). The `.font-display` utility applies this weight automatically.

## How to (re)download / self-host
```bash
# woff2 (latin) via google-webfonts-helper — into design-system/examples/fonts/
curl -L "https://gwfh.mranftl.com/api/fonts/eb-garamond?download=zip&subsets=latin&variants=500&formats=woff2" -o eb-garamond.zip
curl -L "https://gwfh.mranftl.com/api/fonts/geist?download=zip&subsets=latin&variants=regular,500,600,700&formats=woff2" -o geist.zip
curl -L "https://gwfh.mranftl.com/api/fonts/geist-mono?download=zip&subsets=latin&variants=regular,500&formats=woff2" -o geist-mono.zip
unzip -o eb-garamond.zip -d examples/fonts && unzip -o geist.zip -d examples/fonts && unzip -o geist-mono.zip -d examples/fonts

# OFL licenses (ship these alongside the fonts)
curl -L "https://raw.githubusercontent.com/google/fonts/main/ofl/ebgaramond/OFL.txt" -o examples/fonts/OFL-EBGaramond.txt
curl -L "https://raw.githubusercontent.com/google/fonts/main/ofl/geist/OFL.txt"      -o examples/fonts/OFL-Geist.txt   # covers Geist + Geist Mono
```
`@font-face` pattern (one rule per weight) — see `examples/fonts/fonts.css`:
```css
@font-face {
  font-family: "Geist";
  font-style: normal;
  font-weight: 500;
  font-display: swap;
  src: url("geist-v5-latin-500.woff2") format("woff2");
}
```
To use the system in another project, copy `examples/fonts/` into your app (e.g. `/public/fonts`), adjust the `src` paths, and load `fonts.css`.

### OFL 1.1 compliance
The Open Font License permits self-hosting, bundling, embedding, and redistribution (incl. commercial), provided you: (1) **keep/ship the `OFL-*.txt`** files with the fonts, (2) **don't sell the fonts on their own**, and (3) **don't reuse a reserved font name** on a modified version. Self-hosting these `.woff2` files is fully allowed.

---

## Why not Granola's actual fonts?
For reference — this system deliberately does **not** use Granola's typefaces (they can't be redistributed):
- **Quadrant** (Granola's display serif; the "Quadrant Notepad" cut) — bespoke, by Matter of Sorts (Vincent Chan). Not sold as a retail product; licensed by request only. We can't obtain it. ([Typewolf](https://www.typewolf.com/quadrant-text) · [Matter of Sorts](https://matterofsorts.com/))
- **Melange** (Granola's UI sans; KMR Melange Grotesk) — paid retail from Kimera. Licensable for a fee (price TBD; webfont license required to self-host), not free. ([Kimera](https://kimeracorp.eu/typefaces/melange-grotesk))
- The "free download" sites for these are **pirated — do not use them.**

EB Garamond + Geist keep the same *roles* (warm serif display + clean grotesque sans) while being free and self-hostable.
