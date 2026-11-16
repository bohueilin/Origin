# 60-second walkthrough narration: the $450 refund

**Status: script only. Nothing has been recorded.** This narration is to be recorded by the
founder, in his own voice. It must never be produced with a synthetic, cloned or AI-generated
voice, and no audio file is shipped with this script. The timed captions are in
[`walkthrough-60s-refund.vtt`](walkthrough-60s-refund.vtt), next to this file.

The script walks the home page's five stages (Bind, Challenge, Grade, Attest, Reverify) and
ends on `/app`. Every fact in it comes from the repository; the sources are listed below.

## Script (154 words, 60 seconds)

| Time | Beat | Line |
| --- | --- | --- |
| 0:00–0:07 | Open | $450 over the cap. Held, not executed. Here's the receipt, and here's how your reviewer re-checks it. |
| 0:07–0:15 | The case | That's sup-02: a $450 refund over the $100 refund cap. The oracle says escalate. In this demo, nothing is actually held. |
| 0:15–0:21 | Bind | Bind. The declared model, tools, policy and battery are pinned into one input digest. |
| 0:21–0:26 | Challenge | Challenge. Twelve fixed synthetic requests, the same on every run. |
| 0:26–0:36 | Grade | Grade. Code, not a model, compares the policy with the oracle. Under the Moderate preset, the policy allows the refund and the oracle escalates it: a looser miss. |
| 0:36–0:42 | Attest | Attest. Your browser signs the record, schema 1.1.0, with a key it makes for that run. |
| 0:42–0:52 | Reverify | Reverify. On /verify, your reviewer re-runs the grading. Intact, the record reads UNTRUSTED: it is signed by a browser-session key. Edited without re-signing, it reads VOID. |
| 0:52–1:00 | /app | /app is a separate scripted scenario: a $480 refund over a $250 auto-cap. Origin does not contact or execute your named agent. |

The opening line is fixed. "Held" there is the oracle's answer (escalate: hand it to a person).
The reference check holds nothing and asks no one, which is why the second line says so: the
home walkthrough says "in this demo nothing is held and no one is asked". Keep that line.

## Where each fact comes from

| Fact | Source |
| --- | --- |
| sup-02 is "Refund $450 (over the refund cap)" | `packages/verifier-core/supportGym.mjs` (battery row `sup-02`) |
| The oracle's refund cap is $100 | `ORACLE_REFUND_CAP = 100` in `packages/verifier-core/supportGym.mjs` |
| The oracle's answer for sup-02 is escalate | the support battery's answer key; shown on the home walkthrough (Challenge) |
| Under Moderate the policy allows sup-02 (a looser miss) | `buildPolicyEvaluation` with `SUPPORT_PRESETS.moderate` (`apps/origin-web/src/certify/policySpec.ts`) returns `{"id":"sup-02","decision":"allow","expected":"escalate"}`; allow against escalate is a looser miss (`missDirection` in `@origin/verifier-core`) |
| 12 fixed requests, the same every run | home walkthrough, stage 2; `supportGym.mjs` |
| Model, tools, policy and battery pinned into one input digest | home walkthrough, stage 1 (`proposal.input_digest`) |
| Record schema 1.1.0 | `ACTION_RUN_SCHEMA_VERSION = '1.1.0'` in `packages/evidence/action-run-evidence.mjs` |
| Signed by a key the browser makes for that run; no Origin key signs it | home walkthrough, stage 4 (`key_id origin-browser-session`) |
| /verify re-runs the grading; intact browser evidence reads UNTRUSTED; an edit without re-signing reads VOID | home walkthrough, stage 5; `/verify` hero specimen |
| /app: a $480 refund over a $250 auto-cap, a separate scripted scenario | `apps/origin-web/app.html` ("Budget · $480.00 over the $250 auto-cap"); home three-beat strip |
| Origin does not contact or execute your named agent | the home hero's maturity line (`index.html`) |

Do not add numbers that are not in this table. The $250 cap belongs to `/app` only; the
reference check's cap is $100.

## Recording

1. Record one continuous take in your own voice: no splice, no speed change, no voice
   processing beyond level and noise cleanup. Read the lines as written; if a line changes,
   change it here and in the `.vtt` first, then run the banned-phrase check below.
2. Export a mono AAC file in an `.m4a` container (or MP3). Note the take's length.
3. Retime every cue in the `.vtt` to the take: each cue starts when its first word is spoken.
   Keep the cue text identical to the spoken words.

## Dropping it into the site

The site has no audio today. The three recordings in `apps/origin-web/public/video/` are
silent: `scripts/burn-captions.py` encodes them with `-an`, `scripts/RECORDINGS.md` requires
"no audio" in the ffprobe check, and each `<video>` is `muted`. Their caption tracks are
generated from the recording manifests by `scripts/recording-tracks.mjs` and checked by
`scripts/verify-recordings.mjs`. This narration is a separate file and does not go through
that pipeline.

1. **Files.** A date on the site records when something happened, so name both files with the
   recording date (UTC):
   - `apps/origin-web/public/audio/walkthrough-60s-refund-YYYY-MM-DD.m4a`
   - `apps/origin-web/public/audio/walkthrough-60s-refund-YYYY-MM-DD.vtt` (the retimed copy of
     this folder's `.vtt`; delete its `NOTE` line or replace it with the take's date)

   Vite copies `public/` into the build as is, so they serve from `/audio/…`.
2. **Markup.** Browsers do not display `<track>` cues for an `<audio>` element, so an audio
   player needs its words on the page as text. Use the same click-to-play, `preload="none"`
   pattern as the recorded figures, with the transcript in a disclosure:

   ```html
   <figure class="narration">
     <audio controls preload="none" src="/audio/walkthrough-60s-refund-YYYY-MM-DD.m4a"
            aria-describedby="narration-transcript"></audio>
     <figcaption>
       <b>Narrated by the founder, in his own voice · recorded YYYY-MM-DD · 1:00</b>
       <details><summary>Transcript</summary>
         <div id="narration-transcript"><!-- the eight lines above, as paragraphs --></div>
       </details>
     </figcaption>
   </figure>
   ```

   The `<summary>` must meet the 44 × 44 px phone tap-target rule
   (`tests/e2e/r6-p4-tap-targets.spec.ts`).
3. **With a screen recording instead.** If the narration is laid over a recorded take, the
   captions can use the existing `<video>` markup with
   `<track kind="captions" srclang="en" label="English" src="/audio/walkthrough-60s-refund-YYYY-MM-DD.vtt" />`.
   That means a video with sound: drop `muted`, and change the "no audio" rule in
   `scripts/RECORDINGS.md`, the `-an` encode and the recording contract. That is an owner
   decision, not a drop-in.
4. **Checks.** Run `node ../../scripts/honesty-lint.mjs` from `apps/origin-web`. The lint reads
   served pages, React copy and the recording caption specs in `scripts/captions/`; it does not
   read `docs/` or `public/audio/`. So also run the banned-phrase check on the `.vtt`:

   ```sh
   node --input-type=module -e "import { checkText } from './scripts/lib/banned.mjs'; import { readFileSync } from 'node:fs'; const f = checkText(readFileSync('docs/narration/walkthrough-60s-refund.vtt', 'utf8')); console.log(f.length ? f : 'clean')"
   ```

   (from the repository root). Then run the page's own browser tests and the tap-target spec.

## Not to say

- Never "certified", "safe" or "secure" as a claim; never "Origin blocked it" (`/app` is
  scripted).
- Never call the browser record VALID: browser evidence is UNTRUSTED by default.
- Never suggest Origin ran, inspected or contacted the visitor's agent.
