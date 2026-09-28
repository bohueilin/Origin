# Origin cinematic brand assets

These are original illustrative brand assets created for the September 2026 website redesign.

- `review-2026-09-28.webp`: AI-generated fictional people reviewing a laptop. Not customer, employee or office photography.
- `trace.webp`: AI-generated glass and sunlight composition used as a metaphor for traceability.
- `lab.webp`: AI-generated fictional researcher and robot. Not an Origin facility, product deployment or evidence of robot capability.
- `review-loop-2026-09-28.av1.mp4`, `.vp9.webm`, `.h264.mp4`: silent camera movement over the generated review still. The homepage plays it once with pause/replay controls; reduced motion and data saver leave it stopped.
- `origin-mark.svg`: code-native geometric Origin mark.
- `proving-floor.webp` and `proving-floor-small.webp`: original AI-generated miniature warehouse, in 1200px and 640px responsive encodings (about 78 KB and 33 KB). A fictional architectural model, not simulation output or an Origin facility. The proving-ground introduction labels it accordingly.

The browser favicon, Apple touch icon and raster logo now share the same geometric mark; regenerate them with `node scripts/brand-icons.mjs`. Social previews use the same paper/sage/forest identity; regenerate the 12 cards with `node scripts/og-cards.mjs`. The generator checks text bounds before saving.

## Proving-floor generation brief

Generated with the built-in image-generation tool. Final art direction: a landscape editorial photograph of a precisely crafted architectural warehouse model, viewed from an elevated isometric camera. Warm ivory tabletop, off-white low walls, sage-green mobile robot models, wooden crates and one restrained ochre floor area. Matte ceramic/paper materials, soft afternoon sunlight, elegant shadows and a subtle route line. No people, text, logos, watermarks or science-fiction effects. Explicitly imagined illustrative model, not a real robot installation or working simulator. The output was only resized and WebP-encoded for delivery; its content was not altered.

The dated 1200px `trace`/`lab` variants, 800px `proving-floor` variant and 1280px review poster use WebP quality 78. Hero video variants retain the full eight seconds without audio: AV1 CRF 38, VP9 CRF 36 and H.264 CRF 26.

The WebP images are optimized encodings of the approved generated originals. None of these brand assets is product evidence.

Three synthetic product recordings made on 2026-09-28 at release `57d5ccf` live under `/video/` with dated names. They replace the withdrawn recordings and the generated `05-second-reader` clip. Every recording is click-to-play, carries a persistent disclosure, and has a figure description that states its scope. The attestation recording appears on both `/` and `/verify`; the other takes show the in-page over-grant analyzer and the selected-policy reference check. Raw masters stay outside Git. See [the recording method](../../scripts/RECORDINGS.md), caption specifications and run manifests under `scripts/` for facts, hashes and reproducibility.

## Origin mark · 2026-09-28

The new code-native symbol is an open geometric O, a central origin point, and a separate trace node. It suggests a record with an explicit boundary; it is not a certification seal. The primary mark is forest green (`#2b523b`) on paper (`#f8f7f4`). An inverse paper version is supplied for dark surfaces. Leave at least one central-dot diameter of clear space; use the symbol at 24px or larger in navigation, and the dedicated favicon for browser tabs.

- `origin-mark-2026-09-28.svg`: primary scalable symbol.
- `origin-mark-inverse-2026-09-28.svg`: symbol for dark surfaces.
- `origin-wordmark-2026-09-28.svg`: symbol with the Origin wordmark.
- Dated favicon, Apple touch icon and raster-logo files in the public root use the same symbol. `brand-icons.mjs` rebuilds both canonical and dated icons.

The homepage review illustration and motion files are unchanged. Social-preview images remain unchanged; the mark update does not rewrite dated recording or evidence artifacts.
