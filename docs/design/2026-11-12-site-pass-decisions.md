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
