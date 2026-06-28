# RUNBOOK — inspect & run the Origin model / training pipeline

The model "brain" lives in `factoryceo_trm/` (a self-contained Python project; invisible to the
Vite/TS build). The static web app does NOT need it — it reads cached JSON under
`public/factoryceo/`. Run the brain to regenerate that cache or to power live planning.

## 0. One-time setup
```bash
cd factoryceo_trm
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env        # fill keys for live LLM/HUD paths (optional; gitignored)
```
Keys (server-side only, never VITE_): `FIREWORKS_API_KEY` (teacher/judge), `HUD_API_KEY`
(HUD grading/RL), optional `ANTHROPIC_API_KEY`, `HF_TOKEN` (regen Staer samples),
`FACTORYCEO_RULER_LLM=1` (LLM-graded soft reward; default off = deterministic).

## 1. Verify it works (offline, no keys, no GPU)
```bash
.venv/bin/python -m pytest tests/ -q          # 9 suites: verifier, repair_loop, safety, ruler, student…
.venv/bin/python run.py --scenarios 25        # scoreboard + results/episodes.jsonl + results/run_30day.json
.venv/bin/python distill/grpo.py --scenarios 4 --group 6   # local GRPO advantages (free)
```
What to look for: the **verifier gates before the RULER judge** (`src/hud_env.py hybrid_reward`,
`src/ruler.py`) — an infeasible/unsafe plan scores ~0 regardless of the judge (anti-reward-hacking).
The repair loop drives hard violations to 0 (`src/repair_loop.py`).

## 2. Regenerate the cached floor library the web reads
```bash
.venv/bin/python src/build_library.py ../public/factoryceo
```
Writes `public/factoryceo/library.json` + `library/{id}.json` — exactly what `FloorLibrary.tsx`
and the cached fallback load.

## 3. Run the live brain (optional) and point the console at it
```bash
./run_brain.sh                                # uvicorn api:app on :8090 (deterministic fallback if no keys)
# in another shell, from the repo root:
VITE_BRAIN_URL=http://localhost:8090 npm run dev
```
The console will stream live plan→verify→repair from `/plan_from_input_stream`; with no brain it
replays the cached floor run. Brain calls never throw (see `src/brainClient.ts`).

## 4. Real HUD / Fireworks / GRPO (needs keys; counts as model spend → confirm first)
```bash
.venv/bin/python distill/hud_run.py                  # HUD-graded run (HUD_API_KEY)
.venv/bin/python distill/launch_fireworks_rft.py     # Fireworks RFT job (FIREWORKS_API_KEY)
```
Honest result on file: `public/factoryceo/hud_rl_curve.json` — the HUD GRPO lift is ~flat; the UI
labels it as such. Open-student rollouts: `results/floor_hud_runs*.json`.

## 5. Add a model to the Scorecards (the deterministic readiness eval — separate from the brain)
This is the `hud-env/physical-ai-warehouse/` oracle eval (real, oracle-scored):
```bash
cd hud-env/physical-ai-warehouse
uv run python -m factorydad1.runner --provider openai --model <id> \
   --base-url-env <BASE_URL_VAR> --api-key-env <KEY_VAR> --label <id>     # → reports/scorecard-<id>.json
uv run python -m factorydad1.export_web                                    # → src/factorydad/data.json
```
Register the new scorecard filename in `factorydad1/export_web.py` `_SCORECARD_FILES`. Only label a
model "measured" after this real run; otherwise it stays "projected" in the UI.

## Scope / honesty
No real robot control, no PLC/MES/ERP integration. Isaac is cloud-GPU scaffolding; MuJoCo covers the
Mac demo; V-JEPA uses a deterministic offline stub without weights. The deterministic verifier/oracle
is the only judge everywhere.
