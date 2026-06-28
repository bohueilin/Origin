# Part A — The per-env report (backend, deterministic)

> One of two parallel tracks (see `LOOP_DEMO_PLAN.md` for the shared product/demo context).
> **Part A and Part B share NO files and have no ordering dependency** — they run fully in parallel.
> **This part is owned by the loop/engine agent.**

## Goal

Produce the **per-env report card** — the "value to them" artifact: *"your reward accepted X% of
cheats → 0% after hardening, honest-pass 100%, here are the specific cheats it let through,"* plus
the consequence number and exploitability hit-rate. It is **assembly over existing metrics**, not
new metric math, and is fully **deterministic (no API key, no browser)** when run with the seed
breach source.

## Files this part OWNS (only these are created/edited here)

- `src/cobra/report/__init__.py` (new)
- `src/cobra/report/card.py` (new) — the `ReportCard` dataclass + builder + renderers
- `src/cobra/report/__main__.py` (new) — CLI: run the loop on an env → write JSON + standalone HTML
- `tests/test_report.py` (new)
- Runtime outputs (not checked in): `runs/report_<env>.json`, `runs/report_<env>.html`

## Files this part MUST NOT touch (Part B / other owners)

`dashboard/`, `viz3d/`, `golden_run.jsonl`, `server/`, `tier_a.json` (Part B);
`bench/` internals, `grader/ oracle/ metrics/ templates/ breadth/ consequence/` (read-only — only
import their public outputs). The report renders its **own standalone HTML string** — it does **not**
edit `dashboard/index.html`.

## Build

1. **`ReportCard`** dataclass: `env_name`, `substrate`, `n_tasks`, `cheats_blocked_before`,
   `cheats_blocked_after` (= agreement before/after), `honest_pass`, `hit_rate` ("M of N graders
   breachable"), `reward_naive_points`, `reward_hardened_points`, `examples: list[ExampleCheat]`
   (each: `task_id`, completion snippet, `passed_grader=True`, `failed_oracle=True`).
2. **`build_card(breadth_report, consequence_report) -> ReportCard`** — pull aggregate numbers from
   `BreadthReport` (hit-rate, mean agreement before/after, honest-pass) and `ConsequenceReport`
   (reward points), and 3–5 example cheats from the per-task `TaskResult` breaches.
3. **`to_json(card) -> dict`** and **`render_html(card) -> str`** (a self-contained HTML string —
   inline CSS, no build step; clone the visual tone of the existing dashboard but as its own file).
4. **CLI** `python -m cobra.report --source seed --hardest 5 --out runs/report`:
   call `breadth.run_breadth(...)` (seed source = deterministic, no LLM) → `measure_consequence(...)`
   → `build_card` → write `<out>.json` + `<out>.html`. A `--source discovered` path (live red team)
   is optional and additive.

## Reuse (do not reimplement)

- `breadth.run_breadth` → `BreadthReport` (+ `TaskResult.breaches`) — the aggregate + examples.
- `consequence.measure_consequence` → `ConsequenceReport` — reward points naive vs hardened.
- `bench.score_verifier` / `column` — optional, for the false-accept framing on the card.
- `substrate.load_hardest` — env/task selection (hardest is the default).

## Verification

1. `tests/test_report.py` (deterministic, no network): build a `ReportCard` from a hand-made
   `BreadthReport` + `ConsequenceReport`; assert before < after, honest-pass present, examples
   carry passed-grader/failed-oracle, JSON round-trips, HTML renders non-empty.
2. `make check` green.
3. `python -m cobra.report --source seed --hardest 5 --out runs/report` → open `runs/report.html`
   in a browser; confirm before→after, honest-pass, hit-rate, consequence, and example cheats show.

## Handoff / integration (after both parts land — a 1-line step, not parallel work)

Part B may optionally link/embed `runs/report.html` from the dashboard (a single `<a>`/iframe). To
avoid both touching `dashboard/index.html`, that link is **Part B's** to add once the report file
exists; Part A just guarantees the file path + JSON schema are stable.
