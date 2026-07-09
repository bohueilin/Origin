#!/usr/bin/env bash
# gates-all — the single "run everything, report one number" gate.
#
# Runs every quality gate across the monorepo (TS build + all TS/Python test
# suites + the evidence-verify scripts) with REAL exit codes, captures a
# per-suite pass/fail line, and prints one scoreboard. Exits non-zero if ANY
# suite fails — unlike `make py-test`, nothing here swallows a failure.
#
# Usage: bash scripts/gates-all.sh   (or: make gates-all)
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

# suite name | command (run from ROOT)
declare -a NAMES=()
declare -a RESULTS=()   # PASS / FAIL
declare -a DETAILS=()   # short count/summary
FAILED=0

run() {
  local name="$1"; shift
  local log; log="$(mktemp)"
  printf '── %s\n' "$name" >&2
  if ( "$@" ) >"$log" 2>&1; then
    RESULTS+=("PASS")
  else
    RESULTS+=("FAIL"); FAILED=1
  fi
  NAMES+=("$name")
  # pull the most informative one-line summary out of the log (vitest/pytest style)
  local d
  d="$(grep -hoE '[0-9]+ passed[^,]*(, [0-9]+ (failed|skipped)[^,]*)*|Tests +[0-9]+ passed[^)]*\)|[0-9]+ passed, [0-9]+ skipped|[0-9]+ passed' "$log" | tail -1)"
  [ -z "$d" ] && d="$(tail -1 "$log" | cut -c1-70)"
  DETAILS+=("$d")
  # surface failing logs immediately so failures are never hidden
  # (bash 3.2 on macOS has no negative array index — use the computed last index)
  local last=$(( ${#RESULTS[@]} - 1 ))
  if [ "${RESULTS[$last]}" = "FAIL" ]; then
    echo "   FAILED — last 25 lines:" >&2
    tail -25 "$log" | sed 's/^/   | /' >&2
  fi
  rm -f "$log"
}

# ---- TS build (all workspaces + standalone chronos-ui) ----
run "ts:build (workspaces)"      bash -c 'npm run build --workspaces --if-present'
run "ts:build (chronos-ui)"      bash -c 'cd apps/chronos-ui && npm run build'

# ---- TS test suites (named, first-class) ----
run "ts:origin-web (+evidence+verifier-core globs)" bash -c 'cd apps/origin-web && npx vitest run'
run "ts:janus"                   bash -c 'cd apps/janus && npx vitest run'
run "ts:@origin/evidence"        bash -c 'cd packages/evidence && npx vitest run'
run "ts:@origin/verifier-core"   bash -c 'cd packages/verifier-core && npx vitest run'

# ---- evidence-verify scripts (the numbers are real, not asserted) ----
run "ev:verify:evidence"         bash -c 'cd apps/origin-web && npm run --silent verify:evidence'
run "ev:proof:verify"            bash -c 'cd apps/origin-web && npm run --silent proof:verify'
run "ev:env:verify"              bash -c 'cd apps/origin-web && npm run --silent env:verify'
run "ev:reward:diff"             bash -c 'cd apps/origin-web && npm run --silent reward:diff'
run "ev:/verify selftest"        bash -c 'node apps/origin-web/src/verify/selftest.mjs'

# ---- honesty gate (marketing prose overclaim tripwire) ----
run "honesty-lint"               bash -c 'node scripts/honesty-lint.mjs'

# ---- Python moat (real exit codes — the oracle must never be wrong) ----
run "py:cobra"                   bash -c 'cd services/cobra && uv run pytest -q'
run "py:chronos"                 bash -c 'cd services/chronos && uv run pytest -q'

# ---- scoreboard ----
echo ""
echo "════════════════════════════════════════════════════════════════════════"
echo "  ORIGIN — gates-all scoreboard"
echo "════════════════════════════════════════════════════════════════════════"
for i in "${!NAMES[@]}"; do
  mark="✓"; [ "${RESULTS[$i]}" = "FAIL" ] && mark="✗"
  printf "  %s  %-46s %s\n" "$mark" "${NAMES[$i]}" "${DETAILS[$i]}"
done
echo "────────────────────────────────────────────────────────────────────────"

# ---- machine-readable summary (consumed by the public /trust page) ----
SUMMARY="apps/origin-web/public/trust/gates-summary.json"
mkdir -p "$(dirname "$SUMMARY")"
{
  printf '{\n  "generated_at": "%s",\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  printf '  "all_green": %s,\n  "suites": [\n' "$([ "$FAILED" -eq 0 ] && echo true || echo false)"
  for i in "${!NAMES[@]}"; do
    sep=","; [ "$i" -eq $(( ${#NAMES[@]} - 1 )) ] && sep=""
    dj=$(printf '%s' "${DETAILS[$i]}" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '    {"name": "%s", "result": "%s", "detail": "%s"}%s\n' \
      "${NAMES[$i]}" "${RESULTS[$i]}" "$dj" "$sep"
  done
  printf '  ]\n}\n'
} > "$SUMMARY"
if [ "$FAILED" -eq 0 ]; then
  echo "  ALL GATES GREEN — TS build + TS/Python suites + evidence-verify + honesty."
else
  echo "  ✗ ONE OR MORE GATES FAILED (see logs above)."
fi
echo "════════════════════════════════════════════════════════════════════════"
exit "$FAILED"
