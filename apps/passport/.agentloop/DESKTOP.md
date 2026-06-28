# DESKTOP relay cheat-sheet (Codex Desktop ⇄ Claude Desktop)

The Desktop GUIs can't trigger each other, so you are the 1-click relay. Both apps
have access to this repo (Claude Desktop via the Filesystem MCP; Codex Desktop has
the folder open). They talk through the `.agentloop/` files. Each round = 3 hand-offs
+ one gate run.

## Per-round ritual

**1. DESIGN — paste into Codex Desktop:**
> Follow `.agentloop/PROTOCOL.md`. Do the DESIGN step using
> `.agentloop/prompts/codex-design.md`. Read `GOAL.md`, the previous `review.md`,
> `implementation.md`, `gates.log`, and `git log -p -1`. Write the next plan to
> `.agentloop/design.md`. Do NOT edit code.

**2. IMPLEMENT — paste into Claude Desktop:**
> Follow `.agentloop/PROTOCOL.md`. Do the IMPLEMENT step using
> `.agentloop/prompts/claude-implement.md`. Read `.agentloop/design.md`, make the
> changes, and write your report to `.agentloop/implementation.md`. If you must add
> an npm dependency, say so clearly and stop with `STATUS: BLOCKED` (installs happen
> in the terminal).

**3. GATES — run in a terminal (this is the one non-GUI step):**
```bash
npm run gates        # build + lint + verify:evidence + test
```
- If a round added a dependency, run `npm install` first (Desktop apps have no shell).
- Save the result so Codex can see it:
  `npm run gates > .agentloop/gates.log 2>&1; echo "GATES: $([ $? = 0 ] && echo PASS || echo FAIL)" >> .agentloop/gates.log`
- Commit the round: `git add -A && git commit -m "agentloop round N"`

**4. REVIEW — paste into Codex Desktop:**
> Follow `.agentloop/PROTOCOL.md`. Do the REVIEW step using
> `.agentloop/prompts/codex-review.md`. Read `.agentloop/implementation.md`,
> `.agentloop/gates.log`, and `git diff HEAD~1`. Write P0/P1/P2 findings + a verdict
> to `.agentloop/review.md` and the next round's plan to `.agentloop/design.md`.

Then go back to step 1. Stop when Codex writes `STATUS: SHIPPABLE` in `design.md`,
or when `GOAL.md`'s Definition of Done is fully checked.

## Notes
- You do NOT paste the contents of these files — both apps read them from the repo.
  The pastes above are just pointers + the current status.
- Dependency installs are the only thing that always needs the terminal in the
  Desktop flow.
- The whole audit trail lives in `.agentloop/*.md` + one git commit per round.
