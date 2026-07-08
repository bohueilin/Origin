# .agentloop — Codex (Brain) ⇄ Claude (Arm) build loop

A semi/full-auto coding loop. **Codex CLI** designs + reviews (read-only),
**Claude Code** implements (the only writer), gates referee each round, and the
loop runs until `GOAL.md`'s definition-of-done is met.

> The Desktop GUIs (Codex Desktop / Claude Desktop) can't be driven
> programmatically — the autonomous loop runs on the **CLIs**. Use the Desktop
> apps to watch (open the repo and read these `.md` files as they update).

## One-time setup
```bash
npm i -g @openai/codex && codex login    # Codex CLI (Brain)
claude --version                          # Claude Code (Arm) — already installed
```

## Run
```bash
# semi-auto: pause for Enter between every phase (recommended first)
STEP=1 bash .agentloop/run.sh

# full-auto: watch it go
MAX_ROUNDS=12 bash .agentloop/run.sh

# fully unattended in the background:
MAX_ROUNDS=12 nohup bash .agentloop/run.sh > .agentloop/loop.log 2>&1 &
tail -f .agentloop/loop.log
```
The loop creates a throwaway branch `agentloop/<timestamp>` if you're on `main`, and
commits one round at a time so everything is diffable and revertable.

## How it works each round
1. **Codex DESIGN** (read-only) → writes `design.md` (the plan).
2. **Claude IMPLEMENT** (writer) → reads `design.md`, may object (`STATUS: BLOCKED`),
   else implements it, runs gates, writes `implementation.md`.
3. **GATES** → `npm run build && npm run lint && npm run verify:evidence` → `gates.log`;
   round is committed.
4. **Codex REVIEW** (read-only) → writes `review.md` + the next `design.md`.

Stops when Codex outputs `STATUS: SHIPPABLE`, Claude is `STATUS: BLOCKED`, gates fail
twice in a row, or `MAX_ROUNDS` is hit.

## Controls
- `MAX_ROUNDS`, `STEP=1` (pause between phases).
- `CODEX_CMD` / `CLAUDE_CMD` / `GATES` to override the commands (e.g. add `npm test`
  to GATES once tests exist, or `--dangerously-skip-permissions` for unattended Claude).
- Kill switch: `pkill -f agentloop/run.sh`.

## Edit these to steer the loop
- `GOAL.md` — the destination + stop condition (edit anytime to re-aim).
- `PROTOCOL.md` — the rules.
- `prompts/*.md` — exactly what each agent is told each turn.
