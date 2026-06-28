#!/usr/bin/env bash
# Durable launcher for the FactoryCEO brain. Sources .env (Fireworks key etc.)
# and serves the FastAPI app from the project venv on :8090.
set -euo pipefail
cd "$(dirname "$0")"
set -a; [ -f .env ] && . ./.env; set +a
PY=".venv/bin/python"
[ -x "$PY" ] || PY="python3"
exec "$PY" -m uvicorn api:app --host 0.0.0.0 --port 8090
