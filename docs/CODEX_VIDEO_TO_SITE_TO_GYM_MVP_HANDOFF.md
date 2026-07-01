# Codex Handoff — Video-to-Site-to-Gym MVP

Iteration: Video-to-Site-to-Gym MVP  
State: READY_FOR_CLAUDE_REVIEW  
Date: 2026-06-30  
Repo: `/Users/bohueilin/hackathons/Origin`  
Baton: Claude review next, then return to Codex with findings

## Objective

Move the Site-to-Gym page from a premium intake story into a bounded working MVP:

`uploaded media -> extracted site artifacts -> structured 2D site representation -> Robot-Readiness Gym -> RSI tasks -> deterministic oracle labels -> readiness metrics -> replayable trace`

The implementation keeps the core thesis intact:

`Model proposes. Environment verifies. Gate decides. Trace proves.`

## What Was Already Implemented vs UI-Only

Before this sprint:

- Upload intake stored serializable local metadata only.
- `CaptureConsole` showed product copy for uploads, but no uploaded file was parsed into site artifacts.
- The app already had a deterministic warehouse oracle in `src/warehouse.ts`.
- The app already had `DescriptiveSiteMap` in `src/workflowDraft.ts`.
- Foundry already had an image/floor-plan parsing route, but the Site-to-Gym intake page did not use it.
- Floor-design already had a customer-owned Gym compiler, but that was offline dataset tooling, not this app upload flow.

After this sprint:

- Uploading a video/photo/floor-plan/reference now triggers a local Site-to-Gym pipeline in the app.
- The UI renders extracted artifacts, keyframes, a structured map, RSI task cards, oracle labels, readiness metrics, and a trace digest.
- The pipeline uses the existing deterministic `bfsOracle` as the only label source.

## Files Changed

Origin web:

- `apps/origin-web/src/site-to-gym/types.ts`
- `apps/origin-web/src/site-to-gym/videoKeyframes.ts`
- `apps/origin-web/src/site-to-gym/pipeline.ts`
- `apps/origin-web/src/site-to-gym/pipeline.test.ts`
- `apps/origin-web/src/components/CaptureConsole.tsx`
- `apps/origin-web/src/App.css`
- `apps/origin-web/src/captureManifest.ts`
- `apps/origin-web/src/captureManifest.test.ts`

Previously touched/untracked from earlier local work:

- `apps/origin-web/src/credentials/grantStepUp.ts`
  - Pre-existing untracked file.
  - Narrow WebCrypto typing fix remains needed for this checkout to build.

Observed but not intentionally edited in this sprint:

- `apps/origin-web/public/rsi/rsi_dashboard.html`
  - Already modified in the worktree from earlier RSI/dashboard work.

## Implementation Summary

### 1. Local media intake and classification

`captureManifest.ts` now recognizes floor-plan images by filename before generic image/photo classification:

- `site-floor-layout.png` -> `floor_plan`
- `dock-door-photo.jpg` -> `site_photo`
- videos still route to `workflow_video`

### 2. Video keyframe handling

`site-to-gym/videoKeyframes.ts` implements:

- browser-side best-effort video decoding;
- canvas thumbnail extraction when the runtime can decode the video;
- deterministic simulated keyframes when decoding is unavailable.

The fallback is explicit. It does not claim video CV/SLAM if the browser cannot decode the file.

### 3. Site representation

`site-to-gym/pipeline.ts` builds:

- source input categories;
- structured 2D map dimensions;
- zones;
- rooms;
- doors/portals when a floor plan exists;
- paths;
- obstacles;
- restricted zones;
- goals;
- uncertain regions;
- confidence scores for topology, obstacle detection, and zone detection.

It also emits bounded `3D-aware context`:

- camera path hints;
- vertical context;
- scale/depth hints;
- landmarks;
- confidence;
- explicit boundary: not production-grade 3D reconstruction and not SLAM-quality mapping.

### 4. Robot-Readiness Gym and RSI tasks

The pipeline compiles a `DescriptiveSiteMap` into nine oracle-labeled tasks:

- normal finish task;
- obstacle avoidance task;
- ambiguous route escalation task;
- restricted-zone refusal task;
- blocked-path escalation task;
- low-confidence / budget escalation task;
- missing-information escalation task;
- human-escalation task;
- hard-refusal task.

Each task includes:

- description;
- start state;
- goal state;
- constraints;
- required evidence;
- risk class;
- `WarehouseTask`;
- deterministic oracle verdict.

### 5. Oracle labeling and metrics

The pipeline calls:

- `bfsOracle`
- `oraclePolicy`
- `verifyWarehouseRollout`
- `computeWarehouseMatrix`

Metrics rendered:

- task count;
- finish / escalate / refuse distribution;
- false-accept risk;
- false-refuse risk;
- refusal recall;
- balanced accuracy;
- task coverage;
- trace completeness;
- readiness score.

Important interpretation:

- The displayed 100% balanced accuracy is `oracle replay` over the generated Gym, not a learned policy claim.
- FAR/FRR shown in the panel are baseline risk signals from naive always-finish / always-refuse rollouts.
- This remains a bounded Gym integrity proof, not robot certification.

### 6. Replayable trace

The trace includes:

- trace id;
- inputs;
- extracted artifacts;
- site representation version;
- Gym version;
- oracle version;
- task set version;
- metrics;
- verdict;
- digest.

The UI displays the digest and the claim boundaries beside it.

## Rendered Interaction Check

Manual Playwright probe against built preview:

- Loaded `http://127.0.0.1:4174/app.html`.
- Attached a local fake MP4 file to the upload input.
- Verified the page rendered:
  - `Video-to-Site-to-Gym MVP`
  - `Video keyframe strip`
  - `Structured 2D map`
  - `Readiness metrics`
  - `Replayable trace`

Observed DOM summary:

- pipeline chips: `8`
- keyframes: `4`
- task cards: `9`
- console errors: `0`
- horizontal overflow offenders: `0`

The probe used invalid video bytes, so keyframes correctly fell back to simulated artifacts. A decodable real MP4 should attempt browser thumbnail extraction first.

Rendered metrics in the probe:

- tasks: `9`
- finish / escalate / refuse: `2 / 5 / 2`
- oracle replay balanced accuracy: `100%`
- refusal recall: `100%`
- FAR / FRR baseline stress signal: `100% / 100%`

## Validation

Commands run from `/Users/bohueilin/hackathons/Origin/apps/origin-web`:

```bash
npm run build
npx vitest run src/site-to-gym/pipeline.test.ts src/captureManifest.test.ts
npm run gates
npm run server
npm run test:e2e
```

Results:

- `npm run build`: passed.
- Focused tests: passed, `2` files / `11` tests.
- `npm run gates`: passed.
  - build passed;
  - lint passed;
  - evidence verifier passed, `40/40`;
  - full unit suite passed, `31` files / `243` tests.
- `npm run test:e2e`: passed with local backend running.
  - `8/8` Playwright tests passed.

## Claim Boundaries

Keep these exact boundaries:

- Structured 2D map is the primary MVP output.
- Video and photos add spatial hints, keyframes, landmarks, and uncertainty labels.
- 3D-aware context is not production-grade 3D reconstruction or SLAM.
- The deterministic oracle is the only source of labels, rewards, and readiness metrics.
- This is a bounded Robot-Readiness Gym, not robot safety certification.
- No media is uploaded to a remote server in this MVP; File objects stay local/browser-side and the manifest remains serializable metadata.

## Current Gaps

P0 next:

- Replace deterministic metadata/name-based map construction with a real floor-plan/image parser path where available.
- Add a product-level human review step before treating generated maps as approved customer-owned environments.
- Add a first-class saved artifact/export for the site representation JSON and Gym task set.

P1 next:

- Reuse the Foundry `/api/foundry/parse-floor` route for floor-plan images when a backend/Cerebras key exists, while preserving deterministic repair and fallback.
- Add real OCR/signage extraction for restricted/human-only cues from keyframes/photos.
- Add a richer task generator beyond the current three-task coverage proof.

P2 next:

- Add a visual before/after diff between raw upload evidence and generated map.
- Add browser tests that attach both video and floor-plan image through the app flow.
- Add downloadable trace JSON for design partners.

## Copy-Paste Prompt To Claude

Claude, please review the Video-to-Site-to-Gym MVP in `/Users/bohueilin/hackathons/Origin`. Do not deploy or push.

Context:
- Codex implemented a bounded local MVP that turns uploaded site media into site artifacts, a structured 2D site representation, a Robot-Readiness Gym, RSI tasks, deterministic oracle labels, readiness metrics, and a replayable trace.
- Files to inspect:
  - `apps/origin-web/src/site-to-gym/types.ts`
  - `apps/origin-web/src/site-to-gym/videoKeyframes.ts`
  - `apps/origin-web/src/site-to-gym/pipeline.ts`
  - `apps/origin-web/src/site-to-gym/pipeline.test.ts`
  - `apps/origin-web/src/components/CaptureConsole.tsx`
  - `apps/origin-web/src/App.css`
  - `apps/origin-web/src/captureManifest.ts`
  - `apps/origin-web/src/captureManifest.test.ts`

Review questions:
1. Does video upload actually work as a local MVP?
2. Does video materially contribute to site context artifacts, keyframes, and map confidence without overclaiming CV/SLAM?
3. Is the generated site representation credible enough for a bounded MVP?
4. Is RSI/RL Gym generation wired end-to-end?
5. Is deterministic oracle labeling preserved as the only label/reward authority?
6. Does the UI make uncertainty, review needs, and claim boundaries visible?
7. Any P0/P1/P2 issues before founder-authorized deploy?

Run:

```bash
cd /Users/bohueilin/hackathons/Origin/apps/origin-web
npm run gates
npm run server
npm run test:e2e
```

Optional rendered probe:

- Start `npm run preview -- --host 127.0.0.1 --port 4174`.
- Open `http://127.0.0.1:4174/app.html`.
- Upload/attach an MP4.
- Confirm the proof panel renders:
  - pipeline steps;
  - keyframe strip;
  - structured 2D map;
  - task cards;
  - readiness metrics;
  - replayable trace.

Return:
- ACCEPT / ACCEPT WITH FIXES / REJECT.
- P0/P1/P2 findings with file:line.
- Any copy changes needed to keep the claims honest.
- A markdown handoff note in the repo.
- A copy-paste prompt back to Codex so we can continue the loop.
