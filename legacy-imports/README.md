# legacy-imports/

Useful-but-not-yet-first-class work, imported (copy-only, source-only) so future sessions never need to open the old hackathon folders. Each item is a **snapshot** — promote it to `apps/`/`services/`/`packages/` only when it earns first-class status (a real build + gates in Origin). Secrets, `node_modules`, `dist`, and large binaries were excluded on import.

| Folder | From (source repo @ SHA) | What it is | Active? | Superseded by | Promotion path |
|---|---|---|---|---|---|
| `loopforge/` | `hackathons/Cerebras-enterprise-0628` @ `61fef06` (2026-06-30) | **LoopForge — Enterprise Agent Repair OS** (Track-3): a Vite app that turns a red→green agentic-repair loop into an incident-console + validation-matrix + deep-dive. | Snapshot | — | `apps/loopforge/` once its build + gates run inside Origin's workspaces. Demo `.mp4`s were excluded (re-record if needed). |
| `agent-passport/` | `hackathons/0620-test/physical-ai-demo-test/agent-passport` @ `3b7e252` (2026-06-27) | **AGI-House identity demo** — a self-contained Python passport core (identity + capability + kill-switch) with a dashboard + threat model. A precursor to `apps/passport`. | Snapshot | Largely by `apps/passport` (the TS credential broker) | Fold unique ideas (kill-switch, threat model) into `apps/passport`; otherwise keep as reference. |

**Not imported (remain in source folders for historical archaeology only):** `0619/hud-blank` (HUD v6 reference eval-env), `Cerebras-0628` embodied/webcam + `WINNING_STRATEGY.md` (Quorum core already in `apps/origin-web`), `0620` warehouse-gym TS (superseded by `apps/origin-web`).

These are **copies**; the originals are untouched and remain the rollback.
