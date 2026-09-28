# Synthetic product recordings

The three recorders capture one continuous take on the canonical live site. They permit only first-party and Google Fonts GET requests; provider calls and telemetry are blocked. Each run checks the release scoreboard against `RECORD_COMMIT` before opening the page. Do not record a preview or an older release.

From `apps/origin-web`, after confirming the deployed commit:

```sh
RECORD_COMMIT=<verified-release-sha> node scripts/rec-shot01.mjs
RECORD_COMMIT=<verified-release-sha> node scripts/rec-shot02.mjs
RECORD_COMMIT=<verified-release-sha> node scripts/rec-shot04.mjs
```

Each directory under `/tmp/rec/shot01`, `shot02` or `shot04` contains the raw WebM and `run.json`. Keep masters outside Git. A failed recorder does not produce a successful run manifest. Retain earlier takes separately when re-recording.

`run.json` records the observed verdicts and numbers, timestamped beats, release provenance, raw-file digest and bundled font digest. Shot02 reads fleet counts, seed, surface, root reach and planted-corpus results from the page. Its root-count configuration is read from `OG_ROOTS` in the exact released source; it is explicitly recorded as a configuration source. It is not inferred from the separate published benchmark. Shot04 uses clipboard write and keyboard paste, verifies byte equality with the download, and requires an UNTRUSTED result for the unpinned browser-session signer.

With Python/Pillow and ffmpeg available, render the corresponding caption specification:

```sh
python3 scripts/burn-captions.py /tmp/rec/shot01/run.json scripts/captions/shot01.json public/video/shot01-YYYY-MM-DD.mp4 public/video/shot01-YYYY-MM-DD.webp
```

Repeat for shot02 and shot04 with the UTC recording date. The renderer uses the bundled OFL-licensed Carlito Regular font, 44px captions and a 30px persistent disclosure at (24, 24), at 1280×720. It validates every fact and beat before rendering. The complete take is retained; captions and the real mouse-event cursor dot are the only overlays. No audio, speed change or splice is added. Encoding is H.264 High/yuv420p, CRF 26, slow preset, faststart; posters are WebP quality 78.

Before publication:

1. Inspect a frame 1.5 seconds after each state beat, plus the poster. `end` is a stop marker, not a state. Confirm the caption's claim is visible and neither disclosure nor verdict is covered.
2. Check the encode with ffprobe: 1280×720, H.264 High, yuv420p, no audio; verify the MP4 `moov` atom precedes `mdat`.
3. Copy each successful `run.json` to `scripts/recordings/shotNN.json`; never copy raw masters or downloaded evidence into Git. Update the dated HTML paths and complete figure descriptions from those facts.
4. Run `python3 scripts/burn-captions.test.py`, `npm run recordings:check`, the honesty lint and the complete app gates/browser suite.

The provenance check compares the committed video, poster, font and caption text with the manifest. A changed asset or caption requires a new render and manifest. Recordings remain click-to-play. The recorded lane is synthetic demonstration data, not customer evidence or deployment authority.
