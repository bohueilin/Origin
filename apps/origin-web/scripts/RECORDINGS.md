# Synthetic product recordings

The three recorders capture one continuous take on the canonical live site. They permit only first-party and Google Fonts GET requests; provider calls and telemetry are blocked. Each run checks the release scoreboard against `RECORD_COMMIT` before opening the page. Do not record a preview or an older release.

From `apps/origin-web`, after confirming the deployed commit:

```sh
RECORD_COMMIT=<verified-release-sha> node scripts/rec-shot01.mjs
RECORD_COMMIT=<verified-release-sha> node scripts/rec-shot02.mjs
RECORD_COMMIT=<verified-release-sha> node scripts/rec-shot04.mjs
```

Each directory under `/tmp/rec/shot01`, `shot02` or `shot04` (or under `$REC_DIR` when set) contains the raw WebM and `run.json`. Keep masters outside Git. A failed recorder does not produce a successful run manifest. Retain earlier takes separately when re-recording.

`run.json` records the observed verdicts and numbers, timestamped beats, release provenance, raw-file digest and bundled font digest. Shot02 reads fleet counts, seed, surface, root reach and planted-corpus results from the page. Its root-count configuration is read from `OG_ROOTS` in the exact released source; it is explicitly recorded as a configuration source. It is not inferred from the separate published benchmark. Shot04 uses clipboard write and keyboard paste, verifies byte equality with the download, and requires an UNTRUSTED result for the unpinned browser-session signer. Since Release 5 the "Re-verify it on /verify" link carries the record in its URL fragment and fills the field; the recorder requires that text to equal the download, clears the field and requires it to be empty, then pastes the download and requires the field to equal it. The edit drops the page's "Loaded from a shared link" note, and the recorder requires that note to be gone before it verifies, so the result is for the pasted text. `link_matches_download` and `clipboard_matches_download` in `run.json` record those two checks.

With Python/Pillow and ffmpeg available, render the take with the corresponding caption specification:

```sh
python3 scripts/burn-captions.py /tmp/rec/shot01/run.json scripts/captions/shot01.json public/video/shot01-YYYY-MM-DD.mp4 public/video/shot01-YYYY-MM-DD.webp
```

Repeat for shot02 and shot04 with the UTC recording date. Since Release 7 (R05) the renderer draws no caption into the picture. Its only overlay is a small opaque 20px "RECORDED · ONE TAKE · SYNTHETIC DATA" pill at (24, 24) for the whole take, in the bundled OFL-licensed Carlito Regular font at 1280×720. The pill sits over the site's sticky header, so it never covers the recorded page. The renderer still validates every caption's facts and beats and that captions follow one another. It writes them to the manifest as timed text cues (`render.captions_in_picture: false`, no box), and `recording-tracks.mjs` turns them into the WebVTT track. On the site, the caption tray under each player shows the active cue. The complete take is retained; the pill and the real mouse-event cursor dot are the only overlays. No audio, speed change or splice is added. Encoding is H.264 High/yuv420p, CRF 26, slow preset, faststart; posters are WebP quality 78.

Before publication:

1. Inspect a frame 1.5 seconds after each state beat, plus the poster. `end` is a stop marker, not a state. Confirm the state each caption names is visible in the picture, and that nothing but the corner pill (over the header) and the cursor dot is drawn on it.
2. Check the encode with ffprobe: 1280×720, H.264 High, yuv420p, no audio; verify the MP4 `moov` atom precedes `mdat`.
3. Copy each successful `run.json` to `scripts/recordings/shotNN.json`; never copy raw masters or downloaded evidence into Git. Update the dated HTML paths and complete figure descriptions from those facts. Run `node scripts/recording-tracks.mjs` to regenerate the WebVTT text tracks from the manifest's caption cues (the pill becomes a NOTE with the take's date, host and commit), and update each figure's `<track>`, its summary bar ("Recorded YYYY-MM-DD (commit) · synthetic demo data"), the provenance text in its "Full provenance and limits" disclosure and its `Duration m:ss.` line (the check reads the encoded MP4 duration).
4. Run `python3 scripts/burn-captions.test.py`, `npm run recordings:check`, the honesty lint and the complete app gates/browser suite.

The provenance check compares the committed video, poster, font and caption text with the manifest. A changed asset or caption requires a new render and manifest. Recordings remain click-to-play. The recorded lane is synthetic demonstration data, not customer evidence or deployment authority.
