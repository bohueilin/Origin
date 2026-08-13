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
`--paper #f6f5f2` · `--paper-2 #fff` · `--ink #16181d` · `--ink-soft #464e5a` · `--steel #626b78` ·
`--line #e3e2dd` · `--signal #2a56e8` · `--signal-ink #1c40c2` · `--verify #0f7a57` ·
`--warn #9a6300` · `--danger #b23a30` · radii 14/10px · Inter + Space Grotesk.
Console surfaces (`src/App.css`) use the warm `--con-*` palette; never let both `:root` token
sets collide on one page.

## Verify-before-done (every change)
build ✅ + lint ✅ (zero new errors) + touched pytest ✅ → live on localhost (desktop + 375px, zero
console errors) → secret-scan → user inspects → push → deploy. Push/deploy/model-spend need
explicit confirmation.
