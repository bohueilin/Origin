# Codex Handoff — Site-to-Gym Redesign

Iteration: Site-to-Gym UI Sprint  
State: READY_FOR_CLAUDE_REVIEW  
Date: 2026-06-30  
Repo: `/Users/bohueilin/hackathons/Origin`  
Baton: Claude review next, then return to Codex with findings

## Objective

Redesign the Origin app page section titled "Create your site before the robot ever steps on it" so it reads like a premium, YC-ready product workflow instead of a generic upload form.

Required product story:

`Customer site inputs -> 2D/3D site representation -> RSI task generation -> deterministic oracle labels -> RL environment training -> readiness metrics -> safer robot deployment`

Core thesis preserved:

`Model proposes. Environment verifies. Gate decides. Trace proves.`

## Files Changed

- `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/components/CaptureConsole.tsx`
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/App.css`
- `/Users/bohueilin/hackathons/Origin/apps/origin-web/src/credentials/grantStepUp.ts`
  - This file was already untracked before this sprint.
  - Codex made one narrow TypeScript compatibility fix so `npm run build` passes with WebCrypto `BufferSource` typing.

Observed but not part of this sprint:

- `/Users/bohueilin/hackathons/Origin/apps/origin-web/public/rsi/rsi_dashboard.html` was already modified in the worktree from prior RSI/dashboard work. Codex did not intentionally edit it in this redesign pass.

## Product/UI Changes

1. Reframed the page hero from "template or upload" into a site-to-gym workflow:
   - Customer inputs
   - Origin builds a 2D map and task environment
   - Oracle decides finish / escalate / refuse
   - Team receives readiness metrics and trace proof

2. Rebuilt "Or build your own site" as four clear input method cards:
   - Upload floor plan
   - Upload site video
   - Upload photos
   - Add site references

3. Rebuilt "Add anything that shows the site":
   - Button now reads `Upload files`
   - Copy explains floor plans, videos, photos, PDFs, SOPs, and notes
   - Honest capability boundary: structured 2D now; richer 3D-aware reconstruction when evidence supports it
   - Added output chips for what Origin can extract:
     - Structured 2D site map
     - Video-assisted spatial hints
     - Obstacle and restricted-zone ledger
     - Finish / escalate / refuse task set

4. Reworked Google Drive/reference intake:
   - Clear `Add site reference` label
   - Explains Drive folder, safety SOP, CAD export, deployment notes
   - Button now reads `Add reference`

5. Moved `Your inputs` directly below the upload/link box:
   - Uploaded files count
   - Added links count
   - Text fields count
   - Processing state
   - Detected input-type chips
   - Empty state guidance
   - Next recommended action

6. Added dedicated RSI/RL Environment explanation:
   - Customer site context
   - Site representation
   - RSI task generator
   - Deterministic oracle
   - RL readiness Gym
   - Deployment evidence

7. Reframed the final CTA:
   - Primary CTA: `Generate site Gym`
   - Trust note: `Local demo intake · oracle labels only · no model self-grading`

## Claim Boundaries

- Does not claim production-grade 3D reconstruction.
- Does not claim uploaded files are parsed in this local demo.
- Does not let the model self-grade.
- Keeps the deterministic oracle as the label/reward authority.
- Frames video/photo extraction as best-effort site context, not guaranteed reconstruction.
- Keeps the RSI/RL story as bounded readiness evidence, not robot certification.

## Validation

Commands run from `/Users/bohueilin/hackathons/Origin/apps/origin-web`:

1. `npm run gates:full`
   - `npm run build`: passed
   - `npm run lint`: passed
   - `npm run verify:evidence`: passed, 40/40 checks
   - `npm test`: passed, 30 files / 237 tests
   - `npm run test:e2e`: first attempt failed because Vite proxied `/api/evidence/status` to the local backend while the backend was not running. This produced two 502 console errors in the existing clean-console e2e test.

2. `npm run server`
   - Started the local Hono backend on `http://localhost:8787`.
   - Warnings were expected local-dev warnings for missing optional secrets and in-memory fallback.

3. `npm run test:e2e`
   - Passed with backend running.
   - Result: 8/8 Playwright tests passed.

Rendered sanity checks:

- Built preview was opened at `http://127.0.0.1:4174/app.html`.
- Required redesigned sections were present:
  - `Customer inputs`
  - `Upload floor plan`
  - `Add anything that shows the site`
  - `Upload files`
  - `Your inputs`
  - `RSI/RL Environment moat`
  - `Generate site Gym`
- Desktop layout audit found no horizontal overflow in the redesigned section.

## Open Risks / Review Targets

1. Review whether the page still implies too much real parsing for uploaded media. Current wording says best-effort and distinguishes 2D now vs richer 3D when evidence supports it.
2. Review mobile polish manually if possible. CSS responsive rules are in place, but the highest-confidence gate is still the existing Playwright suite.
3. Confirm whether `src/credentials/grantStepUp.ts` should be intentionally staged as part of the broader repo state. It was pre-existing and untracked, but needed a narrow type fix for this local checkout to build.
4. Decide whether to add a dedicated e2e assertion for the new RSI section and upload labels. Existing e2e covers app boot/a11y, not this exact page copy.

## Copy-Paste Prompt To Claude

Claude, please review the Site-to-Gym redesign in `/Users/bohueilin/hackathons/Origin`.

Context:
- Codex redesigned the Origin app page section "Create your site before the robot ever steps on it."
- Files changed:
  - `apps/origin-web/src/components/CaptureConsole.tsx`
  - `apps/origin-web/src/App.css`
  - `apps/origin-web/src/credentials/grantStepUp.ts` (pre-existing untracked file; Codex only fixed WebCrypto typing so build passes)
- Do not deploy or push without founder authorization.
- Keep claim boundaries strict: best-effort site understanding, structured 2D now, richer 3D-aware reconstruction only when evidence supports it, oracle labels only, no model self-grading, bounded Gym not certification.

Please inspect:
1. Product clarity: can a first-time YC judge understand inputs -> site representation -> RSI tasks -> deterministic oracle -> RL Gym -> readiness metrics?
2. Visual quality: does the section feel premium and investor-grade, not generic upload UI?
3. Honesty: does any copy overclaim parsing, video understanding, 3D reconstruction, or robot safety certification?
4. UX flow: is `Your inputs` correctly positioned and useful as a confirmation state?
5. Technical fit: does the RSI/RL explanation accurately match the Origin thesis?
6. Mobile/responsive polish.

Please run:
- `cd /Users/bohueilin/hackathons/Origin/apps/origin-web`
- `npm run gates`
- Start the local backend with `npm run server`, then run `npm run test:e2e`
- Manually inspect `http://127.0.0.1:4174/app.html` or a local dev/preview URL if you start one.

Return:
- Prioritized findings P0/P1/P2
- Whether the design is ready to ship
- Any exact copy/design improvements
- A markdown handoff note in the repo
- A copy-paste prompt back to Codex so we can continue the loop

