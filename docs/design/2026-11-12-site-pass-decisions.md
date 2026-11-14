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
