# Plan: The Loop as the Product — hardening + per-env report + siege

## Context

After stress-testing the leaderboard pivot, we're committing back to the SPEC's original product:
**an autoresearch loop that automatically hardens a real RL reward function, shows the
before→after robustness gain, and visualizes it as the siege.** The leaderboard's global ranking
turned out thin (bimodal; every "spread" fix was either a reparametrization of false-accept or
needed a seeded verifier pool). The loop doesn't need spread — it needs a clean before→after, which
it has. Its technical credibility is the **eval-honesty + autohardening machinery** (deterministic
grader/oracle, held-out split, regression gate, honest-pass), not the swarm.

**The product is three things, all mostly built:**
1. **The loop** — point at a standard EvalPlus grader → red agents breach it → green team
   auto-hardens → robustness climbs, measured on held-out truth.
2. **The per-env report** — the "value to them" artifact: *"your reward accepted X% of cheats → 0%
   after hardening, honest-pass 100%, here are the specific cheats it let through."*
3. **The siege** — the live animation of (1).

**Explicitly dropped (do not build):** global leaderboard ranking, probes-to-breach, Elo/IRT, live
RL training. The per-env report is the only thing kept from the leaderboard work (it's just the
loop's output presented well). Nothing built this week is wasted — `bench/`, the rollout dataset,
and the metrics all feed the report and the "after" measurement.

## What already exists (reuse, do not rebuild)

- **Engine** (`agents/`, `conductor/`, `green/`): red specialists, conductor (four levers + the
  iterated red↔green `escalate`), LLM green hardening. On main, validated.
- **Metrics** (`metrics/`, `breadth/`, `consequence/`): `agreement` / `baseline_agreement` /
  `honest_pass`; `run_breadth` → `BreadthReport` (hit-rate, mean agreement before/after, honest-pass,
  per-task `TaskResult` with discovered breaches); `measure_consequence` → `ConsequenceReport`
  (reward points naive vs hardened). All measured on the held-out split.
- **Oracle/grader**: deterministic, float-tolerant `_eq` (fixed), `_split_plus` disjointness, hardest
  tasks now the default.
- **Siege**: `server/app.py` (FastAPI, `/`, `/3d`, `/ws`, `tier_a.json`, `capability.json`),
  `server/__main__.py` (live `run_live` + `--replay`), `dashboard/index.html` (2D, handles all 7
  events incl. `patch_rejected` + `robustness_update`), `viz3d/siege.html` (3D), `golden_run.jsonl`.

## What to build / fix (the gaps)

### 1. The per-env report (the main new deliverable — assembly, not new metrics)
A shareable "report card" produced from one loop run on an env (a grader over a task set).
- **New module `src/cobra/report/card.py`**: `ReportCard` dataclass + `build_card(breadth_report,
  consequence_report, examples) -> ReportCard` and `to_json` / `render_html`.
- **Fields**: env/grader name, substrate, n_tasks; **cheats-blocked before→after** (= agreement
  before/after), **honest_pass**, **exploitability hit-rate** ("M of N graders breachable"),
  **consequence** (reward points naive vs hardened), and **3–5 example cheats** (completion snippet +
  "passed grader / failed oracle") pulled from the `TaskResult` breaches.
- **Reuse**: `breadth.run_breadth` (the aggregate + per-task breaches), `consequence.measure_consequence`,
  `bench.score_verifier` (for the false-accept framing if wanted). The report is formatting over these.
- **Render**: a single self-contained HTML page (clone `dashboard/index.html` styling) + the JSON.
  Served at `GET /report` from the existing app (or written to a file for sharing). v1 can be the
  dashboard's end-of-run summary panel + a static file.

### 2. Re-record the golden replay on HARDEST tasks, with a friendly-fire beat
- Current `golden_run.jsonl` is on easy tasks (HumanEval/0,2,4,8,11,15) and has **no
  `patch_rejected`** event — the most visually compelling "turret shoots a friendly, torn down"
  moment never shows in the safety-net replay.
- Re-record from a live `run_live` on hardest tasks; ensure the trace includes a `patch_rejected`
  (over-tighten) beat and a clean baseline→climb `robustness_update` sequence. (Track C / Rushil
  owns the dashboard; coordinate the re-record.)

### 3. Verify the end-to-end LIVE path on hardest tasks
- `python -m cobra.server` (live) → `run_live(hardest tasks)` → `bus.emit` → `/ws` → siege.
  Confirmed importable/signature-compatible earlier but not run live end-to-end. Run it, watch the
  siege animate a real breach→patch→gauge-climb, and flag anything that stalls (timeouts, empty
  breaches on a task). Keep the golden replay as the stage fallback.

### 4. Wire the consequence + hit-rate into the demo surfaces
- `tier_a.json` is already a dashboard slot for the consequence number — make sure a hardest-task
  run writes it. Surface the exploitability hit-rate ("M of N standard graders breachable") as the
  breadth beat (text/Tier-A panel).

## Demo script (~2 min)

1. "Here's a standard EvalPlus grader the room trusts — the exact base-test scoring hundreds of
   papers use."
2. Run the loop → **siege**: red agents breach gates (card: *passed grader / failed oracle*), green
   builds turrets, agents die at sealed gates; **gauge climbs ~0% → ~100% cheats-blocked,
   honest-pass pinned at 100%**, measured on held-out truth.
3. Friendly-fire beat: an over-tightened patch shoots a gold solution, flashes red, torn down
   (`patch_rejected`) — proof honest-pass is enforced.
4. "And across N standard graders, the loop breached M of them" (hit-rate).
5. **Per-env report**: *"your reward paid out for X% of cheats; hardened pays ~0; here are the exact
   cheats it let through"* + the consequence reward-points beat.

## Build order

1. **Report card** (`report/card.py`) over an existing `run_breadth` + `measure_consequence` result;
   JSON + a static HTML render. Test with a seeded/deterministic breadth run (no LLM).
2. **Live end-to-end verification** on hardest tasks; fix stalls; write `tier_a.json`.
3. **Re-record golden replay** on hardest tasks incl. a `patch_rejected` beat (with Rushil).
4. **Wire report into the surfaces** (dashboard summary panel and/or `GET /report`), hit-rate text.

## Files

| File | New/Edit | Purpose |
|---|---|---|
| `src/cobra/report/card.py` | new | ReportCard: assemble breadth+consequence+examples → JSON/HTML |
| `src/cobra/report/__main__.py` | new | CLI: run loop on an env → write report JSON + HTML |
| `dashboard/report.html` (or panel in index.html) | new/edit (Track C) | render the report card |
| `golden_run.jsonl` | re-record (Track C) | hardest tasks + a `patch_rejected` beat |
| `server/__main__.py` / `tier_a.json` | verify | live run writes the consequence slot |

**Do not touch:** `bench/` internals (other agent), the eval-honesty core (`grader/`, `oracle/`,
`metrics/`, `templates/` — Rayan) beyond reading their outputs.

## Verification

1. `make check` green incl. a `test_report.py` (deterministic: build a `ReportCard` from a fixed
   `BreadthReport` + `ConsequenceReport`, assert fields + that before<after and honest_pass reported).
2. Deterministic report: `python -m cobra.report --source seed --hardest 5` → a JSON+HTML card
   with before→after, honest-pass, example cheats, consequence — no API key needed.
3. Live siege: `python -m cobra.server` on hardest tasks → watch a real breach→patch→climb in the
   browser; then `--replay golden_run.jsonl` shows the same arc incl. the friendly-fire beat.

## Out of scope (parked)

Global leaderboard ranking, probes-to-breach, Elo/IRT difficulty rating, learned verifier, live RL
training (two-model gap stays a roadmap slide). `bench/probes.py` and the leaderboard plan stay on
disk as parked work, not on the demo path.

## Coordination

- Siege/dashboard/golden replay = Track C (Rushil) — the report render + golden re-record are his
  area; coordinate.
- Metrics/oracle = Rayan — the report only *reads* `BreadthReport` / `ConsequenceReport`.
- Engine = me — the report-card assembly + live-run verification are in/adjacent to my lane.
