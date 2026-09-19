# Origin cinematic website review

## Result

The approved cinematic direction is implemented in the actual website source, across all 21 application entry points, four additional visual pages, and `llms.txt`. This is an uncommitted local redesign, not a deployment.

- Preview: http://localhost:5283/ (the previous `127.0.0.1:5320` preview now forwards here).
- Worktree: `codex/site-cinematic-redesign`, based on `867dda4`.
- Source: `apps/origin-web`.
- Primary checkout, live site, backend contracts and evidence engines are unchanged.

## Route coverage

| Routes | Changes |
| --- | --- |
| `/` and `#product`, `#demo`, `#evidence` | Original cinematic hero, finite controllable motion, clearer product explanation, working five-stage walkthrough, provenance-led evidence index, scoped design-partner offer, Physical AI connection, retained lead form and email fallback. |
| `/reference-check`, `/verify` | Guided workspaces, clearer inputs/results, scenario selection, example-led verification, explicit signer limits, stale result invalidation. |
| `/security`, `/over-grant` | Navigable verifier panels, accurate unsigned credential terminology, mobile column labels and sample provenance. |
| `/proving-ground` | Synthetic lab framing, readable fleet editor, accessible controls/labels, evidence invalidated by input changes. |
| `/trust`, `/labs` | Editorial imagery, evidence/control boundaries, experiment directory, corrected implemented/proposed claims. |
| `/brief`, `/proof`, `/reference-check-vs-runtime` | Printable one-page summary, machine trace first, preserved artifacts, honest clipboard failure, comparison of current demo and proposed runtime architecture. |
| `/auth`, `/admin` | Restricted access journey without unusable signup fields; real account page with navigation, sign-out, role loading/error states and queue update feedback. |
| `/app` | Consistent evidence-console identity; explicitly authored scenarios and simulated downloads. |
| `/capture`, `/passport`, `/foundry`, `/soc` | Coordinated console palette/type, lab navigation, clearer boundaries, accessible scenario scrolling and status contrast. |
| `/clip` | Explicit user-triggered provider request, pause/replay, actual VETO/RATIFY response, per-lane measured/illustrative provenance; no request on mount. |
| `/simulation`, `/operations` | Coordinated experiment workspaces; correct view-button semantics and synthetic operational framing. |
| `/legal/privacy-policy.html`, `/legal/terms-of-service.html` | Readable typography and matching identity; legal body text preserved. |
| `/404.html`, `/rsi/rsi_dashboard.html` | Recovery links; research navigation, scoped provenance and improved contrast with metrics preserved. |
| `/llms.txt` | Consistent current capabilities and evidence limits for machine readers. |

## Visual system

Warm paper, sage surfaces, forest actions, local Avenir/system typography, original geometric mark, generous but responsive layouts. The approved generated scenes were encoded as WebP; all new brand assets total approximately 2.5 MB. Imagery is labeled as illustrative. Actual recorded verifier footage remains separate. Decorative motion stops under reduced motion unless explicitly played and offers pause/replay controls.

## Verification

- Baseline before editing: build, lint, artifacts and all 759 unit tests passed.
- Final gates: build, lint, 759 tests across 92 files, evidence/proof verification, reward/benchmark consistency, reachability, stylesheet content hash and social-card checks passed.
- Complete browser suite: **187 passed** across desktop, mobile and the restricted local Foundry configuration.
- Accessibility, single-H1 and overflow checks cover **all 25 visual pages** on desktop and mobile. No serious/critical WCAG 2 A/AA violations remained in checked initial states.
- Six evidence-freshness regressions reproduced before fixes and then passed. Clip mount/request and response-label regressions reproduced before fixes and then passed.
- Account/auth/admin suite: 54 checks passed, using mocked accounts and responses.
- Latest scoped editorial/product run: 10 checks passed after final evidence wording and print-artifact output.
- Printed brief: A4 PDF confirmed **one page**, text retained and rendered layout visually inspected.
- Local HTML link audit: 25 documents, zero unresolved source links.
- Independent review identified misleading issuer-pin scope and a missing no-JavaScript contact fallback; both corrected. Final independent review of account guards, async result invalidation, input binding and Clip provider effects found no remaining material findings.

## Boundaries for launch

These checks validate the local website and mocked account behavior. They do not validate live provider credentials, owner writes or customer deployment. No staging, commit, push, merge or deployment was performed. Runtime enforcement remains proposed; simulation is not physical safety validation. The source's original evidence artifacts, signing/oracle/scoring contracts and substantive legal text remain preserved.

## Recommendation

Review this integrated site as the next release candidate. After accepting the design, separately authorize integration and the existing human-controlled release procedure.

## Top risks and mitigations

- Evidence maturity confusion: current/proposed, synthetic/customer and issuer/execution boundaries now appear beside the relevant experience.
- Account or provider regressions: service contracts are unchanged; mocked denial, restoration, role and write-failure tests pass. Use the established authorized live checks before release.
- Visual drift between page families: shared foundations plus scoped editorial/product/console styles, complete route coverage and screenshot support in the browser suite.

## Next three actions

1. Review the homepage, one product workspace, Labs, and account entry in the integrated preview.
2. Accept any final brand/copy refinements, then authorize repository integration when ready.
3. Run the existing release process and authorized live checks before publishing.

Detailed findings: `2026-09-18-public-audit.md`, `2026-09-18-product-audit.md`, and `2026-09-18-account-audit.md` in this directory.

## Local Google sign-in follow-up

The initial visual preview omitted `VITE_INSFORGE_URL` and `VITE_INSFORGE_ANON_KEY`, causing the Google button to return “Auth is not configured.” The preview's `http://127.0.0.1:5320/auth` callback was also absent from the backend redirect allowlist. Mocked browser checks did not cover either local configuration issue.

The isolated worktree now has ignored `.env.local` client settings using the linked project's public anonymous key only. No administrative key was copied into frontend configuration. The server runs at the backend's existing allowlisted `http://localhost:5283` origin; the old preview port has a temporary, loopback-only redirect preserving paths and queries. No cloud configuration or signup/owner restriction was changed.

Read-only backend inspection confirmed Google is enabled, `http://localhost:5283/auth` is allowed, and signups remain disabled. Clicking Google from the corrected preview reached Google's real sign-in form. The owner subsequently confirmed that the Google sign-in worked. That is user-confirmed authentication; privileged live writes were not exercised by this design review.

To restart the connected preview from `apps/origin-web`, retain the ignored client settings and run `npm run dev -- --host localhost --port 5283 --strictPort`. Use the exact `localhost` hostname rather than `127.0.0.1` for the OAuth return address.
