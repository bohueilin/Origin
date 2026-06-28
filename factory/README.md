# Factory (EnvForge) — RL Environment Factory control plane

The admin console for **incoming RL-environment submissions** — turning real-world behavior into
reproducible, evaluable RL environments (task spec, verifier rules, hidden tests, expert calibration,
readiness gates, export). This is the intake front-end for the RSI loop (see
[../docs/RSI-ROADMAP.md](../docs/RSI-ROADMAP.md)).

## Status
- `legacy/envforge-console_615.html` — the original 1,722-line single-file prototype, kept **byte-for-byte**.
  Open it directly in a browser (`file://…/legacy/envforge-console_615.html`); no build, mock data inline.

## Next (planned) — `apps/envforge`
Port the prototype to a real React/Vite app (matching `apps/origin-web` / `apps/passport`) backed by
InsForge tables for the submission queue + reviewer workflow + artifact export. Tracked as **R1** in the
RSI roadmap. The deterministic verifier it produces feeds the Cobra/Chronos hardening loop before any
environment is used for training.
