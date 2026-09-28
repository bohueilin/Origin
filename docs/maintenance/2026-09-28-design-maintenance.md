# C04 — design-token maintenance

[Back to the maintenance guide](README.md) · [Dependency upgrades are tracked separately](2026-09-28-dependency-triage.md)

C04 is a code-maintenance finding from the [site design evaluation](../design/2026-09-26-site-evaluation.md). It is not a list of visible layout failures. The original inventory found 1,473 CSS declarations containing hexadecimal colors outside `:root`; that count includes context-specific values and is not a count of bugs or values that should all be replaced.

## Goal

Use the shared named colors for matching visual roles: page/card backgrounds, borders, primary text, secondary text and interactive states. Preserve meaningful distinctions between evidence status, illustrations and neutral UI. Keep local console themes separate where they have different requirements.

## Ordered backlog

1. **Public workspace styles:** inspect repeated surface, border and text values in `apps/origin-web/src/shared/product-workspace.css`. Map only genuinely equivalent roles to existing tokens from `public/home.css`. The September 28 design passes replace shared white workspace surfaces with `--paper-2`, introduce named pass/fail/neutral surface tokens and a selected-control border token, and use shared radii. This is the first bounded batch; remaining component-specific literals still need classification.
2. **Legacy console styles:** review `src/App.css` by component family. Consolidate repeated declarations only after identifying the cascade and checking every affected route.
3. **Other route themes:** review Passport, capture and editorial styles separately. Do not erase purposeful status or theme differences.
4. **Ratchet:** after the inventory is classified, consider a narrow check against new duplicated palette values. Do not enforce the raw 1,473 count as a visual-quality metric.

## Acceptance for each batch

- The intended pages retain their appearance, contrast, focus visibility and evidence labels.
- Desktop, 375px and 320px layouts work; controls remain usable and there is no new page overflow.
- Reduced motion and no-JavaScript fallbacks remain intact.
- Run honesty, visible-text, app gates and the full browser suite. Refresh the shared stylesheet cache version whenever `home.css` changes.
- Keep semantic/evidence colors separate; no blind global replacement.

## Owner involvement

No action or color selection is needed now. Engineers can carry out appearance-preserving cleanup in small reviewed changes. A proposed palette or brand change would be a separate product decision.
