# Product route audit — 18 September 2026

Scope: source and usability audit of `/reference-check`, `/verify`, `/security`, `/over-grant`, and `/proving-ground` before the approved warm cinematic redesign. Local source only; no external API or deployment activity.

| Route | Source | Preserved contract |
| --- | --- | --- |
| Reference check | `src/reference-check/ReferenceCheckPage.tsx`, `reference-check.html` | Support/IAM policy presets, deterministic battery, session-signed unpinned Action/Run evidence, config-drift demonstration |
| Verify | `src/verify/VerifyPage.tsx`, `verify.html` | Eight synthetic examples, fragment sharing, local detection/verification, optional signer pin, tamper/reset |
| Security | `src/security/SecurityPage.tsx`, `security.html` | Signature, Merkle, policy history, IAM, delegation, and over-grant demonstrations |
| Over-grant | `src/overgrant/OverGrantPage.tsx`, `over-grant.html` | Seeded identity table, shared delegation/analyzer panels, benchmark provenance |
| Proving ground | `src/proving-ground/ProvingGroundPage.tsx`, `proving-ground.html`, shared floor editor | Editable floor/fleets, descriptive 2D/3D animation, deterministic per-type episodes, session-signed integrity artifact |

## Findings

1. Reference results and downloads remain visible after configuration or policy edits. Scenario switching selects the least-privilege preset without resetting retained policy settings.
2. Verify retains a previous verdict after artifact bytes or expected issuer changes. Reset copy promises VALID even for an intentionally untrusted example.
3. Proving-ground edits change the visible level while retaining a signature/download from the previous evaluated input.
4. Over-grant mobile table styling hides headers and reads `data-label`, but cells omit those labels.
5. Inherited floor-editor copy refers to submitted real workflows, model drafting, delayed scoring, and telemetry that do not describe this synthetic browser page.
6. Proving-ground permission/production-issuer language needs qualification. Security labels an unsigned credential download as an attestation.
7. Verify advertises seven examples but has eight; over-grant has unmatched closing HTML wrappers.

## Design direction

Use the approved warm paper/sage site tokens with opaque work surfaces. Give the policy workspace a numbered progression and separate configuration/policy inputs from the resulting evidence record. Put examples before the verifier's empty JSON field and place its result in a distinct panel. Add direct navigation to the security demonstrations. Retain labeled, keyboard-scrollable tables. Contain floor-editor styling inside the proving-ground page.

Maintain separate meanings for synthetic inputs, signature integrity, trusted issuer, execution evidence, and deployment authority. Real runtime enforcement remains proposed. Fixed battery outcomes do not demonstrate execution of a named agent. Physical results remain simulation-based evidence, never real-world validation or certification.

## Verification plan

New `tests/e2e/product-freshness.spec.ts` exercises stale result removal, scenario preset synchronization, and signed-evidence invalidation against real local browser behavior. Preserve existing smoke labels and status semantics. Root runs desktop/mobile E2E and accessibility tests to avoid competing preview servers. Run build, lint, deterministic evidence/proving-ground unit tests, verifier self-test, honesty lint, and CSS version checks. Keep all oracle, policy, evidence, signing, and scoring modules unchanged.

## Implemented improvements

- Shared `src/shared/product-workspace.css` provides numbered workflow rails, sage workspace panels, distinct result panes, focus states, mobile layout, and contained floor-editor styling.
- Reference inputs clear previous results, and late async signing cannot reintroduce evidence for changed inputs. Switching scenarios resets the policy to match the selected preset. Preset descriptions now accurately describe the actual flags.
- Verify begins with example selection, pairs its JSON editor with a result pane, clears stale verdicts on edits, and keeps detailed format documentation under a disclosure. Its optional thumbprint field explicitly applies only to standalone Origin Attestations; Action/Run trust configuration is unchanged.
- Security demonstrations have direct navigation and stable section labels. Unsigned IAM evidence is accurately labeled a credential. Over-grant rows carry mobile column labels and distinguish the 300-root table, 400-root analyzer, and 2,000-root published benchmark.
- Proving-ground signatures are displayed/downloadable only when their input digest matches the current evaluated floor. Its optional shared-editor mode corrects lab-specific copy without changing the default capture workflow. Playback controls use native pressed buttons; physical claims remain bounded to synthetic gym evidence.

## Added clip review

The `/clip` page previously submitted a comparison automatically on mount, always displayed BLOCKED even when the returned model verdict was `ratify`, and claimed verification was free. It now requests only after an explicit Run action with external-provider/cost disclosure. Cached playback can be paused and replayed without another request. Each lane labels measured versus illustrative provenance; comparative ratios appear only when both lanes report measurements. The UI reports the actual model response and explicitly states that no action executes and no prevention outcome is established. Root owns the corresponding metadata update.

## Validation recorded during implementation

- Root confirmed the six original freshness/preset browser regressions fail before implementation and pass afterward.
- Root confirmed both added clip regressions fail before implementation (automatic request; missing explicit Run control).
- Root subsequently confirmed both clip regressions and the clip accessibility check pass.
- Local TypeScript project check and targeted ESLint passed after all component changes.
- Nineteen focused tests passed across reference-check evidence, published verification proof, and proving-ground readiness; the full framework-free verifier self-test passed.
- Honesty lint passed. Final desktop/mobile browser coverage and visual QA are coordinated by root.

Expanded accessibility checks exposed inherited proving-ground contrast, unnamed storyboard/rule inputs, and nested fleet controls. The display palette now provides at least 6.39:1 white-text contrast; small level-badge text has at least 4.66:1 contrast across all five existing level colors. Fleet selection is a native button inside a labeled group, and editable rules/storyboard fields have names. Product headers were shortened to a 56px maximum with reduced section spacing to bring the tools closer to the first viewport. Browser revalidation remains coordinated by root.
