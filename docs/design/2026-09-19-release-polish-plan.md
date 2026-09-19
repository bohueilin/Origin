# Release design polish and canonical repository

## Intent and authorization

The owner approved the cinematic direction, confirmed real Google sign-in works, and authorized additional design/media generation and updates to the public Origin repository. This pass refines the approved website. Public website: `https://originphysicalai.com`. Public source: `https://github.com/bohueilin/Origin`. Publishing the production website remains a separate human-controlled release.

## Work

- [x] Refine the strongest remaining visual gaps after desktop/mobile inspection: restrained original imagery, product clarity, consistent brand/share assets, and usable media.
- [x] Make website canonical metadata, public site links and machine-readable discovery use `originphysicalai.com`; make source links use `bohueilin/Origin`. Preserve historical evidence bytes, backend OAuth compatibility and deployment identifiers.
- [x] Refresh the repository landing page and GitHub About metadata around the canonical website and repository.
- [x] Verify responsive layouts, media loading/reduced motion, accessibility, functional regressions, evidence gates and source identity; obtain an independent patch review.
- [ ] Commit and push the reviewed changes; integrate the repository update after passing checks. Do not dispatch a production deployment.

## Design direction

Keep warm paper, sage, forest green, generous editorial layouts and a small number of deliberate images. Strengthen the Physical AI connection through clearly illustrative lab imagery, not implied robot certification. Preserve the actual verifier recording. Prefer a polished short motion asset only when it communicates more than the existing finite hero loop. Keep generated imagery separate from evidence and retain pause/replay and reduced-motion behavior.

## Coordination

The identity task owns metadata/link/documentation changes. The primary agent owns visual assets/styles and integration, and waits for identity edits before touching shared HTML. Test servers have one owner. Independent review examines the final patch. No private strategy, local credentials, browser sessions or personal files are included in the public commit.

## Verification evidence

- Origin Web build, lint, 764 tests across 93 files, evidence/proof/reward/benchmark checks, reachability, stylesheet hash and 12 social-card assets passed.
- Full browser suite: 193 checks passed on desktop, mobile and restricted local Foundry. All 25 visual pages passed initial-state serious/critical WCAG 2 A/AA and overflow checks.
- New mobile no-JavaScript navigation and failed-media checks reproduced four failures before fixes, then passed; explicit reduced-motion playback remained working.
- Honesty lint passed; resolved production npm dependency audit reported zero vulnerabilities.
- Desktop/mobile first-screen layouts and generated social-card layout were visually inspected. The new art has a 33 KB mobile variant and 78 KB full-size variant.
- Google sign-in was confirmed successful by the owner. Automated account flows use fixtures; privileged live writes were not exercised.
- Repository About metadata now links the canonical website. Independent staged-patch review found one test-isolation issue. The default outbound network guard was added, all 22 auth-denial checks passed, and scoped re-review confirmed the finding addressed with no new issues. Remote integration checks follow before merge.

## Scope decisions

- Retain the approved homepage scene and actual verifier recording. Additional background video would add weight without improving the explanation; the existing film now has a finished error fallback and replay label.
- Keep legacy hosting identifiers in OAuth compatibility, immutable schemas and historical records. Public identity uses the custom domain; the source repository is linked separately.
- Production rollout is not part of this update. The workflow still requires a manual production dispatch. GitHub branch protection and production-environment required reviewers were not configured at inspection and remain operator release preconditions.
