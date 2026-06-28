# Chronos frontend design audit

Date: 2026-06-21

Scope: route-by-route audit of `/`, `/witness`, `/proofset`, `/patch`, `/gate`, `/gate/witness-failed`, `/gate/control-failed`, `/releaseproof`, `/artifacts`, `/settings`, plus shared components.

Source lens: `$emil-design-eng` in `.agents/skills/emil-design-eng/SKILL.md`.

## Cited principles

- Buttons and pressable controls should respond immediately with subtle scale feedback.
- UI motion should use exact properties, stay under roughly 300ms, and avoid `transition-all`.
- Repeated operational transitions should be reduced or removed.
- Popovers/dropdowns should feel anchored to their trigger through transform origin.
- Repeated cards should use the default 8px radius unless a component is an overlay or special surface.
- Pressable elements must not be fake affordances; dead buttons, dead chevrons, and inert dropdowns should be wired or made static.
- Text and fixed-format controls need explicit fit rules so identifiers, hashes, paths, and labels do not break layout.

## Audit and fixes

| Page | Before | After | Why |
| --- | --- | --- | --- |
| Shared buttons | `Button`, `IconButton`, footer cards, canvas tools, menus, and several hand-styled buttons had hover-only feedback or generic `transition`. | Added exact transition properties, focus rings where missing, and `active:scale(...)` feedback on enabled pressables. | Cites the skill's button feedback rule and exact-property transition guidance. |
| Shared graph motion | Graph nodes/edges used long 550-700ms fades, 1200ms bookkeeping, and slower camera refits. | Shortened node/edge reveal to 220-240ms, aligned cleanup to 320ms, and reduced fit/refit motion to 200-220ms. | Cites the guidance that frequent UI animations should be reduced and UI motion should stay under 300ms. |
| Shared graph nodes | Node cards used `transition-all`, larger radius, and ungated hover lift. | Replaced with exact `border-color`, `box-shadow`, and `transform` transitions; moved hover lift into fine-pointer media; used default `rounded-lg`. | Cites exact-property animation, performance, and repeated-interaction restraint. |
| Shared dropdown/popover | Scene menu and node popover used generic keyframe behavior without origin treatment. | Added origin-aware classes, reduced radius, active/focus states, and reduced-motion handling. | Cites origin-aware popover guidance and reduced repeated navigation friction. |
| Shared footer | Persistent footer tried to show stats, cards, and minimap at all widths, causing card compression. | Prioritized nav cards at ordinary app widths; stats move to wide layouts and minimap hides below `lg`. | Cites text-fit and stable fixed-format control guidance. |
| `/`, `/witness`, `/proofset` | Canvas tool buttons lacked labels/focus/press states; confirmed witness rows and ProofSet rows had text-fit risks. | Added aria labels, focus and active states, truncation, shrink-safe badges, and compact row behavior. | Cites accessible tactile controls and identifier/name containment. |
| `/patch` | Back control lacked tactile feedback; diff/stat areas could overflow; right-panel CTA repeated long patch labels. | Added focus/press states, horizontal diff containment, digest/path breaking, responsive stat cards, and shorter CTA label with patch label nearby. | Cites repeated navigation feedback and text-fit rules for hashes/paths. |
| `/gate` | Progress used `transition-all`; footer row buttons looked clickable without actions; duplicate row spinner noise. | Switched progress to transform scale, wired footer actions, truncated row labels, and removed duplicate row spinner. | Cites exact-property motion and fake-affordance removal. |
| `/gate/witness-failed` | Rows had chevrons but were inert; filter looked like a dropdown; recovery button was hand-styled. | Made rows real buttons, made filter static, used shared danger button, and made summary layout responsive. | Cites dead-affordance cleanup and shared tactile language. |
| `/gate/control-failed` | Relaxation dropdown and right-panel actions were fake/hand-styled; tables had fixed narrow columns. | Wired relaxation to return-to-fixer, routed detail actions to artifacts, used shared buttons, and added table min-width/truncation. | Cites interaction trust and explicit fit rules for operational tables. |
| `/releaseproof` | Celebration confetti and large-radius cards made the evidence route feel less operational; key actions had no handlers. | Removed confetti, normalized cards to `rounded-lg`, stacked compare cards responsively, added truncation/copy, and routed actions to artifacts. | Cites purpose-driven animation, operational density, and no dead pressables. |
| `/artifacts` | Rows looked inspectable but were inert; evidence IDs were truncated away; aside was fixed. | Made rows pressable, preserved detail text with break-all mono treatment, stabilized status chips, and hid the aside at constrained widths. | Cites evidence inspectability and text-fit for IDs. |
| `/settings` | Route was a centered placeholder. | Added a real read-only settings surface with header, rows, footer, and route-consistent navigation. | Cites route-group audit completeness and avoiding dead-end surfaces. |

## Verification

- `npm run build` from `frontend/` passed.
- In-app browser route audit at `http://127.0.0.1:5177` verified headings and interactive controls across audited routes.
- Focused footer verification showed persistent footer card widths remain stable in the in-app browser viewport without scroll-width overflow.

Known residuals:

- Rollup still warns about upstream `@hugeicons/core-free-icons` pure annotations.
- Vite still warns that the generated app chunk is larger than 500 kB.
