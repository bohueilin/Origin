# Frontier lab design — September 28, 2026

This pass makes the working prototypes easier to find and gives the public pages a more consistent editorial hierarchy. It follows the navigation, business-contact and editor-spacing update in [PR #97](https://github.com/bohueilin/Origin/pull/97).

## Changes

- **Homepage:** separate the proposition and existing labelled illustration into two columns; add a numbered index linking to policy evaluation, Proving Ground and artifact verification; introduce a dark Labs section with readable text and keyboard focus.
- **Proving Ground:** retain the new inner margins and responsive controls; make the three workflow steps link to the editor, playback and oracle record, with native keyboard focus and sticky-header clearance. Align the robot-context panel to its content instead of stretching it down the editor.
- **Shared pages:** use smaller shared corner radii and consistent workspace surfaces, status fills and selected borders. Keep narrow header actions separate from the brand, including when route styles load.
- **Returning visitors:** version home, cinematic and editorial stylesheets by their content hashes. The existing lint and automatic repair now cover all three.

## Decisions

Keep the current warm-paper palette, green signal color and system font stack. These preserve recognition and avoid new font downloads. Keep the existing labelled hero media, synthetic boundaries, deterministic labels, evidence computation and legal placeholder. The hero media files themselves are unchanged.

The public business contact is `bohueilin@originphysicalai.com`; the owner sign-in identity is unchanged. No forms were submitted and no inbox-delivery claim is made.

## Verification

Local final checks: honesty clean; visible-text 4/4; application gates 806 tests in 100 files; full browser suite 462 passed and 3 existing skips; production-build focused browser checks 16/16. See the pull request and release checks for the final revision. Local verification includes honesty and visible-text checks, application gates, the complete browser suite and focused tests against the production build. The site collector covers 25 routes at 1440px, 375px and 320px, plus JavaScript-off and keyboard-focus views. Browser and visual outputs are kept outside Git.

Independent review found a low-contrast link in the new dark section; the foreground and focus outline were corrected. Narrow-header checks also caught route button styles overriding mobile header sizing; the shared header now keeps its sizing across routes.

These are local Chromium checks, not a claim of WCAG certification or production field performance. Existing authenticated/provider flows were not exercised.

## Remaining maintenance

[Dependency upgrades](../maintenance/2026-09-28-dependency-triage.md) and [C04 design-token maintenance](../maintenance/2026-09-28-design-maintenance.md) remain separate workstreams. This release includes the first shared-workspace token batch; it does not upgrade dependencies or claim that every component-specific color should become one token.

The broader palette inventory and legacy console cleanup are deferred. They do not block these visible improvements. Brand changes, an actual founder portrait and dataset rights require authoritative owner input.
