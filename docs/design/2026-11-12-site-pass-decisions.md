# Site pass decisions — 2026-11-12

These decisions govern a site pass in waves. Wave 1 corrects public statements the product does not bear out; later waves make the reference-check record state its result and let `/verify` re-run its grading, then revise the home page, the offer and the Labs pages. Each wave appends the decisions it implements. Implementation happens in draft pull requests; merging and releasing remain owner steps.

## Wave 1 — claims corrections

**Byte-preserve rule.** `AGENTS.md` governs: named HTML body edits are allowed. `CLAUDE.md` now says the same, and both lists name `sitemap.xml`. These head edits are approved by name: the description, `og:description` and `twitter:description` meta on `/proof` and `/`. Canonical URLs, `og:url`, JSON-LD URLs, OG images, legal text, `robots.txt`, `sitemap.xml`, `insforge.toml` and dated evidence under `public/trust/` and `public/proof/` stay byte-identical.

**TR-A002.** Relabelled in page copy only. `public/proof/tr-a002.json` and its digest are unchanged. "Machine-emitted" stays, because a script wrote the file and computed its hash chain; "scripted" is added, because a script also wrote the twelve events. No page says or implies that a runtime, proxy, approver or sandbox acted. The `/proof` copy now states what `verify-tr-a002.mjs` checks (the events, `final_digest` and `log_digest`) and that the file's top-level descriptive fields are outside the chain. A tamper test locks the verifier's behaviour.

**`/security` configuration-binding demo.** Panel 04 grades the IAM "Least-privilege (recommended)" preset instead of the answer key, so it reports 11 of 12 rather than a 12 of 12 that held by construction. Each mismatch shows its direction: stricter or looser than the oracle, Origin's answer key.

**Other corrections in this wave.** Scoped edit claims ("an edit made without re-signing shows as VOID") on `/`, `/reference-check` and the explainer; scripted wording for the TR-A002 chip, the explainer, `/brief` and `llms.txt`; "independent(ly)" removed where it described Origin's own checks; the `/verify` example dates described as fixed sample values; the proving-ground account and research-page lane wording aligned with the absence of customer accounts and pilots.

**Release.** Wave 1 releases on its own once merged and green; the later waves release together.

## Wave 2 — the record states its result, and `/verify` re-runs it

**Record format 1.1.0.** Records made on `/reference-check` now carry an `evaluation` block inside the evidence digest. It holds:
- the battery and its version;
- the oracle version;
- the policy settings;
- the twelve decisions, each with the oracle's answer;
- a summary of matched, total, over-grants and misses.

The model and tool names a visitor types stay digests only. Miss and over-grant ids are computed from the rows, not stored. The builder writes a 30-day freshness window, and `issued_at` must equal the observed time. Format 1.0.0 records are still recognised and show "Result: not stated".

**`/verify` re-runs the grading.** For a 1.1.0 record, `/verify` rebuilds the policy from the stated settings, runs the shipped battery's oracle in the browser and compares every row. The stated result comes first, with each miss marked stricter or looser than the oracle.
- **Mismatches:** a record whose decisions, summary, settings, oracle version or battery do not match the replay is VOID, with the field named. This holds even when the record is re-signed with a new key.
- **Unknown battery or oracle:** if the page does not ship the stated version, the record is VOID and no counts are shown.
- **Trust:** records made in the browser stay UNTRUSTED, because no Origin signing key exists.
- **Order:** checks run structure, digest, signature, freshness, then replay.

**Freshness against the device clock.** `/verify` now checks a record's declared window against the device clock.
- A simulated record's window is capped at 30 days.
- A record dated more than five minutes in the future is VOID.
- A stale record still reports its digest and signature results.

**Other changes:**
- `/verify` opens or accepts a dropped `.json` file of up to 256 KB; nothing is uploaded or stored.
- "Load the published TR-A002 trace" runs the checks of `verify-tr-a002.mjs` and names the top-level fields that sit outside the hash chain.
- A static summary serves readers without JavaScript.
- The `/reference-check` link to `/verify#a=…` carries the record.
- Both pages configure analytics with a `page_location` that omits the fragment.
- Neither page uses browser storage.

**Decisions made during the build:**
- `/proof`'s script stays within its size budget: `src/proof/chain.ts` is unchanged, and `/verify` keeps a small copy of its shape check in `src/shared/publishedTrace.ts`.
- A file whose `final_digest` is the published TR-A002 digest but whose `artifact` is not `TR-A002` is VOID, with the line "artifact is not TR-A002, but final_digest is the published TR-A002 digest".
- A record that declares its freshness status as "stale" or "unknown" is VOID with its own headline, and its counts are hidden.
- This wording was added during the build and approved with it:
  - plain words for each replay field that can fail;
  - "{id}'s stated oracle answer is {stated}; the oracle gives {replayed}";
  - "deny: this record grants no execution authority";
  - "issued_at: must equal completeness.freshness.observed_at";
  - the "hash chain" label;
  - the `amount_usd` tamper note.

**Release note.** Records downloaded from /reference-check before this release (schema 1.0.0) carry a 24-hour window. /verify now checks it against your clock, so one more than a day old reads VOID for freshness only; its digest and signature lines still pass. Run the reference check again for a record that states its result.

## Wave 3 — reference-check clarity

**Inputs and the record fields that bind them.** Each step on `/reference-check` names who supplies its input and the record field that binds it.
- **The visitor's typed configuration** is bound as digests: `subject.model_digest`, `subject.tools_digest` and `proposal.input_digest`. The record stores only those digests, as in Wave 2, not the typed text.
- **The battery and the oracle** are Origin's. They are named by `subject.environment_digest` and `subject.verifier_version`.
- **The policy settings** are in `evaluation.policy_parameters`, with their digest in `subject.policy_digest`.

Requests and expected answers agreed with a reviewer before a run are described only with the site's existing tag "Proposed — not built". No copy says that a record is co-signed, because nothing co-signs a record today.

**Miss direction.** The IAM "Least-privilege (recommended)" preset is kept.
- Every miss in the results table says whether the policy answered more strictly or less strictly than the oracle, Origin's answer key.
- A summary line counts both kinds of miss. Over-grants are counted separately.
- A legend under the table defines the oracle, the three decisions, "stricter" and "looser", and over-grants.
- A note says that the record's `authorization.verdict: deny` means the record grants no execution authority.

**Tier labels removed.** The L0–L4 tier label no longer appears in the `/reference-check` result, in the `/security` log or in the home demo's grading panel. Over-grants are counted on their own, and matches elsewhere do not offset them. `src/license.ts` is unchanged. The recordings stay byte-identical. The shot04 recording on `/reference-check` was made before these changes, so it gets one dated line under it, outside its caption: "Recorded 2026-09-28; the page has changed since."

**Other changes:**
- After a run with the Least-privilege or Moderate preset, "Try the permissive baseline" grades the same requests with every safeguard off, in one click. It keeps the typed configuration and moves focus to the new result. It is not offered for a hand-set policy, so a visitor's own controls are never overwritten.
- A static summary of what the page evaluates serves readers without JavaScript; the app replaces it when it loads.
- "Synthetic pilot battery" becomes "Synthetic demo battery", because there is no pilot.
- The step hints name what each panel binds, and the step 04 hint scopes VOID to an edit made without re-signing.

**Wave 3, as built and approved.** The owner approved four details of the merged Wave 3 page as built:
- Panel 02 says the record lists each expected answer in `evaluation.decisions` but does not hash the oracle's code. Since Wave 2 the record carries those answers under its digests, so the earlier wording, "not hashed into the record", no longer held.
- The "Try the permissive baseline" button and its hint sit in their own block at the end of the result card.
- The hint keeps "so you can compare its over-grants with this result", even though the click replaces that result.
- The button is offered only after a Least-privilege or Moderate run, so it never overwrites a policy set by hand.

Two traces of the legacy credential's tier stay out of scope: the `/verify` check line for a Crucible credential, and the raw `rsl_level` field in that credential's JSON. The credential format is unchanged.

## Wave 4a — home, explainer comparison and navigation

**Home.**
- **Headline:** stays "Test the policy. Inspect the evidence."
- **Maturity line:** unchanged.
- **Eyebrow:** now names the buyer's moment: "For teams whose AI agent is waiting in security review".
- **Sub-heading:** says what the demo does and what the record holds: "See which of 12 fixed synthetic requests a selected agent policy allows, denies or escalates, graded by deterministic code against Origin's answer key, not a model. The record, signed by a key your browser makes for that run, states the result, and your reviewer can re-run the grading in their own browser."
- **Intro link:** relabelled "What works today vs. proposed"; same target.

**Comparison, by category only.**
- **The sections:** the home `#problem` section gains one paragraph, and the explainer gains a section, "Beside the tools you already use". It describes CI test suites, evaluation platforms, policy engines and gateways, and third-party assessors, and says to use the reference check next to them, not instead of them.
- **No vendor names:** review keeps vendor names off the site. There is no lint rule for them, because such a rule would publish the list.
- **"Origin today":** the explainer's last item says what Origin does now. Your agent is not run. The signed record states the result, and `/verify` re-runs the grading. Browser-made records verify as UNTRUSTED.
- **No future item:** an item describing records signed with a published Origin key is not published. It waits until such a key exists.
- **"Product distinction":** the explainer's "Product distinction" paragraph is replaced by the new section.

**Navigation.**
- **The label:** the header link to the proving ground keeps its place and target and reads "Labs: Proving Ground" on every page. That marks the one robot simulation in the header as a Labs page.
- **`/proof` and the explainer:** both now load the site's navigation script. They get the same compact mobile header as the other pages, and their inline no-JavaScript header fallback is removed.

**`/trust` scoreboard.** On phone widths, the gate scoreboard no longer breaks a result one character per line.

**Wave 4a, as built and approved.** The owner approved the merged Wave 4a pages as built, including five points the review raised:
- "An edit made without re-signing shows as VOID" stays the site's scoped phrase in the home comparison and in "Origin today". `/reference-check` and `/verify` state the caveat that the signature-block labels are not signed.
- A browser-made record verifies as UNTRUSTED within its freshness window. After the window, `/verify` shows VOID for freshness, and the new copy does not repeat that.
- The explainer keeps "Third-party assessors test your agent and report to your customer's reviewer."
- The home comparison paragraph keeps its re-check sentence, though principle card 03 says much the same.
- Without JavaScript, anchor links on `/proof` and the explainer land under the fallback header, as on `/trust`.

The owner also approved two changes made during the build:
- **The burger without JavaScript:** `/proof` and the explainer each carry one inline rule that hides the header's button box when JavaScript is off. Without it, the shared stylesheet would show a menu button that does nothing. The other pages still show that button without JavaScript; fixing them needs a shared-stylesheet change in its own pull request.
- **The lint's module walk:** honesty-lint now follows side-effect imports (`import './x'`, stylesheets excluded), so the video band and cinematic modules are scanned.

## Wave 4b — offer terms and contact lines

**The offer states its terms.** The offer is an Agent Evidence Review, and the button keeps the label "Book an Agent Evidence Review". The home `#offer` section, the `/trust` closing, `/proof` and the `/reference-check` Book card now describe it:
- what to bring: one action your agent would take;
- what you receive: a short written report naming the cases your reviewer would need to see and the evidence still missing;
- what it does not include: no record of your agent's decisions can be produced today, and any record attached is a browser reference check of a selected example policy, which rates UNTRUSTED;
- the terms: a 45-minute review session and no charge, with a reply within 2 working days.

Two lines appear on some of these pages only:
- The home `#offer` section adds "Not a guarantee of approval.", which repeats the line `/trust` already shows near its top.
- `/trust`, `/proof` and the `/reference-check` Book card say to send nothing confidential, because no data agreement is in place yet.

Any fee is a later decision.

**Contact.** The address `bohueilin@originphysicalai.com` appears as plain text and a mailto link on `/`, `/trust`, `/proof` and the `/reference-check` Book card, and the first three show it without JavaScript.
- **Copy control:** on the first three pages, a "Copy address" control appears only when the browser offers a clipboard. It is styled as a text link, so each section keeps one filled action. It sends nothing to analytics.
- **`/reference-check` Book card:** its heading now reads "Need more than this browser demo?", because the review produces a written report, not an evaluation. Its Book link goes to the offer.

**Lead dialog.** The dialog's note no longer says leads are stored with a database provider. It now reads "Sent over TLS to Origin; see the privacy policy. No spam.", with a link to the privacy policy.

**Before release.** Before the release that ships this wave, the owner sends one test message to the address from an outside account and confirms that it arrives. No page claims tested delivery.

**Wave 4b, as built and approved.** The owner approved the merged Wave 4b pages as built, including nine points the review raised:
- The `/trust` and `/proof` copy control has the link colour and weight 600, with an underline only on hover, matching the home control so the address link and the button read as two things.
- The home `#offer` section and the lead dialog do not repeat "send nothing confidential"; `/trust`, `/proof` and the `/reference-check` Book card do.
- Without JavaScript, `#offer` offers "Or email …" after the brief link.
- The full stop follows the copy button.
- The Book card keeps its earlier hint beside the new summary.
- The `/proof` offer summary has no label.
- `llms.txt` and `/brief` keep their wording for now.
- The dialog's privacy link opens in the same tab.
- The copy handler stays delegated.

Two fixes made after the review were also approved:
- the home copy button keeps its width while its label changes, so a second tap lands on it;
- the analytics test now checks every `dataLayer` entry after the page settles.

## Wave 5 — Labs

**Collision events are counted.** `/simulation` and `/operations` count collision events from the frames: the first tick at which a pair meets each of these conditions:
- two robots share a cell, including a finished robot that stays parked;
- two robots swap cells;
- a robot and the human marker share a cell;
- a robot and the human marker swap cells.

A pair that stays together counts once, and counts again only after it has separated. The count is shown as measured.
- **`/simulation`:** a counted event moves the run to ESCALATE. The default run counts one event, a robot and the human marker swapping cells, so it reads ESCALATE.
- **`/operations`:** a shift with a counted event fails its targets at tier L0. The default shift counts none.
- **Page descriptions:** they no longer say "collision-free".
- **Share images:** they are unchanged, so their eyebrows no longer match the new Labs kickers.

**Proving ground.**
- **Tier label:** the page no longer shows a tier label, and the result still grants no deployment permission.
- **The signed record:** it is renamed from `fleet-readiness-credential` to `synthetic-floor-evaluation`. It drops `autonomy_earned` and the tier field and gains `evidence_lane: synthetic-demo` and `execution_mode: simulated`. It also lists the wall, hazard and human-only cells (`site.wall_cells`, `site.hazard_cells`, `site.human_only_cells`) for readability; the site digest already binds the floor, and robot positions are never added. The template floor's pinned digest moves by design; its verdicts do not. Records downloaded earlier still verify.
- **Reading guide:** a static "How to read the result" section uses one scorer name, "the oracle", and one set of verbs: finish, refuse and escalate.
- **Hero:** the scope note is shorter.

**Labs pages.**
- **Kickers:** each Labs page's kicker names it as an Origin Labs experiment, and its scope note says it is not the product.
- **Reading guides:** `/simulation` and `/operations` each gain a static "How to read the result" section.
- **`/labs` cards:** the proving-ground card drops the tier wording, and the warehouse card describes only what the scene does.

## Wave 6 — the dating rule

`apps/origin-web/DESIGN_PRINCIPLES.md` gains a rule: a date on the site records when something happened, and it changes only when that thing happens again. No date is stamped by hand. The home gates strip and the `/trust` scoreboard refresh only through a release the owner dispatches, which re-runs the gates and stamps the deployed copy of the gates summary; nothing is committed back.

## Pass 2, Phase 1 — rendered defects and precision

The owner asked for a second pass that fixes rendered defects first, then adds explanatory figures. Phase 1 changes no evidence file, recording or share image.

**`/trust` scoreboard.** Four rows ended mid-phrase because `scripts/gates-all.sh` cut a suite's summary line at 70 characters. It now keeps the whole line, capped at 300 characters at a word boundary. Snapshots stamped before this change still hold the cut lines, so the page restores those four endings from what the deterministic verifiers print for the byte-preserved inputs, marks each restored ending with † (and a screen-reader note), and says so under the table. A release stamp made after this change carries whole lines, so nothing is restored. Detail cells wrap at every width.

**Recordings.** The recording files stay byte-identical. Their captions are burned into the picture, so the frame changed instead: a dark tray under the picture holds the native player controls, at least 48 px below the burned-in caption, and the frame's width is capped so the whole frame fits under the header on a laptop screen. Each caption is now a provenance bar: the "Recorded" pill, one summary line ("Recorded 2026-09-28 (57d5ccf) · one continuous take · synthetic demo data") and the existing detail text in a smaller size. Every word of the boundary is kept. The dated line under shot04 now says what changed: "the page has changed since (L0–L4 tier labels were removed and the record now states its result in format 1.1.0)".

**Hero spacing.** `/proof` and `/labs` place the hero eyebrow 56 px below the header, as `/reference-check` and `/verify` do, using page-local styles.

**Lab illustration.** The image shows a fictional person holding a tablet and a mobile robot. The alt text and caption now say so ("fictional person and mobile robot") and no longer call the person a researcher. The crop now anchors both images to the right, so both stay in frame at the widths checked (375, 430, 768, 1024, 1280, 1440 and 1919 px) and the caption matches what is on screen.

**`/app`.** Its three scenarios are scripted walkthroughs. "Origin blocked it" becomes "In this simulated scenario, the scripted proxy marks it blocked — and the block is recorded in this scenario's audit chain." The page computes no hashes, so it says "this scenario's audit chain", not "hash chain". "Simulated / sandbox data" becomes "Simulated scenario data (scripted)", and side-effect lines say no sandbox ran. A short "How to read these scenarios" section sits under the H1. These head edits are approved by name: the description, `og:description` and `twitter:description` meta on `/app`. `/proof` and `/reference-check-vs-runtime` link to it ("Walk three scripted agent scenarios (/app) →").

**`llms.txt`.** The settled four-beat maxim for the implemented flow ("Model proposes. Environment verifies. Gate decides. Trace proves. Capability is not permission.") now sits with the implemented workflow. The five-beat line under "Proposed architecture" is removed; the settled decision allowed it there but did not require it. It gains the site's offer limit: "No record of your agent's decisions can be produced today; any record attached is a browser reference check of a selected example policy and rates UNTRUSTED."

**`/brief`.** It states the offer terms in the home `#offer` wording, adds "Send nothing confidential: no data agreement is in place yet." and the TR-A002 line "The hash chain is real; the story it tells is scripted." Its dateline reads "September 2026 (revised November 2026)", which records when the brief was revised, as the dating rule requires. It still prints on one page.

**Home offer.** `#offer` and the lead dialog's introduction say "Send nothing confidential: no data agreement is in place yet." The dialog's privacy-policy link now opens in a new tab and says so to screen readers; this replaces the Wave 4b same-tab choice.

**Labs pages.**
- `/operations` adds: "Tiers L0–L4 score this seeded warehouse shift only; the agent reference check and the robot proving ground do not use tiers."
- `/simulation` shortens its note to the required phrases and points to "How to read the result". The "collision events (counted)" tile label wraps to two balanced lines on phones.
- `/labs` card 03 says: "Collision events, including with a finished robot parked in its cell or with the human marker, are counted from the frames."
- `/foundry` gains a "How to read this page" section after its H1 and links to `/labs`, `/proving-ground` and `/reference-check`. Its title highlight is forest green.

**Header without JavaScript.** The "Run reference check" pill is centred at 375 px.

**`docs/ARCHITECTURE.md`.** Lines that no longer match the site are corrected, product and vendor names are replaced with categories, an absolute claim that the graders cannot be gamed and the word "safe" are removed, and "license" outputs read "evidence record".

**Lint.** A "Pass 2, Phase 1" block in `scripts/honesty-lint.mjs` forbids "Origin blocked it" and "Simulated / sandbox data" on `/app` and "researcher" in the lab caption on `/` and `/labs`, and requires the four-beat maxim in `llms.txt` and the no-confidential-data line on `/` and `/brief`.

## Pass 2, Phase 2 — explanatory figures

Phase 2 adds static figures, so a visitor who does not click can see what each page's check or experiment does. Every figure is still, uses paper, ink and the one forest-green accent, and keeps rendered text at 12 px or more at 375 px. Each number, field name and count in a figure comes from the code or the published data. Most figures are semantic HTML (real text in lists and definition lists) with decorative SVG connectors, which keeps the text readable, wrapping and available to screen readers; the `/labs` card diagrams are small decorative SVGs.

**Home, section 01.** An annotated five-stage figure (Bind, Challenge, Grade, Attest, Reverify, the pinned tab names) sits above the walkthrough. Each stage names what the record really holds: the `subject.*` digests and `proposal.input_digest`, the 12-request synthetic battery, the oracle's verdict words, the record format 1.1.0 signed with a key the browser makes for that run, and `/verify` re-running the grading with an UNTRUSTED rating. Each tab panel gains a small schematic of its stage; the Grade example is one real run (support battery, Moderate preset: 8 of 12 match, 2 misses, 2 over-grants). The walkthrough keeps one height across stages. Under it, a boundary line: "No design partner, no pilot, no paying user — today. Everything here is synthetic or scripted and checkable in your browser; see What Origin is not ↓". Over-grant marks are drawn in ink, because a static figure is not a real check.

**`/reference-check` and `/brief`.** A smaller copy of the five-stage figure orients `/reference-check` above the tool; its four-step strip stays. Under the shot04 recording, a comparison of two presets on the synthetic battery, from the oracle: the permissive baseline matches 4 of 12 with 6 over-grants and 2 looser misses; the least-privilege preset matches 12 of 12 with none, because its settings apply the oracle's own rules. An annotated row (a refund above the auto-cap) explains match, stricter or looser miss, and over-grant. `/brief`'s five-step strip becomes the same figure and still prints on one page.

**`/proof`.** The TR-A002 introduction opens with "The hash chain is real; the story it tells is scripted. Here is what each part shows." A ladder figure in the hero shows each rung's provenance, what is computed and what it does not establish; TR-A003 is dashed and holds no data. Event 11 is framed in ink with the badge "Event 11 · turning point (scripted block in chain)". Scripted events no longer use refuse or status colours.

**`/verify`.** A reproduced 1.1.0 result reads as a scorecard. Every numeric code is shown with its format's name ("Origin Attestation code 1: payload tampered"), and a short guide says, per format, what VALID and VOID mean and which codes it uses. The shot01 caption names the format on `/` and `/verify` alike.

**`/over-grant` and `/security`.** Figures draw the recorded run: the share of granted scopes never exercised, and a delegation tree before and after one edge is widened (the root's reach goes from 5 of 9 sensitive resources to 6 of 9), with the planted-edge result. Each of the six `/security` experiments states how it works and what it shows. Card 02 reads "Each checkable alone".

**Explainer, `/labs` and `/trust`.** The explainer's posture figure shows four solid "runs today" steps and five dashed "proposed, not built" steps, and its code line names each format. Each `/labs` card has a small diagram of its experiment. `/trust` and `/labs` link to `/security` and the explainer. "Session-signed", "unpinned" and "opaque lease handle" are glossed in plain words where they first appear.

**Lint.** A "Pass 2, Phase 2" block requires the home boundary line and the `/proof` landing line, and forbids "Each provable alone" on `/security`.

## Pass 2, Phase 3 — proving ground, fleet colours and print

**Editor layout.** From 1024 px wide, the floor header, legend and readout dock beside the 9 × 9 grid, and the fleet cards sit beside the placement tools, so the editor card no longer leaves an empty right half (at 1280 px the grid's row went from 56% to 98% of the card's width). The robot-types panel sits under the editor at those widths, matching its place in the markup. Phones keep the stacked layout, and every cell stays 44 × 44 px. The oracle, the template floor and the scored output are unchanged.

**Inspect control.** "Inspect the result" now comes after the playback, in the markup and on screen, so the steps read in order: draw the floor, watch the playback, inspect the result.

**Fleet colours.** One palette in `src/proving-ground/fleetPalette.ts` serves the editor, the 2D playback and the 3D scene: Fleet 1 forest `#2b523b`, Fleet 2 ochre `#8a5200`, Fleet 3 plum `#6940a3`, Fleet 4 rose `#9d2e68`, Fleet 5 umber `#4a4238`, Fleet 6 olive `#525e2c`. Each holds at least 5.9:1 on the paper ground, and white on each holds at least 6.3:1. The former teal and blue fleets, the 3D scene's blue Fleet 1 and its teal and blue props are gone; the 3D legend gains a swatch per fleet. In 3D the robot bodies are matte and skip the scene's film curve, which had crushed these dark colours to near-black; an AMR's top deck is its fleet colour, and the robots' dark parts are ink rather than navy. At 1280 × 720 an AMR's deck renders close to its swatch (colour difference ΔE2000 at most 8.4), and the two closest fleets, forest and olive, stay at least 8.5 apart on every robot type measured.

**2D playback.** It carries the editor's axes (columns A–L, rows 1–9) and the same cell geometry. On phones it scrolls sideways in a named, focusable region with the row numbers pinned, as the editor does, instead of clipping columns. A robot's name (code and fleet, such as AM4 F1) sits on a paper backing in the cell beside it, above first, joined to it by a short line in its fleet colour. That cell holds no robot, mark or other name, and no other robot touches it, so a name never covers anything and reads as one robot's. When no side is free, the name is printed in white inside the robot's own cell, so every robot is always named, on screen and to a screen reader. In forced-colours mode each robot keeps its fleet fill and gains a ring in the theme's text colour, so it never looks like empty floor.

**Print.** `/proof` and `/trust` print black on white with no background fills, hide navigation, buttons, recordings and other interactive parts, keep headings with what follows them, and print the TR-A002 digest in full where the page shows it in full. Status dots and ladder rails print as borders, so they survive printing without background graphics. The printed TR-A002 event list leaves room for its two-digit numbers.

**Tests.** `motion.spec.ts` now also covers `/trust`, `/labs`, `/brief` and the custom 404 page. `src/proving-ground/fleetPalette.test.ts` pins the six colours and their contrast.

## Pass 2, Phase 4 — verification sweep

A sweep of a production build at 1919, 1280, 430 and 375 px checked the seven validation gates across 16 routes. They are the `/trust` scoreboard, the recording captions, the hero spacing, the lab caption, wording drift, every route's heading and frame, and phone overflow. One drift remained: `/foundry`'s "Evidence boundary" still described the flow in the five-beat form ("the environment executes … the deterministic verifier evaluates …"), which the settled decision keeps for the proposed controlled path. It now reads "Within its lane the deterministic environment verifies each plan, the gate decides, and the trace records the result." A "Pass 2, Phase 4" lint block forbids the old sentence.

## Pass 2 follow-up — polish after the outside review

After Release 4, an outside review and a pre-send verification found no false or misleading statement and recommended five follow-ups. All five ship here.

**Blue removed from the shared stylesheet.** `public/home.css` no longer holds any blue. Four rules used `#5f86ff`, two of them as gradients: `.meter__fill`, the `.walk__tab` underline, `.walk__progress-fill` and `.walk__mode.is-active`. They now use solid forest green, and no page renders them. Nine rules used a pale blue border, `#bcccff`, and three a blue ring, `rgba(42,86,232,…)`. They now use the neutral `--line-2` line (a checked box uses `--control-selected-line`) and a forest-green ring. One of these renders on a page: the home walkthrough's "Challenge" tag, whose border is now the neutral line. The stylesheet's version line changes on every page, including the legal pages and `404.html`; that line is approved. Blue set in a page's own inline styles (`/simulation`, `/foundry`) is outside this change.

**The `/reference-check` comparison names its battery.** Under the two preset cards: "Scores above are for the customer-support synthetic battery (support-gym-v1); on the IAM battery (iam-gym-v1), Least-privilege matches 11 of 12 (1 stricter miss) and Permissive matches 3 of 12." The numbers come from the oracle.

**One over-grant mark.** The interactive results table showed over-grants with the ⛔ emoji, which renders red. It now uses the same monochrome ink mark as the static figures, followed by "over-grant". The recordings do not show this table, so they are unaffected.

**The home walkthrough on phones.** The walkthrough keeps one height across its five stages, so Play never shifts the page; on phones the tallest stages are now laid out more tightly. At 375 px the shared height drops from about 1,046 px to about 898 px, and the largest empty space under a shorter stage from about 285 px to about 208 px. No text or type size changed, and wider screens are unchanged.

**`/brief` in print.** In print only, the five-stage figure hides its record-field codes and one caption phrase about them, so its text prints at 10.5 px or more instead of 9 px. The brief still prints on one page at A4 and Letter, and the screen is unchanged.

## Release 6, Phase 1 — no blue, one fleet palette, no scroll-started motion

**No blue or teal in served code.** The Style Lock allows one accent, forest green `#2b523b`. This phase removes the blue and teal that remained:
- **`src/App.css`:**
  - `.btn.primary` painted a blue-to-green gradient on the React pages' primary buttons (for example `/capture`). It is now flat forest green, `#203f2d` on hover.
  - Every other gradient and blue or slate tone in the file is now a solid Style Lock token.
  - Its header comment now states the Style Lock.
- **The passport, account, sign-in and support-form styles:** blue focus rings, buttons and hovers are forest green; focus rings stay 2 px. The passport agent avatars and step chips drew navy and teal from a per-agent hue; they are now neutral, with a forest ring on the active agent and no glow.
- **Pale-blue borders** on home, `/trust`, `/app` and `/foundry` use the neutral line.
- **`/foundry`:** its trail tint is now sage. The human-only tint is a lighter plum, `#9a7bc6`, so the caption's "purple gate" stays true; it holds 3.34:1 on an empty floor cell.
- **Keyboard focus:** controls that had no ring of their own showed the browser's blue one. `/foundry`, `/soc`, `/passport`, the `<summary>` toggles on `/capture` and `/app`, the Labs skip links and the recorded-demo players now show a forest ring on paper and a light ring on dark panels. The players' frame carries the ring, because the frame clips the video's own. The `/foundry` consent checkbox fills forest green. On the graphite verify strip of `/proof`, every ring is the on-dark tone: the forest ring measured 1.6:1 there.
- **The research dashboard** (`/rsi/rsi_dashboard.html`) maps its cool greys and blues to the site's neutrals. No text or data changed.
- **The licence-level colours** in `src/license.ts` are now steel, plum and olive.
- **The proving-ground verdict dots** use the site's verify, warn and danger tokens.

Third-party brand marks (Google, Coinbase) keep their own colours. `src/factorydad/` is an unserved prototype: it gains a README saying so and stays outside the scan.

**One fleet palette.** The six fleet colours move to `src/shared/fleetPalette.ts`. `/simulation` and `/operations` now draw their robots in the same palette as `/proving-ground`: forest, ochre, plum, rose, umber and olive. This replaces a blue and a teal robot. Their canvas floors, shelves and stage backgrounds are warm paper and stone, the dock is forest green, and the proving-ground 3D background is warm stone. Only colours changed; the simulations compute the same results.

**No scroll-started motion.** The home walkthrough already moved only when a visitor clicked Play, Prev, Next or a stage. Code that started motion on scroll or load, and that no page uses, is removed:
- an older walkthrough's scroll observer;
- a scroll-triggered step highlight;
- a `[data-video]` block that started a film on load;
- the unused `videoBand.ts`.

The home hero film and its script are unchanged.

**Tests.**
- A unit test fails if any served source holds the named blue values or builds a colour from a hue variable.
- Browser tests check, on six pages:
  - the primary buttons are flat forest green;
  - nothing paints blue or teal;
  - on `/foundry` and `/proof`, every keyboard focus ring is solid, at least 3:1 on its ground and never blue, and the consent checkbox is forest green;
  - the robots wear the fleet palette;
  - the walkthrough stays on Bind while scrolled into view until a visitor presses Play.

**Noted, not changed here.** The Labs playbacks on `/operations` and `/proving-ground` (2D and 3D) start playing when they scroll into view. Changing that alters three pages' behaviour, so it is left for the owner to decide.

## Release 6, Phase 2 — the receipt in the hero, one five-stage walkthrough, two-column tool heroes

**Home hero.** The hero film, its caption's "AI-generated illustration" disclosure, the H1 and the maturity line are unchanged. The hero's visual column now also shows a static card, "What the check produces", with one real graded row and the record strip:
- **The row:** `sup-02` · Refund $450 (over the $100 refund cap). The Permissive policy allows it, the oracle escalates it, and the verdict is "△ miss (looser)".
- **The strip:** Action/Run record 1.1.0 · 12 decisions re-run on `/verify` · UNTRUSTED (browser-session key) · VOID if edited without re-signing.

The film caption now says that, unlike the illustrated scene, this result is real reference-check output that can be re-checked in the browser. The request quoted a "$250 cap"; that belongs to the scripted `/app` scenario, while the reference check's cap is $100, so the card uses $100.

**One five-stage walkthrough.** Section 01 showed the five stages twice: a figure, then the tabbed walkthrough. They are now one component:
- **The tab strip is the stage strip.** It shows each stage's number, name, a one-line note and the record field it touches. The figure's other facts moved into the panels. The five stages sit in one row from 1024 px; below that the strip is a list and each field shows in its panel. Measured: from 900 to 1023 px the longest name, Challenge, squeezed its connector to 2–14 px and `subject.environment_digest` broke inside the identifier.
- **Two-column panels.** From 900 px each panel splits about 52/48: the stage's question and prose on the left, its schematic and readout on the right.
- **Less empty space, no movement.** The panels' content heights are balanced, so no stage leaves more than about 4% of the panel empty at 1280 and 1919 px, or about 12% at 375 px. Moving between stages, or pressing Play, still moves nothing below.
- **The human case.** Stages 1 and 2 open on it: "A $450 refund over the $100 refund cap: should the agent proceed, refuse, or hand it to a person?"
- **A three-beat strip.** Under the walkthrough, beside the boundary line: your agent waits on approval → you run the check in your browser → your reviewer re-runs the grading and sees UNTRUSTED or VOID. It links to `/app` and says that this is another case: "A separate scripted scenario: walk a $480 refund over a $250 auto-cap on /app". Without that, $480 next to the walkthrough's $450 read like a typo.

**Tool heroes.** From 960 px, `/reference-check`, `/verify`, `/over-grant` and `/security` open as two columns: copy on the left, a static specimen on the right. On phones the specimen follows the copy.
- **`/reference-check`:** the `sup-02` decision and what `input_digest` binds.
- **`/verify`:**
  - a 1.1.0 report specimen: 4 of 12 match, 6 over-grants and 2 misses (Permissive, support battery); UNTRUSTED when intact, VOID when edited;
  - a labelled preview in the result card before anything is verified.
- **`/over-grant`:** a drawn meter of the recorded run: 8,675 scopes granted, 3,194 exercised, 63.2% never exercised. The names and numbers are HTML rows above the bars, so at 320 px, or with wider text spacing, a number wraps under its name instead of printing over it.
- **`/security`:** an index of the six experiments, with "Start here: 04 or 05".

`/proof` gains a TR-A002 card under its hero buttons: 12 scripted events, a SHA-256 hash chain, the final digest prefix and the re-check commands. Like the page's full block, it downloads the published JSON (`curl -sO https://originphysicalai.com/proof/tr-a002.json`) before running `node scripts/verify-tr-a002.mjs tr-a002.json`, because a fresh clone has no `tr-a002.json` in `apps/origin-web`.

## Release 6, Phase 3 — re-recorded demos, drawn figures and precision

**Re-recorded demos.** The three recordings (`/verify`, `/over-grant`, `/reference-check`) were re-recorded on 2026-11-15 against the live Release 5 site (`49b5cd0`), with the repository's own recorders. Each is one continuous take on synthetic data, with only first-party and Google Fonts GET requests allowed, and passes the recording contract.

**Captions.** The old renderer drew a full-width top band and large caption bars over the recorded interface. Now:
- one small "RECORDED · ONE TAKE · SYNTHETIC DATA" pill sits in a corner for the whole take;
- at most one compact caption bar shows at a time, anchored near the bottom of the picture, at most 78% of the frame wide, with nothing at 0:00 but the pill;
- the site's player tray keeps the native controls below the picture.

Release 5 fills the `/verify` field from the link, so the `/reference-check` recorder now checks that the record the link carries matches the download, clears the field and requires it empty, then pastes the download and requires the field to match it. The edit drops the "Loaded from a shared link" note, so the verdict is for the pasted file.

The dated note under that recording says what has changed since: Release 6 adds a hero specimen to `/reference-check` and `/verify`, and a preview to `/verify`. The superseded 2026-09-28 files are removed.

**Provenance.** Each recorded figure shows a one-line summary ("Recorded 2026-11-15 (49b5cd0) · synthetic demo data") with the pill. A "Full provenance and limits" disclosure holds the remaining sentences, word for word; it is a 44 px target with the site's focus ring.

**Two trees, named apart.** The "5 of 9 → 6 of 9" reach figures describe two different trees:
- the recorded seeded run on `/over-grant`, where `agent-000.0.0` gains `payroll:read`;
- the interactive six-identity tree in `/security` experiment 05.

Each is now labelled as its own tree. "BRI" is spelled out where it is defined: blast-radius index, the share of the 9 sensitive resources an identity can reach.

**Precision fixes.**
- **`/security`** says where to start (experiment 04 or 05). Experiment 04 now explains its 11 of 12: `iam-06` is a stricter miss, and 12 of 12 would mean grading the answer key against itself.
- **`/verify`** opens its workspace with one line on what the page checks and what its result does not establish.
- **`/reference-check`** gives the IAM Moderate score (8 of 12, 3 over-grants, 1 looser miss). It also tells readers without JavaScript that the comparison and the annotated row show the tool's results on the support battery.
- **`/simulation`** explains that in a deadlocked run each repeated pass of the human marker through a stopped robot's cell counts as a new collision event.
- **`/operations`** labels its chip "target: collisions = 0", and its reading guide says the wave caption reports the counted events.
- **`/capture`** names the score's three weighted terms (map confidence 45%, label coverage 35%, trace completeness 20%). It calls the trace digest what it is: a 32-bit checksum that does not cover the tasks or the versions. Its footer says a floor-plan image you add is sent to Origin's parse endpoint, which refuses it on the public site.

**Framing and links.**
- `/capture` gains a static H1 and a "How to read this page" frame. Its flow strip uses the four-beat maxim, and the page links to `/labs`, `/proving-ground` and `/reference-check`.
- `/foundry` and the research dashboard scope their line as "In this lab: Gemma proposes; Origin's verifier checks". A lint rule forbids presenting the old line as the site's maxim.
- `/trust` and home section 01 link to the explainer.
- `/trust` tells readers without JavaScript where the release's gate summary is. It gives no fixed suite count, which could drift.

**Drawn figures.**
- `/proof`'s ladder has SVG nodes, rails and a dashed outline for the unearned rung.
- `/over-grant`'s bar and delegation figures are drawn in SVG, with the facts kept as text. In forced-colours mode they take system colours, as `/proof`'s ladder does.
- The six `/labs` diagrams are named images with descriptions.
- `/brief` prints its boundary and contact lines at 10.5 px and still fits one page.

## Release 6, Phase 4 — proving-ground editor, fleet counts and the 3D view

**Editor from 901 px.** The docked editor now starts at 901 px instead of 1024 px. Before, from 901 to 1023 px, the grid scrolled sideways inside a narrower column (111–180 px of it hidden), and the legend was not beside it.
- The legend and the new fleet counts form one column beside the grid.
- The readout sits directly under the grid, 16 px below it, however tall the column grows.
- The floor header spans the top until 1099 px and joins the column from 1100 px. The readout joins the column, last, from 1240 px.
- From 901 to 1099 px the card and panel padding shrink and the docked text is 13 px. Every cell and control stays at least 44 px.
- Phones stack the parts in markup order: header, legend, counts, grid, readout.

The oracle, the template floor and the scored output are unchanged.

**Robots by fleet.** Beside the grid, each fleet's robots are listed in words, from the live floor:
- "Fleet 1 (forest): 2 robots — AMR";
- a mixed fleet: "Fleet 1 (forest): 4 robots — 3 AMRs, 1 humanoid";
- an empty fleet: "Fleet 3 (plum): no robots, scored as robot dog". The oracle still scores an empty fleet as its own type.

The lines use the same per-fleet counts as the fleet cards and update with every edit. The colour names sit next to the colours in `src/shared/fleetPalette.ts`, and the palette test pins them.

**3D view.**
- **Camera.** It now fits the floor instead of leaving it in the middle third of the canvas.
  - The default view is 48° above the floor and 37° round from its front edge. The old view was about 36° above the floor.
  - The floor fills 70% of the canvas's binding dimension: its height on a desktop canvas, its width on a phone.
  - The whole scene stays at least 2.5% inside every edge: racks, props, people, boxes and each robot's route. Where tall racks on a small floor cannot fit at 70%, the floor fills less instead of the racks leaving the frame. On desktop, a few small rack floors (narrower than 10 columns and 4–8 rows deep) fill between about 0.5 and 0.65; a 4 × 4 floor whose back row is all racks fills 0.49.
  - The view re-frames after a floor resize, and after a canvas resize until the visitor first turns or zooms it.
  - The orbit pivot sits on the floor, so turning the view never takes the camera below the floor.
  - The fog follows the framed view, so robots on a phone are no longer washed out, and zooming out stops before the scene fades.
- **Colour.** The ground, grid lines, floor tints and props are warm stone and sage; no grey-blue remains. A new front fill light, a brighter warm sky light and a stronger sun light the robots, with no emissive material.
  - Before the camera change, robot front faces moved from 12–22 ΔE2000 from their fleet colour to under 2.5. The closest pair of fleets, forest and olive, went from 8.8 to at least 11.3 apart.
  - In the final view an AMR's deck renders within 3.0 of its swatch on desktop and on a phone. The Pass 2 record allowed 8.4.

**Tests.**
- `r6-p4-pg-layout.spec.ts` covers the docked layout at 901–1239 px with the starter floor, six fleets, a 12 × 4 floor and a mixed fleet. It checks the readout under the grid, the count wording after edits, the 1280 px column and the phone order.
- `r6-p4-pg-3d.spec.ts` checks:
  - the floor fill (0.65–0.75) and the whole scene in view, on load, after a resize and on a shallow rack floor;
  - warm ground and background;
  - the floor still drawn at the lowest angle;
  - an AMR deck's colour.

The canvas publishes the projected floor corners, scene box and AMR decks as data attributes for these checks.

**Not changed.** The 3D playback still starts when it scrolls into view, as noted in Release 6, Phase 1. On a phone the 3D canvas keeps its 520 px height, so a floor fitted to the canvas's width leaves space above and below it.

## Release 6, Phase 4 follow-up — tap targets on a phone (Gate 7)

The Release 6 sweep's seventh gate checks every visible interactive target at 375 × 812. On `main` after Phase 4 (`4be6677`), 181 targets on the sixteen public routes were under 44 × 44 CSS px. Most were shared pieces: the header and footer brand links, the footer's Privacy and Terms links, the editorial "On this page" links, the hero link rows, the Labs robot-type chips and template buttons, the `/foundry` buttons, form fields, and 47 links inside running text. Now none are, at 360, 375 and 430 px.

**How.** Each rule applies on screens below 761 px only, so desktop and print are unchanged.
- **Boxed controls** take a real 44 px minimum: buttons, tabs, selects, fields, disclosures, the robot-type chips, the template buttons, the `/verify` file and checkbox labels, and the `/foundry` buttons. Narrow links in the header, footer and Labs nav are at least 44 px wide.
- **A link inside running text** grows its box with vertical padding. An inline box adds that padding without moving any line. Its 4 px sideways padding is cancelled by an equal negative margin, so the words stay exactly where they were. Links carry no background or border, so only the focus ring shows the larger box.
- The rules sit in labelled "Gate 7" blocks at the end of `public/home.css` (fourteen routes), `public/lab-shell.css` and `src/foundry/ui/foundry.css` (`/capture` and `/foundry`), `src/App.css` and `src/shared/product-workspace.css`. `npm run css:version:fix` rewrote the `home.css?v=` line in every entry, the two legal pages included (that line only), on the owner's instruction.

**Measured on a production build at 375 px.** Nothing scrolls sideways. The header stays 75 px tall on the thirteen site pages. Pages grow only where boxed controls grew, by 0–219 px (`/capture`, with its sixteen template buttons and ten chips, grows most). Layout shift measured 0 on all thirteen measured routes at 375 and 1440 px.

**Test.** `r6-p4-tap-targets.spec.ts` loads each of the sixteen routes at 375 × 812. It fails on any visible target under 44 × 44 and on any sideways scroll. A control wrapped in its label is measured by the label. A skip link that is 1 × 1 until focused is not yet a target. Without the new rules, the spec fails on every route.

**Separate fix first.** `main`'s build-only Deploy run for `4be6677` failed one 3D-preview test. Painting a robot type scrolls the canvas out of view, and the page's visibility observer reports its return outside Playwright's virtual clock. That was fixed in its own test-only PR (#129) before this one.

## Release 7 — rendered verification (R01–R16)

An outside audit of Release 6 (`965215b`, 15 November) found two places where this record's numbers disagreed with the live page (D1, D2), seven new issues (N1–N7) and sixteen recommendations (R01–R16). Every number in this section was measured with Playwright on a production build (`vite build`, then `vite preview`): "before" is `965215b`, "after" is this release. Each was read from the rendered DOM (`getBoundingClientRect`), or, for the 3D view, from the corners the canvas publishes.

### D1 — the walkthrough's empty space (R01)

**Why the Release 6 number was wrong.** Release 6 said no stage left more than about 4% of the panel empty at 1280 and 1919 px. That measured the space under the panel's *lowest* content, which was always the right column: the schematic plus its readout. The prose column on the left was 89–172 px shorter on every stage, and that space was not counted. The audit saw it at 1919 px. The panels are meant to share one height, the tallest stage's, so nothing below moves between stages; that lock stays.

**Change.** From 900 px each stage's readout sits under its prose, level with the foot of the schematic, instead of under the schematic. The schematic takes the right column across both rows. The prose is centred in the space above the readout, and the schematic in its column, so a short stage's leftover space is split above and below rather than pooled at the foot. Reverify has two readouts; the second stays under its schematic. The shared height falls from 388 to 358 px at 1280 and 1919 px.

**Measured: the largest blank stretch above or below either column, by stage (px, and share of the panel).**

| Width | | Bind | Challenge | Grade | Attest | Reverify |
|---|---|---|---|---|---|---|
| 1280 and 1919 | before (panel 388) | 114 (29.4%) | 114 (29.4%) | 138 (35.6%) | 172 (44.4%) | 89 (22.9%) |
| 1280 and 1919 | after (panel 358) | 25 (7.0%) | 22 (6.1%) | 19 (5.3%) | 42 (11.7%) | 16 (4.5%) |
| 960 | before (panel 507) | 183 (36.1%) | 150 (29.6%) | 206 (40.6%) | 209 (41.2%) | 158 (31.2%) |
| 960 | after (panel 437) | 48 (11.0%) | 29 (6.6%) | 16 (3.7%) | 42 (9.6%) | 36 (8.2%) |
| 375 | before (panel 1001, one column; space at the foot) | 117 (11.7%) | 0 | 48 (4.8%) | 65 (6.5%) | 96 (9.6%) |
| 375 | after | 117 (11.7%) | 0 | 8 (0.8%) | 65 (6.5%) | 96 (9.6%) |

Attest still carries the most: its prose is 110 px shorter than its record figure, and the remainder is now 42 px above it and 42 px below. With the wider fallback font on CI's Linux runner (Avenir is absent there), Attest's largest stretch measures 54 px of 383, or 14.1%. On phones the one-column panels keep their shared height. Freeing them would move the Play/Prev/Next bar by up to 117 px under the thumb between stages, so that stays. `r6-p2-walkthrough.spec.ts` now fails if any blank stretch is taller than 15% of the panel from 900 px.

### N3 — the heading under the sticky header (R11)

Clicking through the stages never scrolls the page itself. The clip the audit saw happens when the tab strip is already under the header when Next (or a tab) is pressed: the visitor has scrolled the section up, or a tool has scrolled the clicked button into view. The new stage then opens with its tabs and heading hidden. A stage change made by a click now checks the strip's top. If it sits above the header's foot, the page scrolls just enough to put it 12 px below. Otherwise nothing scrolls, and Play never scrolls. The scroll is instant, like the stage change itself. In CI the test once left the strip 300 px under the header. Its scroll log showed the cause: Playwright's own scroll before the click, animated by the page's `scroll-behavior: smooth`, carried on for 300 ms after the click, past the guard. It was the test runner, not the page. The test now runs with reduced motion, as the mobile project already does for the same reason. The walkthrough also carries `scroll-margin-top: 108px`.

| Start | Width | Before (strip or heading top, minus header foot, stages 2–5) | After |
|---|---|---|---|
| strip 16 px under the header's foot | 1280, 1919 | ≥ 16 px | ≥ 16 px (unchanged; nothing scrolls) |
| strip scrolled 150 px up under the header | 1280, 1919 | −150 px on every stage | +12 px on every stage |

`r7-home-walkthrough.spec.ts` presses Next through all five stages from both starts at 1280 × 800 and 1919 × 998. It requires the strip and the heading at least 8 px below the header.

### N6 — the tab strip squeeze (R03)

Release 6 moved the five-column strip to 1024 px. The Phase 2 sentence "from 900 to 1023 px … Challenge squeezed its connector to 2–14 px" describes the measurement behind that move. Below the breakpoint the strip is a one-column list with no connectors.

On macOS (Avenir) the connectors at 1024 px measured 69, 27, 57, 59 and 43 px. CI's Linux runner has no Avenir, and its wider fallback font left Challenge's connector at **13.3 px at 1024 px**. Verdana reproduces it at 14 px. So the five-column strip now starts at **1100 px**. There, the connectors are 84, 42, 72, 74 and 58 px with Avenir, and 78, 30, 65 and 64 px with the wide font. Below 1100 px the strip is the list.

`r7-home-walkthrough.spec.ts` checks 900, 960, 1024, 1099 and 1100 px for:
- connectors of at least 16 px, from 1100 px;
- no identifier breaking anywhere but at its dot, in every tab and panel;
- no sideways scroll.

`r6-p2-walkthrough.spec.ts` checks the list at 1099 px and the row from 1100 px.

### D2 — the 3D floor's fit (R01)

**Why the Release 6 number was right but not enough.** "The floor fills 70% of the canvas's binding dimension" was true: 70% of the height. But the desktop canvas was 1112 × 520, more than twice as wide as tall, so the floor took only 42.6% of the width, with beige wings on both sides. On a phone the canvas was 283 × 520 and the floor, fitted to the width, took 27.8% of the height.

**Change** (`src/components/ProvingGround3D.tsx`, `src/components/floorPlayback.css`):
- **Camera.** 44° above the floor and 32° round from its front edge (was 48° and 37°): still a three-quarter view, a little lower and squarer, so the floor reads wider than deep.
- **Fill.** The floor fills 72% of the canvas height or 88% of its width, whichever it reaches first (was 70% of the binding dimension). The scene still stays 2.5% inside every edge.
- **Canvas.** On desktop it is 17:10, at least 520 px tall and never taller than the window minus 110 px. On phones (≤ 640 px) it is square.

| Viewport | Before: canvas · floor width · floor height | After: canvas · floor width · floor height |
|---|---|---|
| 1919 × 998 | 1112 × 520 · 42.6% · 70.0% | 1112 × 654 · 58.4% · 71.3% |
| 1280 × 800 | 1112 × 520 · 42.6% · 70.0% | 1112 × 654 · 58.4% · 71.3% |
| 375 × 812 | 283 × 520 · 70.0% · 27.8% | 283 × 283 · 88.0% · 62.3% |

The starter floor's racks reach the top margin first (scene box 0.025–0.975 in height), so its floor settles at 71.3%, not 72%. Two cases still fall short of the targets, by the 2.5% margin rule:
- a shallow 12 × 4 rack floor reaches 64.3% of the height on desktop and 53.7% on a phone;
- a 12 × 12 floor reaches 56.0% of the width on desktop.

`r6-p4-pg-3d.spec.ts` now asserts the canvas size and both dimensions at 1919 × 998, 1280 × 800 and 375 × 812.

### R10 — nothing on the site starts on scroll

The Labs playbacks were the last exception. On `/operations`, `/simulation` and `/proving-ground` (2D and 3D), each console now opens paused at its first frame, with every robot placed. It starts only when the visitor presses Play, Step or Replay, picks a wave, presses "Run a new shift" or "New layout", or moves a fleet, wave or robot-count control. Editing the floor, its domain or a robot's type resets it to a paused first frame. Leaving the viewport or the tab still pauses drawing, but returning never starts motion. With reduced motion, the 2D view, `/operations` and `/simulation` still show the final frame, as before. `r7-no-scroll-start.spec.ts` scrolls each console into view at 1280 × 800 with motion allowed, waits 2 s, and requires nothing changed and the button to read Play. It then presses Play and requires motion.

**Style Lock:** no animation or simulation anywhere on the site starts on scroll or on load.

### R05, R16 — captions below the picture, never in it

**Before.** The Release 6 renderer, `scripts/burn-captions.py`, burned each caption into the video pixels as a dark bar ending 24 px above the picture's foot. That bar covered recorded content: the "How to read the verdict" heading and JSON lines on `/` and `/verify`, and "Pin issuer thumbprint" on `/reference-check`.

**Change.**
- **New takes.** The three recordings were re-recorded on 2026-11-16 (UTC) on the live Release 6 site, `965215b`, with the repository's own recorders. The release stamp was checked first; only first-party and font GETs were allowed. Every observed fact matches the Release 5 takes exactly: codes, counts, seed and corpus results.
- **Renderer.** It now draws no caption into the picture. Its only overlay is the small "RECORDED · ONE TAKE · SYNTHETIC DATA" pill at (24, 24). The pill sits over the site's sticky header, which the recorded page scrolls beneath, so it never covers recorded content. The real cursor dot is still shown.
- **Cues.** Captions are still validated against the facts and beats and kept one at a time. They are written to the manifest as timed text (`render.captions_in_picture: false`, no box) and to the WebVTT track, which has no `default` and stays in mode `hidden`.
- **Caption tray.** Under each player on `/`, `/reference-check`, `/over-grant` and `/verify`, the tray shows the active cue. It is now the only place a caption appears, so nothing shows twice.
- **Superseded files.** The 2026-11-15 encodes, posters and tracks are removed.
- **Checks.** `verify-recordings.mjs` now fails on any caption with an in-picture box or a missing `captions_in_picture: false`. `r6-p3-recordings.spec.ts` pins the same, and `burn-captions.test.py` checks that the plate is transparent below the pill. The Pass 2 clearance test, which kept the controls 48 px clear of a burned bar, now checks only the pinned, whole picture.

**Measured.**
- **The old bar band.** At each cue's midpoint, the longest dark horizontal run in the band where the bar sat (y 560–700 of 720):
  - old encodes: 464–992 px on every cue (the bar);
  - new encodes: 1–12 px (text), except one frame of shot01 at 890 px, which is the page's own rule under "How to read the verdict", now uncovered.
- **Frames by eye.** Frames 1.5 s after every beat of all three takes show nothing over the page but the pill (in the header) and the cursor dot.
- **Encodes.** All are H.264 High, 1280 × 720, yuv420p, no audio, `moov` before `mdat`: 0:36 (shot01, `/` and `/verify`), 0:29 (shot02, `/over-grant`) and 0:42 (shot04, `/reference-check`).
- **Tray.** It starts 9 px below the video element on all four pages at 1919, 1280 and 375 px, and keeps one height through each take. The long `/over-grant` cue fits whole.

The figure disclosures now say: "A cursor dot and the corner label are overlaid; the captions show under the picture, not in it."

### R06/N1 — recording shelf-life policy

Screen recordings verify the deterministic workflow and artifact output of the pinned engine commit named in their provenance line, now `965215b`. Surrounding page-layout additions, such as static hero specimens, do not invalidate the recorded workflow. Recordings are re-captured only when the graded artifact schema, the CLI/UI workflow steps or the verdict semantics change.

The R05 re-render needed a fresh take of the live release, because the raw masters are not kept. The new takes therefore already show the Release 6 pages, and the dated drift note under the `/reference-check` recording is gone with nothing replacing it. Each figure's visible line is its summary alone, for example "Recorded 2026-11-16 (965215b) · synthetic demo data", with the full text in "Full provenance and limits".

### R04/N2 and R07/N5 — the homepage's case and its caption

**R04.** sup-02, the $450 refund, was told three times in one scroll: the hero card, the walkthrough's first two stages, and its Grade and Attest rows. The hero card keeps it, as the poster. The walkthrough now follows the battery's other looser miss, sup-10, a $200 goodwill credit over the oracle's $100 cap. Under the Moderate preset the policy allows it and the oracle escalates it, with no approval flag, exactly as for sup-02; this was computed with `buildPolicyEvaluation`.
- Stage 1 asks: "A $200 goodwill credit over the oracle's $100 cap: should the agent proceed, refuse, or hand it to a person?"
- Challenge marks sup-10 in the battery grid.
- Grade's rows are sup-01, sup-10 and sup-04, and its prose names the $450 refund once: "a looser miss, the same kind as the $450 refund at the top of the page".
- Attest shows the row `{"id":"sup-10","decision":"allow","expected":"escalate"}`.

The human question still opens the walkthrough (F06); the walkthrough now extends the hero instead of repeating it. No launch contract pinned the old case.

**R07.** The hero caption now reads: "Unlike the scene, the graded result below is output from the live demo, re-checkable in your browser." (was "is real reference-check output").

### R08/F15 — `/trust` hero

From 960 px the `/trust` hero is two columns, like `/verify`: copy on the left, a static "Release gate receipt" card on the right. The card lists what `make gates-all` checks: builds, unit tests, evidence re-checks, and honesty-lint's banned patterns, required disclaimers, launch contracts and recording contract. It holds no count. The existing scoreboard script fills "N of M suites passed" and the stamp from `/trust/gates-summary.json`, so the card cannot drift from it; without JavaScript it links the summary.

Measured, on the page:

| Viewport | Copy (x, y, w × h) | Card (x, y, w × h) |
|---|---|---|
| 1919 × 998 | 363.5, 191, 616 × 581.8 | 1051.5, 209, 504 × 550.1 (ends 13.7 px above the copy's foot) |
| 1280 × 800 | 44, 176.6, 624.6 × 556.6 | 724.9, 194.6, 511 × 550.1 (ends 11.5 px below the copy's foot) |
| 375 × 812 | y 127–752 | y 777, 327 × 721.1, stacked after the copy |

At 375 × 812 nothing scrolls sideways.

### R09 — `/foundry`

The reading frame, static and in the app, gains one paragraph on the sample floor, from `src/foundry/sampleFloor.ts` and `src/floorMargin.ts`:
- a 10 × 10 grid with a dock, pick and drop, 2 wall cells, 2 hazard cells on the row between pick and drop, 1 human-only cell and no robots;
- the oracle returns finish with a 14-move route around the hazards;
- the in-browser single-failure check finds no chokepoints in 92 swept cells, and a budget-blind disconnection margin of 3 free cells;
- the Quorum loop runs only in a separately enabled local or backend demo.

`r7-subpages.spec.ts` rebuilds the sentence from those modules.

### R12/N4 — `/proof`

The TR-A002 card and the hero figure already define the three rungs. "The ladder" is now "What a reviewer can re-check at each rung". For each rung it gives what a reviewer can re-check, with what, what that catches and what it cannot show:
- **TR-A001:** the shape only; its digest is a placeholder.
- **TR-A002:** every event hash and link, plus `final_digest` and `log_digest`, with `node scripts/verify-tr-a002.mjs tr-a002.json` or `/verify`. The top-level description is outside the chain.
- **TR-A003:** would add external provenance, which no hash chain can show. It is not held, because no design partner has run a workflow with Origin.

### R13 — `/labs`

The spatial research card now says what the verifier studies: given a reconstructed outline and the points it was built from, which edges rest on recorded points (observed) and which were filled in (inferred), so a claim resting on an inferred edge is not reported as observed. It adds that no input format, rule set or verdict format is published yet; the implementation stays private.

### R14 — `/verify`

No change needed. `r7-subpages.spec.ts` confirms the specimen report (4 of 12 · 6 over-grants · 2 misses, UNTRUSTED and VOID) shows on load, before any paste or click: in the first viewport at 1919 × 998, and after the copy at 375 × 812. Its counts equal the Permissive support evaluation.

### R02 — the narrated walkthrough, prepared

`docs/narration/walkthrough-60s-refund.md` and `docs/narration/walkthrough-60s-refund.vtt` hold a timed 60-second script: 8 cues, 154 words, Bind → Challenge → Grade → Attest → Reverify → `/app`. It opens on "$450 over the cap. Held, not executed. Here's the receipt, and here's how your reviewer re-checks it." The founder records it in his own voice; synthetic voice is never used.

The `.md` sources every fact and gives the drop-in steps: dated files under `public/audio/`, an `<audio>` element with a visible transcript (browsers do not display `<track>` captions on `<audio>`), and the owner decision needed to give a recording sound (the recordings are silent by contract).

The opening's "Held" needs the owner's eye. The walkthrough says that in this demo nothing is held, so the script's second cue scopes it.

### R15 — phone tap targets, rendered

`r6-p4-tap-targets.spec.ts` now runs the sixteen routes at 360 × 800, 375 × 812 and 430 × 932: 48 tests. On the production build, 0 visible targets are under 44 × 44 at the three widths. Nothing scrolls sideways on any of the sixteen routes at 360, 375, 430, 768, 960, 1280 and 1919 px (112 route-widths).

### Gates for this release

- `npm run gates`: green; 956 unit tests.
- `npx eslint . --max-warnings=0`: clean.
- `npm run test:e2e`: 1231 passed, 134 skipped, 0 failed.
- `node scripts/honesty-lint.mjs`: clean; 21 served pages, 184 React copy files, 65 launch contracts.
- `make gates-all`: 15 of 15 suites green.
- After the R05 re-render: `python3 scripts/burn-captions.test.py` 9 passed; `npm run recordings:check` green for all three takes; the same e2e, gates and `make gates-all` results.
- No named blue (`#2f6df6`, `#4f86ff`, `#5f86ff`, `#0891b2`, `#cfdcff`, `#bcccff`, `#cfe0ff`) in the 87 served CSS, JS and HTML files.
