# Plan: Hosted Verifier-Safety Leaderboard (self-serve submission service)

## Context

We have a local verifier-safety benchmark (`bench/`) that, for one rollout dataset, ranks each
reward (naive / hardened / LLM-judge) by a `safety_score` (balanced accuracy, gated by honest-pass)
plus false-accept, honest-pass, and best-of-K. The next step turns this from a local CLI table into
a **hosted, multi-tenant leaderboard**: anyone evaluates their RL environment locally, submits the
result, gets a shareable link to their **personal breakdown**, and their env is placed on a **live
global leaderboard of all evaluated RL envs**. This is the "platform" framing — Cobra becomes a
tool RL people use, not just a demo.

**Architecture choice (decided): self-serve eval, server only stores + ranks + displays.** The
submitter runs `bench` locally with their own keys; the server never runs untrusted grader code and
never pays for inference, so submission is instant and safe. (Server-side eval — running submitters'
graders — is explicitly rejected: untrusted-code execution + cost + latency.)

**Verified tier IS in v1 for canonical substrates.** For EvalPlus / reasoning-gym the submitter
sends raw `(task_id, model, completion, r_naive, r_hardened)` and the server **recomputes `t_oracle`
from the known oracle** (deterministic, no LLM, no untrusted code) → a **"✓ verified"** badge. Custom
envs (incl. HUD/derived-oracle) fall back to **"self-reported"** with an honest chip. This matters
because a leaderboard about gameability is itself gameable — verifying the canonical headline envs is
cheap (we already have `real_scorers` / `rg_real_scorers`) and a big credibility win.

**Board default axis = `false_accept` ("how gameable as shipped"), not cross-env `safety_score`.**
`safety_score` depends on oracle quality (EvalPlus strong, RG weak, custom *approximate*) and on
exploit-suite composition, so ranking *different* envs by safety is apples-to-oranges. `false_accept`
is the most substrate-portable property; every row shows **substrate + suite size (`n_exploits`) +
verified/self-reported** so the comparison is read honestly. `safety_score` stays as a secondary,
within-substrate sort.

This builds entirely on existing infra and is decoupled from the siege dashboard (Track C); it reads
the `bench/` metrics (ours) via their stable public exports — **no edits to `bench/` or
`server/app.py`'s siege routes.** New, additive modules only.

## What already exists (reuse, do not modify)

- **Metrics** (`bench/`, done): `VerifierScore` with `.safety_score` (=50·(catch+honest)),
  `.over_tightened` (honest<0.90), `.false_accept`; `score_verifier`, `rank`, `leaderboard`,
  `column`, `best_of_k_accuracy`, `judge_verifier`. Exported from `bench/__init__.py`.
- **Rollout seam**: `rollout.dataset.load_jsonl` / `Rollout` (env inferable from `task_id`).
- **Web stack**: FastAPI + uvicorn already deps (`pyproject.toml`); `server/app.py` shows the
  `create_app` / route / TestClient patterns; `dashboard/index.html` is the single-file HTML pattern
  to clone. **No new dependencies** — use stdlib `sqlite3` (store) and `urllib.request` (CLI POST).

## Component overview

```
 submitter (local)                         leaderboard server (hosted)            browser
 ─────────────────                         ───────────────────────────            ───────
 python -m cobra.bench.submit            POST /api/submit  ──► store (sqlite)    GET /board
   --data runs/myenv.jsonl                 returns {id, url}                       GET /env/{id}
   --name "my-coding-env"   ───────────►   GET /api/leaderboard ◄── ranked rows    (poll every 4s)
   --url https://board...                  GET /api/env/{id}    ◄── one breakdown
   (computes metrics via bench,                                                    live global table
    prints the returned link)                                                      + personal page
```

## 1. Data model — `src/cobra/server/store.py` (new, stdlib sqlite3)

One table, one row per submission (snapshots; resubmitting creates a new row, leaderboard shows the
best per `env_name`).

```
submissions(
  id TEXT PRIMARY KEY,            -- secrets.token_urlsafe(6)
  env_name TEXT NOT NULL,
  substrate TEXT,                 -- "evalplus" | "reasoning-gym:gsm_symbolic" | "custom"
  headline_false_accept REAL,    -- "how gameable as shipped" → DEFAULT global rank key
  headline_safety REAL,          -- naive-reward safety_score → secondary (within-substrate) sort
  n_completions INTEGER, n_exploits INTEGER, model_count INTEGER,
  verified INTEGER DEFAULT 0,    -- 1 if server recomputed t_oracle (canonical substrate), else 0
  payload_json TEXT,             -- full submission: verifier rows + best-of-K + a few example rows
  created_at TEXT                 -- ISO8601 (passed in by caller; server uses datetime at request time)
)
```

Functions: `init_db(path)`, `insert(sub) -> id`, `get(id) -> dict | None`,
`leaderboard(limit=100, sort="gameable") -> list[dict]` (best row per `env_name`; default ordered by
`headline_false_accept` desc — most-gameable first; `sort="safety"` orders by `headline_safety` desc
as the secondary within-substrate view). DB path from
`GOODHART_BOARD_DB` env var, default `runs/leaderboard.db`. `init_db` is idempotent (CREATE IF NOT
EXISTS), called at app startup.

## 2. Submission schema — pydantic models in `src/cobra/server/leaderboard.py` (new)

```
class VerifierRow(BaseModel):     # one reward's metrics (from VerifierScore)
    name: str; safety_score: float; catch_rate: float; false_accept: float
    honest_pass: float; agreement: float; best_of_k: float | None = None
    over_tightened: bool = False

class ExampleRow(BaseModel):      # for the vivid per-env page (a few, not the whole rollout)
    task_id: str; kind: str       # "naive_accepted_cheat" | "hardened_kept_honest"
    completion: str; r_naive: int; r_hardened: int; t_oracle: int

class Submission(BaseModel):
    env_name: str
    substrate: str = "custom"
    n_completions: int; n_exploits: int; model_count: int = 1
    verifiers: list[VerifierRow]              # naive, hardened, [llm-judge]
    examples: list[ExampleRow] = []           # ~3-6 rows: a cheat the naive accepted + an honest one
    # headline = the naive/default row (how gameable the env ships); validated to exist

class VerifiedSubmission(BaseModel):          # canonical substrates only → server recomputes t_oracle
    env_name: str
    substrate: str                            # must be "evalplus" | "reasoning-gym:<dataset>"
    rows: list[dict]                          # raw {task_id, model, completion, r_naive, r_hardened}
```

Validation: non-empty `env_name`; metrics clamped to sane ranges; `verifiers` must include a row
named `naive` (the headline). Reject malformed with 422 (pydantic does this). `examples` capped
server-side (e.g. ≤8) and truncated for display.

## 3. API + page server — `src/cobra/server/leaderboard.py` (new FastAPI app, separate from siege)

`create_leaderboard_app(db_path) -> FastAPI` with:
- `POST /api/submit` — validate `Submission` (self-reported), derive `headline_*` from the `naive`
  row, `insert` (verified=0), return `{ "id": ..., "url": f"{base}/env/{id}" }`.
- `POST /api/submit/verified` — accept `VerifiedSubmission`; **recompute `t_oracle`** server-side via
  the substrate's scorers (`rollout.scorers.real_scorers` / `rg_real_scorers` — deterministic, no
  LLM, no untrusted code), rescore the verifiers, `insert` with verified=1. Reject unknown
  substrates with 422. (Build alongside `/api/submit`, not deferred.)
- `GET /api/leaderboard?sort=gameable|safety` — ranked JSON rows (best per env_name); **default
  `gameable`** (false_accept desc). Each row carries `substrate`, `n_exploits`, `verified`.
- `GET /api/env/{id}` — full `payload_json` (verifier rows + best-of-K + example rows) for the
  detail page (404 if missing).
- `GET /board` — serves `dashboard/leaderboard.html`.
- `GET /env/{id}` — serves the same single-file page (client routes on the path / `#id`).

### Frozen GET response contract (what the frontend codes against — LIVE & seeded)

```jsonc
// GET /api/leaderboard?sort=gameable|safety   (default gameable = most false-accept first)
{ "sort": "gameable", "rows": [
  { "rank": 1, "id": "seed-9PNEZQ", "env_name": "hud-arithmetic", "substrate": "custom",
    "false_accept": 1.0, "safety_score": 50.0, "n_exploits": 8, "n_completions": 16,
    "verified": false, "created_at": "2026-06-21T09:48:07+00:00" } ] }

// GET /api/env/{id}
{ "id": "seed-9PNEZQ", "env_name": "hud-arithmetic", "substrate": "custom", "verified": false,
  "n_completions": 16, "n_exploits": 8, "board_rank": 1,
  "verifiers": [ { "name": "naive", "safety_score": 50, "catch_rate": 0.0, "false_accept": 1.0,
                   "honest_pass": 1.0, "agreement": 0.5, "best_of_k": 0.38, "over_tightened": false },
                 { "name": "hardened", "safety_score": 100, ... } ],
  "gap": { "naive": 0.38, "hardened": 1.0 },
  "examples": [ { "task_id": "arith/3", "kind": "naive_accepted_cheat",
                  "completion": "Could be 144? Final answer: 145",
                  "r_naive": 1, "r_hardened": 0, "t_oracle": 0 } ] }

// GET /api/env/{unknown} → 404 {"detail": "submission not found"}
```
Run it: `python -m cobra.server.leaderboard_main --port 8100 --seed` → board + 3 seeded envs at
`http://localhost:8100/api/leaderboard`. `/board` and `/env/{id}` serve `dashboard/leaderboard.html`
(a placeholder until the frontend lands).

Kept **separate** from `server/app.py` (the siege app keeps its bus/websocket/lifespan untouched).
Entry point: `src/cobra/server/leaderboard_main.py` → `python -m cobra.server.leaderboard_main
--port 8100 [--db runs/leaderboard.db]`, mirroring `server/__main__.py`'s `_ensure_port_free` +
`uvicorn.run` pattern.

## 4. CLI submission — `src/cobra/bench/submit.py` (new, own entry; avoids the contested `__main__.py`)

`python -m cobra.bench.submit --data runs/myenv.jsonl --name "my-env" --url https://board... [--judge] [--verified]`
- Loads the rollout JSONL (`load_jsonl`), builds verifiers (`column("r_naive")`,
  `column("r_hardened")`, optional `judge_verifier()`), scores via `score_verifier`, computes
  `best_of_k_accuracy` per verifier, infers `substrate` from the first `task_id`.
- Picks **~3–6 example rows** for the detail page: cheats the naive accepted (`r_naive=1,
  t_oracle=0`) + honest solves the hardened kept (`r_hardened=1, t_oracle=1`); completions truncated.
- Builds the `Submission` payload and POSTs to `/api/submit` with **stdlib `urllib.request`**.
- `--verified` (canonical substrates only): instead POST raw `{task_id, model, completion, r_naive,
  r_hardened}` rows to `/api/submit/verified` so the server recomputes `t_oracle` → "✓ verified".
- Prints the returned link. `--dry-run` prints the payload without POSTing.

(A `--submit` flag could later be wired into `bench/__main__.py` as a one-line call to
`bench.submit.submit(...)`; the standalone entry works on its own, so keep it separate for now.)

## 5. Frontend — `dashboard/leaderboard.html` (new single-file, clone `dashboard/index.html` style)

One HTML file, no build step, fetch-based. Two views switched by path/hash:
- **Global board** (`/board`): polls `GET /api/leaderboard` every ~4s; ranked table — rank, env
  name, **substrate**, **false-accept (default sort, "how gameable")**, safety_score, honest-pass,
  **suite size (`n_exploits`)**, and a per-row **"✓ verified" / "self-reported"** chip. Sort toggle
  (most-gameable [default] vs safest); rows grouped/labeled by substrate so cross-substrate numbers
  aren't read as directly comparable. New/updated rows animate in.
- **Personal breakdown** (`/env/{id}`): fetch `GET /api/env/{id}`; show the env's verifier rows
  side by side (naive vs hardened vs judge), the headline "your reward is X% gameable; hardening
  takes it to Y%", the best-of-K gap, this env's board position, and — the vivid part — the
  **example rows**: a concrete completion the naive reward *accepted* but the oracle marks wrong,
  next to an honest one the hardened reward kept. A verified/self-reported chip + "share this link".

Reuse the existing dashboard's fonts/colors for visual consistency with the siege.

## 6. Hosting / demo

- Local: `python -m cobra.server.leaderboard_main --port 8100`; persistence = the SQLite file
  (survives restarts within the demo). Add `runs/leaderboard.db` to `.gitignore`.
- Public link for the demo: front it with a tunnel (`cloudflared tunnel --url http://localhost:8100`
  or ngrok) so `/env/{id}` links are openable from any browser. Document the one command.

## Build order (each step independently demoable)

1. **Store + API + a seeded board** — `store.py` + `leaderboard.py` (`/api/submit`,
   `/api/leaderboard` default-gameable, `/api/env/{id}`) + `leaderboard_main.py`. Verify with
   TestClient + `curl`.
2. **CLI submit + examples** — `bench/submit.py`; end-to-end: run it against a local rollout JSONL →
   row appears via `GET /api/leaderboard`, with example rows in the payload.
3. **Verified tier (canonical)** — `/api/submit/verified` recomputes `t_oracle` via the substrate
   scorers; `--verified` in the CLI; "✓ verified" badge. Do this in v1, not deferred.
4. **Frontend** — `dashboard/leaderboard.html`: global table (polling, default most-gameable,
   substrate + suite size + verified chip) + per-env page with the example completions.
5. **Polish** — sort toggle, verified/self-reported chips, animate-in, share button, tunnel command.

## Files

| File | New/Edit | Purpose |
|---|---|---|
| `src/cobra/server/store.py` | new | sqlite persistence |
| `src/cobra/server/leaderboard.py` | new | FastAPI app: API + page routes + schema |
| `src/cobra/server/leaderboard_main.py` | new | `python -m` entry (uvicorn + port guard) |
| `src/cobra/bench/submit.py` | new | CLI: compute metrics + examples locally + POST (`--verified`) |
| `dashboard/leaderboard.html` | new | global board (default most-gameable) + per-env breakdown w/ examples |
| `tests/test_leaderboard.py` | new | TestClient: submit→rank→detail, 404, ordering, verified recompute |
| `.gitignore` | edit | ignore `runs/leaderboard.db` |

**Additive only — no edits to:** `bench/` (ours; read via public exports), `server/app.py` siege
routes + bus/websocket/lifespan (Track C). The leaderboard is a separate FastAPI app on its own port.

## Edge cases & decisions

- **Resubmission:** allowed; leaderboard shows the **best row per `env_name`** (resubmitting can
  improve your rank). All snapshots retained in the table.
- **Validation:** pydantic clamps/validates; missing `naive` row → 422.
- **Concurrency:** sqlite with a short-lived connection per request + WAL; fine for demo scale.
- **Empty/degenerate suites:** if `n_exploits == 0`, store but flag "no exploits — false-accept
  undefined" on the page (don't rank it as perfectly safe).
- **Cross-substrate ranking:** safety/false-accept across substrates rest on different oracle
  qualities + suite compositions → not strictly comparable. Default to the false-accept axis, label
  substrate + suite size + verified per row, and group by substrate; never present one global
  "safety" number as authoritative across envs.

## Integrity (honest framing)

Two tiers, both honest, both in v1:
- **Verified (canonical substrates):** EvalPlus / reasoning-gym submit raw `(task_id, model,
  completion, r_naive, r_hardened)`; the server **recomputes `t_oracle` from the known oracle**
  (deterministic, no LLM, no untrusted code) → **"✓ verified"**. The headline envs are trustworthy.
  Slot: the `verified` column + the `/api/submit/verified` route calling the existing scorers.
- **Self-reported (custom / HUD / derived-oracle):** numbers POSTed as-is with a **"self-reported"**
  chip — do not over-claim. Talking point: "a leaderboard about gameability is itself gameable — so
  the canonical envs are server-verified, and the rest are labeled."

Deferred to v2: verifying *custom* substrates (needs their oracle) and anti-spam on `env_name`.

## Verification

1. `make check` green incl. `tests/test_leaderboard.py` (FastAPI TestClient — same pattern as
   `tests/test_dashboard.py`; no network): POST a submission → `GET /api/leaderboard` (default
   gameable) shows it ranked → `GET /api/env/{id}` returns the breakdown incl. example rows →
   unknown id 404s → a more-gameable env ranks ABOVE a hardened one on the default axis → a
   `/api/submit/verified` POST recomputes `t_oracle` deterministically and lands with `verified=1`.
2. Manual end-to-end: start `leaderboard_main` locally; `python -m cobra.bench.submit --data
   <a real rollout JSONL> --name demo-env --url http://localhost:8100`; open the printed
   `/env/{id}` and `/board` in a browser; resubmit with better numbers and confirm the row updates.
3. Tunnel smoke: run the `cloudflared`/ngrok command, open the public `/env/{id}` from a phone.

## Coordination

- The `bench/` metrics are **ours** (this session's work), and the public exports this plan reads —
  `score_verifier`, `column`, `rank`, `best_of_k_accuracy`, `judge_verifier`,
  `VerifierScore.safety_score/.over_tightened/.false_accept` — are all present and stable in
  `bench/__init__.py`. The verified tier additionally calls `rollout.scorers.real_scorers` /
  `rg_real_scorers` server-side. No `bench/` edits needed (new files only).
- `server/` and `dashboard/` are Track C (Rushil) — give him a heads-up; the new files are additive
  and don't change the siege app, but they live in his areas. Real paths: `src/cobra/server/`.
