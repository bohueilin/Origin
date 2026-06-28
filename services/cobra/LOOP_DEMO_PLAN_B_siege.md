# Part B — Siege liveness + golden replay (frontend / server / ops)

> One of two parallel tracks (see `LOOP_DEMO_PLAN.md` for the shared product/demo context).
> **Part A and Part B share NO files and have no ordering dependency** — they run fully in parallel.
> **This part is owned by the dashboard/siege agent (Track C).** Needs a live run (ANTHROPIC_API_KEY)
> and a browser.

## Goal

Make the **live siege demo bulletproof on the hardest tasks**, and re-record a **golden replay**
that shows the full, compelling arc as the stage safety net — including the friendly-fire beat that
proves honest-pass is enforced.

## Files this part OWNS (only these are created/edited here)

- `golden_run.jsonl` (re-record)
- `dashboard/index.html` (2D siege — wiring/panel/polish)
- `viz3d/siege.html` (3D — keep in sync if needed)
- `server/__main__.py` (verify the live path; minor fixes only)
- `tier_a.json` (ensure a hardest-task run writes the consequence slot)
- `tests/test_replay.py` / `tests/test_dashboard.py` (if the re-record changes fixtures)

## Files this part MUST NOT touch (Part A / other owners)

`src/cobra/report/**`, `tests/test_report.py` (Part A); `bench/` internals; the eval-honesty core
(`grader/ oracle/ metrics/ templates/` — Rayan) beyond reading outputs.

## Tasks

1. **Verify the live end-to-end path on hardest tasks.** `python -m cobra.server` (live) →
   `run_live(hardest tasks)` → `bus.emit` → `/ws` → siege. Confirmed importable/signature-compatible
   already; now run it and watch a real **breach → patch → gauge-climb** animate. Flag/fix any stall
   (per-task timeout, a task that yields no breach, empty robustness updates). Keep `--replay` as the
   fallback the whole time.
2. **Re-record `golden_run.jsonl` on hardest tasks.** The current one is on *easy* tasks
   (HumanEval/0,2,4,8,11,15) and has **no `patch_rejected`** event. Record a run that includes:
   a clean **baseline→climb** `robustness_update` sequence (starts low, ends high), `breach_found` /
   `patch_applied` / `agent_killed`, and at least one **`patch_rejected`** (over-tighten → "turret
   shoots a friendly, torn down") so the safety-net replay shows the honest-pass guardrail.
3. **Surface the consequence + hit-rate.** Ensure a hardest-task run writes `tier_a.json` (the
   dashboard already has the slot) and the exploitability hit-rate ("M of N standard graders
   breachable") shows as a text/Tier-A beat.
4. **Polish the siege** for the demo script (legible gates on hardest tasks, the friendly-fire
   animation, the gauge from ~0% → ~100% with honest-pass pinned).

## Reuse (do not reimplement)

- `conductor.live.run_live(task_ids, client=, emit=)` — the live driver (already wired).
- `server/app.py` `create_app` + `/ws` + `--replay ReplayPublisher` — already built.
- `substrate.load_hardest` — hardest tasks are the default; the demo run should use them.
- The 7 Seam-2 events in `events.py` — the dashboard already handles all of them.

## Verification

1. **Live:** `python -m cobra.server` on hardest tasks → in the browser, watch a real
   breach→patch→climb; no stalls; gauge ends high with honest-pass at 100%.
2. **Replay:** `python -m cobra.server --replay golden_run.jsonl` shows the same arc **including a
   `patch_rejected` friendly-fire moment** and the baseline→climb gauge.
3. `make check` green (incl. any updated replay/dashboard fixtures).

## Handoff / integration (after both parts land — a 1-line step, not parallel work)

Once Part A produces `runs/report.html` with a stable path/schema, optionally add a single
link/iframe from `dashboard/index.html` to the report (this is **Part B's** edit, so only one owner
touches `index.html`). Not required for the core demo.
