# Origin — Design Principles (standing; apply by default, don't re-ask)

Target: frontier-lab / YC quality. Audience: YC partners + high-trust safety/robotics/ops buyers.

## Anthropic frontend principles
- **Restraint.** One idea per screen; cut the second headline. Collapse depth behind disclosure.
- **One signature moment.** Per surface, exactly one "wow." For the console that is the **dark
  Brain Stream** (live plan → verify → repair) in Step 2. Everything else is supporting and calm.
- **Light → dark → light rhythm.** The app is **bright** (`--bg #f6f8fc`); the only dark beat is the
  signature stream (`#0f172a`, mono), framed by light before/after. No dark app.
- **The finish / escalate / refuse triad is the visual through-line.** Color it consistently with
  `--pos` (finish) / `--warn` (escalate) / `--neg` (refuse) at every step — capture, brain stream,
  proving ground ledger, and the license report.
- **Reuse > invent.** New components render *process*; they never re-derive scores. All "judge"
  surfaces route through existing components (VerifierCard, PolicyProgression, RsiClimb,
  LicenseResults, DrawnFloorEval) so there is one license spine.

## Honesty (hard rule)
- **"Measured" = a real, oracle-scored run only.** Everything projected/illustrative is labeled
  **"projected."** Never present a projection as measured. Never fabricate a metric.
- State boundaries plainly (e.g. "list price, not Origin pricing"; "declared metadata, not
  image-extracted"; the HUD RL lift is ~flat — say so).

## Product framing
- **Origin = robot readiness.** The "brain" (plan/verify/repair/RL) is a subsystem of how a robot
  earns readiness — never positioned as a separate product. Factory-ops scheduling = "one decision
  competency within readiness," never the headline.
- Keep the current look/flow as the base; fold new work into the funnel: **Submit your site → Build
  the robot brain → Run the proving ground → Get the readiness license.**
- Multi-robot is **descriptive-only**; the deterministic oracle scores a single agent and is the
  single source of truth.

## Copy
- Plain-English, buyer/investor-legible. Avoid overstatement and jargon-as-drama.
- Preferred terms: "Most economical" (not "Cheapest overall"); "readiness license"; "earn permission."

## Tokens (don't introduce a new palette)
`--accent #2f6df6` · `--pos #0f9d6e` · `--warn #b97400` · `--neg #e5484d` · `--panel #fff` ·
`--line #e3e8f1` · `--bg #f6f8fc` · `--code-bg #eef2f8`. Display font: Space Grotesk.

## Verify-before-done (every change)
build ✅ + lint ✅ (zero new errors) + touched pytest ✅ → live on localhost (desktop + 375px, zero
console errors) → secret-scan → user inspects → push → deploy. Push/deploy/model-spend need
explicit confirmation.
