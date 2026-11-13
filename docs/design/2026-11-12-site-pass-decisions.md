# Site pass decisions — 2026-11-12

These decisions govern a site pass in waves. Wave 1 corrects public statements the product does not bear out; later waves make the reference-check record state its result and let `/verify` re-run its grading, then revise the home page, the offer and the Labs pages. Each wave appends the decisions it implements. Implementation happens in draft pull requests; merging and releasing remain owner steps.

## Wave 1 — claims corrections

**Byte-preserve rule.** `AGENTS.md` governs: named HTML body edits are allowed. `CLAUDE.md` now says the same, and both lists name `sitemap.xml`. These head edits are approved by name: the description, `og:description` and `twitter:description` meta on `/proof` and `/`. Canonical URLs, `og:url`, JSON-LD URLs, OG images, legal text, `robots.txt`, `sitemap.xml`, `insforge.toml` and dated evidence under `public/trust/` and `public/proof/` stay byte-identical.

**TR-A002.** Relabelled in page copy only. `public/proof/tr-a002.json` and its digest are unchanged. "Machine-emitted" stays, because a script wrote the file and computed its hash chain; "scripted" is added, because a script also wrote the twelve events. No page says or implies that a runtime, proxy, approver or sandbox acted. The `/proof` copy now states what `verify-tr-a002.mjs` checks (the events, `final_digest` and `log_digest`) and that the file's top-level descriptive fields are outside the chain. A tamper test locks the verifier's behaviour.

**`/security` configuration-binding demo.** Panel 04 grades the IAM "Least-privilege (recommended)" preset instead of the answer key, so it reports 11 of 12 rather than a 12 of 12 that held by construction. Each mismatch shows its direction: stricter or looser than the oracle, Origin's answer key.

**Other corrections in this wave.** Scoped edit claims ("an edit made without re-signing shows as VOID") on `/`, `/reference-check` and the explainer; scripted wording for the TR-A002 chip, the explainer, `/brief` and `llms.txt`; "independent(ly)" removed where it described Origin's own checks; the `/verify` example dates described as fixed sample values; the proving-ground account and research-page lane wording aligned with the absence of customer accounts and pilots.

**Release.** Wave 1 releases on its own once merged and green; the later waves release together.
