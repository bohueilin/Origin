# Origin P0 candidate exception decisions — 2026-10-19

These decisions apply to the `codex/origin-design-p0` candidate following the F1 preview at `https://eaa31a29.origin-physical-ai.pages.dev/`. The owner authorized implementation of E02, E06 and E08 and publication of a new static preview. Production acceptance, merge and release remain separate controlled steps.

## Accepted limits

**E01 — Proof interaction size, bounded exception.** The owner accepts this candidate's `apps/origin-web/src/proof/chain.ts` at **5,469 source / 3,386 minified / 1,519 gzip bytes**. Measurement uses standalone esbuild `transform(source, { loader: 'ts', minify: true })`, then Node `gzipSync` on the output; shared verifier imports are excluded. The literal **≤2KB requirement remains unmet**. Acceptance is not permission for future growth. Source SHA-256: `fe7f7f8776236a370bca1b9cd234ed09af365278fbe04b43a1b2c057128823c3`.

**E05 — Capture transfer budget, temporary exception.** The owner accepts the previously measured approximately **566,747 bytes** on `/capture` against the **350KB ceiling** for this candidate. The route is **not passing** that requirement. No capture optimization is included in this change. A separately scoped optimization with fresh cold-load profiling follows; the recorded baseline is not a claim about every subsequent load.

## Authorized implementation

- **E02:** provide a narrow-screen delegation tree with labels at least 12 rendered CSS px at 320px and 375px on both `/over-grant` and `/security`, including first paint and no-JavaScript output. Preserve desktop geometry, six identities, grant data, computation, control names, pressed states and explanatory status log.
- **E06:** remove the homepage cinematic controller's automatic startup play call. Keep the existing poster, media encodings, `preload="none"`, Play/Pause/Replay control and pause behavior. Require zero video bytes before activation in normal, reduced-motion and save-data modes.
- **E08:** add verified intrinsic dimension attributes to the existing app logo, auth/admin marks and review images, passport mark and home hero video. Preserve displayed sizes, reserved boxes, cropping, source URLs, media bytes and playback.

## E09/E13 — Written approval of three existing social cards only

The owner's 2026-10-19 instruction approves each exact subtext below and its current rendered 1200×630 card. SHA-256 identifies the approved bytes; regenerated or revised cards require a new decision. This does not approve any other asset.

| Card | Exact approved subtext | Current rendered file | SHA-256 |
| --- | --- | --- | --- |
| Simulation | Inspect paths, constraints, and a deterministic plan in a seeded warehouse simulation. | `apps/origin-web/public/og/simulation.jpg` | `ed58e4f3e4c21d3342f8b9dc3a893abef5e0d9ac1b7d9728f25f2b7102a333c4` |
| Operations | Inspect utilization, throughput, and collision events against synthetic shift targets. | `apps/origin-web/public/og/operations.jpg` | `4cb56e48f4709770ad7acb9fd03f5d94255e7943e3da59d0231869ee2af6f5c2` |
| Reference check vs runtime | Separate a browser-local synthetic reference check from proposed controlled execution. | `apps/origin-web/public/og/reference-check-vs-runtime.jpg` | `aba71928b383a9a4140ae572834ec92ac4ec744edeee9d49873a9267774eeb5b` |

The still-image pilot and the asset validator are **deferred, not produced and not approved**. Approval of these three cards is not pilot approval, approval of an empty contact-sheet slot, or advance approval of a future photograph or generated asset.
