# Loop Engineering: Codex Brain + Claude Code Execution

This repo is worked as an asymmetric local agent loop:

- **Codex is the brain**: architecture, security review, product judgment, demo narrative, visual/design direction, implementation critique, and the next prompt.
- **Claude Code is the execution agent**: implement scoped changes, run gates, preserve repo hygiene, and write a markdown handoff back to Codex.
- **Source of truth**: all loop instructions, handoffs, and iteration logs are read from `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test/agent-passport`.

The loop is:

1. Codex designs the next move and gives Claude Code an implementation prompt for `Iteration N`.
2. Claude Code writes code, runs gates, and writes `CLAUDE_HANDOFF.md` with `Iteration: N`.
3. The user shares Claude's handoff/prompt back to Codex.
4. Codex reviews the implementation at world-class security, product, and design quality.
5. Codex gives feedback, enhancements, and the next design/prompt as `Iteration N+1`.
6. Claude Code reads Codex feedback, thinks, builds, writes another handoff, and the loop repeats.

The goal is not "two agents doing random work." The goal is a high-trust engineering cadence where Claude Code moves fast and Codex keeps the bar high.

## Non-Negotiables

- Local only unless the user explicitly says otherwise.
- Do not push, publish, deploy, or expose secrets.
- Do not stage or alter unrelated local changes.
- Claude Code implements; Codex reviews and designs next steps.
- Every Claude Code pass must end with `CLAUDE_HANDOFF.md`.
- Every `CLAUDE_HANDOFF.md` must include a copy-paste prompt back to Codex.
- Every handoff must include `Iteration: N` near the top, and the title should include `Iteration N`.
- Every completed collaboration step should be recorded in `ITERATION_LOG.md`.
- Preserve Passport's five invariants:
  - attenuation is monotonic;
  - complete mediation;
  - credentials are sandbox-bound;
  - ledger is append-only and hash-chained;
  - kill is total and contained.
- If a prompt says evaluation + plan only, do not code.
- Every handoff must include the exact next prompt for the other agent.

## Working Files

All paths below are relative to `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test/agent-passport`.

- `LOOP_ENGINEERING.md`: this playbook.
- `CLAUDE_LOOP_START_PROMPT.md`: the initial implementation prompt to give Claude Code.
- `CLAUDE_HANDOFF.md`: Claude Code writes or updates this after every execution turn.
- `CODEX_HANDOFF.md`: Codex may write this when handing design/review back to Claude Code.
- `CODEX_REVIEW_RUBRIC.md`: Codex's review bar for security, product, and presentation quality.
- `ITERATION_LOG.md`: running history of iteration number, owner, state, gates, and next baton.

The handoff files are working notes, not product docs. They should be concise, current, and specific.

## Loop States

Use one of these states at the top of every handoff:

- `EVALUATE_ONLY`: inspect, test, reason, and plan. No code changes.
- `IMPLEMENT`: make the smallest safe changes for the approved plan.
- `REVIEW`: inspect a change already made by the other agent.
- `VERIFY`: run gates, manually test, and check acceptance criteria.
- `DONE`: all acceptance criteria are met and the repo is quiet except intended changes.
- `BLOCKED`: progress requires user input or external credentials.

## Required Handoff Format

Each handoff markdown file should use this structure:

````md
# Handoff: Iteration <N> - <Claude Code to Codex or Codex to Claude Code>

Iteration: <N>
State: <EVALUATE_ONLY | IMPLEMENT | REVIEW | VERIFY | DONE | BLOCKED>
Date: <YYYY-MM-DD>
Repo: agent-passport
Baton: <Codex | Claude Code | User>

## Task
<One paragraph describing the active objective.>

## Context Read
- <Files/docs inspected>
- <Important repo facts>

## Gates Run
- `<command>`: <pass/fail/not run + reason>

## Findings Or Changes
- <Prioritized findings, or files changed and why>

## Files Changed
- `<path>`: <what changed and why>

## Risks And Unknowns
- <Security, correctness, product, or demo risks still open>

## Next Recommended Action
<Exactly what the next agent should do.>

## Prompt To Share Back
```text
<Copy-paste prompt for the next agent.>
```
````

## Iteration Tracking

Each collaboration pass increments the iteration number by one when the baton moves to the other agent.

- `Iteration 1`: first Claude/Codex collaboration artifact in this repo.
- `Iteration 2`: the next agent response after Iteration 1.
- Continue as `Iteration 3`, `Iteration 4`, and so on.

Rules:

- Do not reuse an iteration number for a new handoff.
- If an agent corrects its own handoff before the baton moves, keep the same iteration and add a short correction note.
- If an agent starts implementing from a handoff, it should treat that handoff's prompt as the previous iteration and write the next handoff as `Iteration N+1`.
- `ITERATION_LOG.md` should be append-only in practice: add a new row instead of rewriting prior rows, unless correcting a typo.

Suggested log row:

```md
| Iteration | Owner | State | Date | Gates | Baton | Summary |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Claude Code | EVALUATE_ONLY | 2026-06-23 | demo pass; tests 7/7 | Codex | Audited invariants and returned fix plan. |
```

## Cadence And Baton Rules

There is no hidden background collaboration between Codex and Claude Code. The loop is continuous through files and prompts:

1. Both agents always read instructions from `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test/agent-passport`.
2. The active agent works until it writes its handoff file and updates `ITERATION_LOG.md`.
3. The baton field says who acts next.
4. The user gives the handoff prompt to the next agent, unless a separate watcher/automation has been explicitly created.
5. The next agent starts from the latest handoff in the source-of-truth directory.

Recommended cadence while actively racing toward the demo:

- **Claude Code implementation turn**: usually 5-20 minutes; split anything larger into smaller iterations.
- **Codex review/design turn**: usually 3-10 minutes; deeper security review can take longer but must leave a checkpoint.
- **Handoff wait**: ideally 0 minutes; as soon as `CLAUDE_HANDOFF.md` or `CODEX_HANDOFF*.md` is written, move the prompt to the next agent.

### Claude Code Check Logic

Claude Code is the builder, so its check behavior should not interrupt active implementation.

- If Claude Code is **working/building/verifying**, no periodic check is required. It should stay focused and write the final handoff when done.
- If Claude Code is **not actively working**, it should check the source-of-truth directory every 3 minutes for new Codex instructions, changed handoffs, or updated iteration-log rows.
- If Claude Code is blocked or idle, it should write a checkpoint or `State: BLOCKED` handoff instead of silently waiting.

### Codex Check Logic

Codex is the brain/reviewer and should watch for Claude updates.

- Codex checks the source-of-truth directory every 10 minutes while waiting for Claude Code.
- If the 10-minute check finds no meaningful update, Codex enters a 3-minute check loop.
- Once Codex sees a meaningful update, it resets back to the normal 10-minute timer because Claude may begin another working stretch after the update.
- Meaningful update means changed files, new handoff content, a new `ITERATION_LOG.md` row, checkpoint text, gate output, or new user/agent instructions.
- If repeated 3-minute checks show no update and the sprint appears stalled, Codex should inspect the latest baton and either narrow the task, request a checkpoint, or mark `State: BLOCKED`.

This split is intentional: Claude should not be distracted while building; Codex should keep checking while waiting for Claude.

Old generic check-loop pseudo-logic, now Codex-specific:

```text
codex_normal_interval = 10 minutes
codex_escalated_interval = 3 minutes

every codex_normal_interval while Baton == Codex or Codex is waiting for Claude:
  if meaningful_update_detected:
    act_on_update()
    reset timer to codex_normal_interval
  else:
    enter escalated loop

while escalated:
  every codex_escalated_interval:
    if meaningful_update_detected:
      act_on_update()
      reset timer to codex_normal_interval
      exit escalated loop
    else:
      keep checking every codex_escalated_interval or mark BLOCKED if the active sprint is stalled
```

Claude idle check pseudo-logic:

```text
if Claude Code is working/building/verifying:
  do not poll; finish the slice and write CLAUDE_HANDOFF.md
else:
  every 3 minutes:
    check the source-of-truth directory for new Codex instructions or baton changes
    if new work exists:
      start from the latest handoff
```

For fully continuous work, use a single active goal per iteration. Do not start a broad new objective until the current iteration has one of these outcomes:

- fixed and verified;
- reviewed and sent back for changes;
- explicitly deferred;
- blocked with the exact missing input.

Checkpoint format for in-progress work:

```md
## Checkpoint - <HH:MM>
- Status: <working | verifying | blocked | handing off>
- What changed or was learned: <one or two bullets>
- Next: <the next concrete action>
```

## Autonomy Rules

### Claude Code

Claude Code is the builder. It should implement the prompt's scoped task, run gates, and hand work back to Codex.

Claude Code should:

- always read loop instructions from `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test/agent-passport`;
- read `LOOP_ENGINEERING.md`, `BUILD_NOTES.md`, `README.md`, and the latest Codex prompt;
- inspect the relevant files before editing;
- implement the smallest coherent slice that satisfies the prompt;
- preserve the five invariants;
- add or update regression tests for every fixed security issue;
- run the requested gates;
- write or update `CLAUDE_HANDOFF.md`;
- include "Prompt To Share Back To Codex" in the handoff.

If Claude Code believes the prompt is unsafe or underspecified, it should not guess. It should write `CLAUDE_HANDOFF.md` with `State: BLOCKED`, explain the blocker, and include a concise prompt back to Codex.

### Codex

Codex is the brain. It reviews Claude Code's implementation and decides the next design move.

Codex should:

- always read loop instructions from `/Users/bohueilin/hackathons/0620-test/physical-ai-demo-test/agent-passport`;
- read `CLAUDE_HANDOFF.md` before reviewing Claude Code work;
- inspect actual diffs and critical files, not just the summary;
- verify or challenge Claude's claims with local gates when needed;
- prioritize P0/P1 security and invariant issues before polish;
- provide concrete review feedback with file:line references;
- propose enhancements that are worth building, not just nice-to-have;
- keep the YC/AGI House demo story sharp;
- push the dashboard/front-end/illustration quality toward founder-grade clarity;
- preserve unrelated changes;
- write the next Claude Code implementation prompt.

## Codex Review Standard

Codex reviews should feel like a frontier lab internal security/product/design review:

- **Security**: attack the trust model, signatures, attenuation, mediation, leases, revocation, sandbox containment, and ledger integrity.
- **Correctness**: verify behavior with tests and direct probes, especially for cases that can pass unit tests but break an invariant.
- **Implementation quality**: prefer small, legible, local changes; no abstractions that do not pay rent.
- **Product quality**: every change should strengthen the 3-minute demo or enterprise wedge.
- **Frontend and illustrations**: dashboard changes must make the system easier to understand instantly for YC judges, startup founders, and security engineers.
- **Narrative**: explain why this is more than a toy: signed attenuated delegation, sandbox-bound credentials, instant kill, tamper-evident audit.

## Claude Code Execution Standard

Claude Code should optimize for clean execution:

- Implement one coherent slice per turn.
- Include tests that fail before the fix and pass after it.
- Keep public APIs stable unless the Codex prompt explicitly changes them.
- Do not replace the zero-dependency local prototype with a framework.
- Do not add real cloud dependencies unless the task is explicitly the sponsor-SDK adapter seam.
- Do not hide unresolved risks; write them into `CLAUDE_HANDOFF.md`.

## Competition-Oriented Loop

For the YC / AGI House demo, optimize the loop around proof, not breadth:

1. Fix P0/P1 security holes before adding polish.
2. Add regression tests that demonstrate attacks failing.
3. Keep the dashboard narrative sharp: authorized handoff, prompt injection, denial, kill, parent continues, ledger seals.
4. Swap sponsor mocks only behind existing interfaces.
5. Avoid cloud setup becoming the demo. Use real SDK integration only where it visibly strengthens the story.

## Prompt Patterns

### Codex To Claude Code: Implementation

```text
You are Claude Code acting as the execution agent. Codex is the design/security/product brain and will review your work after this turn.

Read `agent-passport/LOOP_ENGINEERING.md`, `agent-passport/BUILD_NOTES.md`, `agent-passport/README.md`, and the latest Codex feedback. Implement only the scoped task below. Keep the project local-only. Do not push, publish, or deploy.

Task:
<specific implementation task>

Quality bar:
- preserve the five Passport invariants;
- add focused regression tests for security changes;
- run the gates listed below;
- keep changes small and legible;
- update `CLAUDE_HANDOFF.md` with a precise handoff back to Codex.

Gates:
- `python3 tests/test_core.py`
- `python3 demo.py`
- dashboard run if touched or relevant

At the end, write `CLAUDE_HANDOFF.md` and include a section titled "Prompt To Share Back To Codex" with a copy-paste prompt asking Codex to review your implementation, inspect diffs, run/verify gates as needed, and provide next design feedback.

Use the next iteration number in `CLAUDE_HANDOFF.md` and update `ITERATION_LOG.md`.
```

### Codex To Claude Code: Plan Only

Use this only when the next Claude turn should not code:

```text
Please read, inspect the repo, run gates, and return only evaluation + plan. Do not code yet.

Also write `CLAUDE_HANDOFF.md` with your evaluation, plan, risks, and a "Prompt To Share Back To Codex" section.

Use the next iteration number in `CLAUDE_HANDOFF.md` and update `ITERATION_LOG.md`.
```

## Done Criteria For The Current Passport Track

- `python3 demo.py` passes.
- `python3 tests/test_core.py` passes.
- `python3 dashboard/server.py` runs locally and the browser scenario shows kill + terminated child + intact seal.
- P0 findings are fixed and covered by tests.
- P1 findings are either fixed or explicitly deferred with rationale.
- `vault.py` and `sandbox.py` keep their public interfaces while gaining clear real-SDK adapter seams.
- No raw secrets appear in logs, ledger entries, prompts, or files.
- `CLAUDE_HANDOFF.md` accurately describes what Claude Code changed and gives Codex a review prompt.
