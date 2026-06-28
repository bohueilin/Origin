#!/usr/bin/env bash
# Origin Foundry — one-command local demo.
# Starts the Hono backend (:8787, reads .env.local for the Cerebras key) AND the Vite
# dev server together, waits for the backend to be healthy, then serves /foundry.
# Ctrl-C stops both. Run from anywhere:  bash apps/origin-web/foundry.sh  (or: npm run foundry)
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-8787}"
VITE_PORT="${VITE_PORT:-5173}"

# Start the backend in the background; make sure it dies when this script exits.
PORT="$PORT" node server/main.ts &
BACK=$!
cleanup() { kill "$BACK" 2>/dev/null || true; }
trap cleanup EXIT INT TERM

# Wait (up to ~12s) for the backend to answer /health.
printf 'Starting Origin Foundry backend on :%s' "$PORT"
for _ in $(seq 1 48); do
  if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then break; fi
  printf '.'; sleep 0.25
done
echo ""
if curl -sf "http://localhost:$PORT/health" >/dev/null 2>&1; then
  echo "  ✓ backend ready  →  http://localhost:$PORT"
else
  echo "  ⚠ backend not responding yet — the app will fall back to a labeled mock until it is."
fi
echo "  ▶ opening the app at  http://localhost:$VITE_PORT/foundry"
echo ""

# Foreground the dev server (Ctrl-C here stops everything via the trap).
exec npx vite --port "$VITE_PORT" --strictPort
