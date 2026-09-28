# Origin brand, synthetic imagery, and audit follow-through

Origin now uses a geometric O mark, a more concrete homepage headline, and original synthetic warehouse illustrations. The existing homepage hero visual, green-and-paper palette, Proving Ground navigation, and evidence boundaries are preserved. No founder portrait, biography, customer claim, or operating legal entity has been added.

## Decisions on the independent audit

| Finding | Decision | Implementation or rationale |
| --- | --- | --- |
| F01: primary journey | Partially adopted | Keep the existing tested section hierarchy and one filled action per section. Hero says “Run the reference check”; the closing ask is “Book an Agent Evidence Review,” with a working email fallback without JavaScript. Secondary actions remain text links. A complete reorder needs reader evidence; the audit did not establish that existing links had equal visual weight. |
| F02: headline comprehension | Adopted | “Test the policy. Inspect the evidence.” The subline names selected policies, fixed synthetic scenarios, deterministic grading, and re-verification. No claim that a named live agent is executed. |
| F03: founder enrichment | Declined | The owner requested no added founder identity. Existing name attribution remains; no portrait or invented credentials. |
| F04: evidence captions | Partially adopted | A shared static visual treatment for recording captions, retaining each original provenance statement and verdict boundary. No arbitrary word-count reduction or generic VALID caption across different evidence types. |
| F05: Labs clarity | Partially adopted | Homepage labels Labs as bounded simulations and distinguishes the agent reference-check prototype from research. Keep all working demos and prominent Proving Ground navigation. |
| F06: reviewer questions | Adopted | Each of the five explanatory stages now asks its reviewer question. The working reference-check configuration, policy, results, and evidence sections use the same question-oriented framing. |
| F07: closing review ask | Adopted | Homepage closing action matches the existing Agent Evidence Review wording on Trust and Proof; the existing review flow is retained. |
| F08: verifier recovery | Validated; no redesign needed | Empty input disables Verify; malformed JSON receives feedback; Clear and the labelled signed-browser example recover to the correctly scoped UNTRUSTED result. Covered by a browser regression test. |
| F09: keyboard and reflow | Validated | Existing focus styles and navigation retained. Added gallery checks for focus trap, Escape, focus restoration, and 320px dialog containment. |
| F10: contrast | Validated | Measured secondary text on paper 6.73:1; signal green on paper 8.26:1; recording caption 7.21:1; stage question 7.42:1. These meet 4.5:1 for normal text in the measured states. |

No sticky mobile sales bar, fabricated testimonials, compliance badges, new framework, font dependency, or unsupported “60-second” recording claim. Five-second comprehension, conversion, and unassisted participant studies were not performed; improvements in those outcomes remain hypotheses.

## Media and brand

Fifteen dataset photo composites and their manifest fallbacks are removed from the current build. Three original illustrations were generated from text only, then resized and WebP-encoded: 267,136 bytes combined, replacing 875,363 bytes of photo composites. Cards and dialogs explicitly identify them as fictional illustrations, separate from the schematic templates and evaluation results. The photo/depth/segmentation/instance controls were removed because the new images do not represent those modalities. Existing CAD/MAPF templates and dated evidence records are unchanged.

See [illustration provenance and prompts](../../apps/origin-web/public/factoryceo/floorplans/ILLUSTRATIONS.md) and [brand asset guidance](../../apps/origin-web/public/brand/README.md). Versioned filenames allow current pages to load the new mark and images without waiting for old browser caches. Removing files from the current build does not rewrite Git history.

Cloudflare Email Address Obfuscation was disabled and verified after reloading its settings. A public HTML fetch confirmed a plain `mailto:bohueilin@originphysicalai.com` link with no injected email-decoding script or protected-email URL. Auth owner identity is unchanged.

## Verification

- Honesty lint and all four visible-text tests pass.
- Application gates: build, lint, evidence verification, proof verification, asset hashes, recording provenance, and all 808 unit tests pass.
- Full browser suite: 472 passed, three existing skips. Targeted browser checks cover gallery selection/enlargement, synthetic boundaries, malformed JSON recovery, and the existing homepage navigation/action hierarchy.
- Production preview: six affected routes at 1440, 375 and 320px; 18 captures, no page-level horizontal overflow, no automated axe violations, and zero observed layout shift in the sampled load window. These are local checks, not accessibility certification or field performance data.
- Homepage HTML plus its two stylesheets total 136,072 uncompressed bytes; no new render-blocking third parties or runtime dependencies.
- Independent code review found two minor presentation issues (404 favicon cache reference and stage-question CSS specificity); both corrected.

The release workflow rechecks the committed revision before publishing. Live verification must confirm its release stamp, new asset hashes, business email links, and the disposition of retired image URLs.
