#!/usr/bin/env bash
# ----------------------------------------------------------------------------
# .agentloop/run.sh — neutral orchestrator: alternate Codex (Brain, read-only)
# and Claude (Arm, the writer) until the GOAL is shippable.
#
#   bash .agentloop/run.sh                # full-auto (watch it)
#   MAX_ROUNDS=12 bash .agentloop/run.sh  # cap rounds
#   STEP=1 bash .agentloop/run.sh         # pause for Enter between phases (semi-auto)
#
# Tunables (env):
#   MAX_ROUNDS   default 8
#   CODEX_CMD    default: codex exec --sandbox read-only --ask-for-approval never
#   CLAUDE_CMD   default: claude --permission-mode acceptEdits --add-dir <repo>
#                (for fully unattended runs you may use: --dangerously-skip-permissions)
#   GATES        default: npm run build && npm run lint && npm run verify:evidence
# ----------------------------------------------------------------------------
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1
ROOT="$PWD"
L=".agentloop"
P="$L/prompts"

MAX_ROUNDS="${MAX_ROUNDS:-8}"
CODEX_CMD="${CODEX_CMD:-codex exec --sandbox read-only}"
CLAUDE_CMD="${CLAUDE_CMD:-claude --permission-mode acceptEdits --add-dir "$ROOT"}"
GATES="${GATES:-npm run gates}"

bar() { printf '\n\033[1m── round %s · %s ──\033[0m\n' "$1" "$2"; }
pause() { [ "${STEP:-0}" = "1" ] && { read -r -p "   [enter to continue] " _; } || true; }
state() { printf '{"round":%s,"phase":"%s","status":"%s","at":"%s"}\n' \
  "$1" "$2" "$3" "$(date -u +%FT%TZ)" > "$L/STATE.json"; }

# --- preflight -------------------------------------------------------------
command -v codex  >/dev/null || { echo "ERROR: 'codex' CLI not found. Install: npm i -g @openai/codex && codex login"; exit 1; }
command -v claude >/dev/null || { echo "ERROR: 'claude' CLI not found (Claude Code)."; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "ERROR: not a git repo."; exit 1; }

if git rev-parse --abbrev-ref HEAD | grep -qx 'main'; then
  BRANCH="agentloop/$(date +%Y%m%d-%H%M%S)"
  echo "On main — creating loop branch $BRANCH"
  git switch -c "$BRANCH" || exit 1
fi
echo "Loop branch: $(git rev-parse --abbrev-ref HEAD)"

# seed handoff files so first-round 'cat' never fails
for f in design.md implementation.md review.md gates.log; do [ -f "$L/$f" ] || : > "$L/$f"; done

fails=0
for ((i=1; i<=MAX_ROUNDS; i++)); do
  # 1) CODEX DESIGN (read-only) -> design.md
  bar "$i" "CODEX DESIGN"; state "$i" design running
  $CODEX_CMD "$(cat "$P/codex-design.md")" | tee "$L/design.md"
  if head -1 "$L/design.md" | grep -q '^STATUS: SHIPPABLE'; then
    echo; echo "✅ Codex declared SHIPPABLE. Loop complete."; state "$i" done shippable; break
  fi
  if [ ! -s "$L/design.md" ]; then
    echo; echo "⛔ Codex DESIGN produced no output — the codex CLI call failed."
    echo "   Check the invocation:  $CODEX_CMD"
    echo "   Verify your flags with: codex exec --help"
    echo "   Then override if needed, e.g.: CODEX_CMD='codex exec' bash .agentloop/run.sh"
    state "$i" design failed; break
  fi
  pause

  # 2) CLAUDE IMPLEMENT (writer) -> implementation.md
  bar "$i" "CLAUDE IMPLEMENT"; state "$i" implement running
  $CLAUDE_CMD -p "$(cat "$P/claude-implement.md")" | tee "$L/implementation.md"
  if grep -q '^STATUS: BLOCKED' "$L/implementation.md"; then
    echo; echo "⛔ Claude is BLOCKED — halting for human/Codex review."; state "$i" implement blocked; break
  fi
  pause

  # 3) GATES (referee) -> gates.log
  bar "$i" "GATES"; state "$i" gates running
  if bash -c "$GATES" > "$L/gates.log" 2>&1; then
    echo "GATES: PASS" | tee -a "$L/gates.log"; fails=0
  else
    echo "GATES: FAIL" | tee -a "$L/gates.log"; tail -20 "$L/gates.log"; fails=$((fails+1))
  fi

  git add -A && git commit -q -m "agentloop round $i" || echo "(nothing to commit)"

  if [ "$fails" -ge 2 ]; then
    echo; echo "⛔ Gates failed twice in a row — halting for human review."; state "$i" gates stuck; break
  fi
  pause

  # 4) CODEX REVIEW (read-only) -> review.md
  bar "$i" "CODEX REVIEW"; state "$i" review running
  $CODEX_CMD "$(cat "$P/codex-review.md")" | tee "$L/review.md"
  pause
done

echo; echo "Loop ended on branch $(git rev-parse --abbrev-ref HEAD)."
echo "Audit trail: $L/design.md, implementation.md, review.md, gates.log, STATE.json"
echo "Review the diff:  git log --oneline main..HEAD"
