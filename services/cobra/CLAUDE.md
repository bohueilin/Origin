# CLAUDE.md

Build-time guidance for working in this repo. This file is **advisory** — it nudges, it
doesn't enforce.

> **Project:** Cobra — an autoresearch loop that automatically hardens RL
> verifiers against reward hacking. Point it at a grader, it finds the cheats, seals them, and
> reports how much more trustworthy the grader became, measured against held-out ground truth.
> Full spec: `SPEC.md`.
>
> **The product is the loop, not the swarm.** The deliverable is a hardened grader and a
> before→after robustness number. The red-team swarm + conductor are the *engine* that finds
> holes to seal — impressive, but supporting. Never invert this: the headline is "we made a
> broken grader trustworthy, automatically," not "look how smart our swarm is."
>
> **This is a hackathon — build the thin vertical slice first.** Ship a complete loop on ONE
> task early (breach → patch → metric moves), then *widen* (more agents, more tasks, dashboard),
> never deepen one part in isolation. At every checkpoint you should have a complete, demoable
> product getting more impressive — never a pile of disconnected impressive parts.
>
> **Stack:** Python 3.12 + `uv`. `anthropic` SDK drives the red team, green team, and conductor.
> Graders + oracle are plain Python. Code runs in a local subprocess sandbox (timeout, no
> network) — deterministic and fast. `FastAPI` + websocket backend streams events to a
> single-file HTML siege dashboard. `pytest` / `ruff`.
> **Build/check:** `make check` (ruff + pytest).
>
> **Optional / showcase layers (only when the core works):** HUD SDK to wrap the grader as a
> scenario reward function (free rollouts, traces, publish-to-judges). Modal + Fireworks for the
> "train a model to cheat the weak grader, then watch it improve on the hardened one" RFT stretch.

---

## The one protected invariant: eval honesty

Everything else is negotiable. This is not. The robustness number is the whole product, and it
is only meaningful if it is measured honestly:

1. **Held-out split is sacred.** Patch against a *train* split of discovered breaches; measure
   robustness on a *held-out* split the patches never saw. Measuring on the breaches you patched
   against is circular and a HUD judge will catch it instantly.
2. **The oracle is independent of the grader.** The grader = the visible/weak test suite. The
   oracle = the held-out EvalPlus tests. They must never share test cases.
3. **Honest-pass is always tracked alongside robustness.** A patch that blocks cheats by also
   rejecting gold solutions is a regression, not a win. Every robustness number is reported with
   the honest-pass rate next to it.

If a change touches grading, oracle, the split, or the metric, treat it as load-bearing and
re-read this section.

---

## Coding guidelines

1. **Think before coding.** State assumptions, surface tradeoffs. Unclear → ask. Multiple
   interpretations → present them, don't pick silently.
2. **Simplicity first.** Minimum code that solves the problem. No speculative abstractions, no
   unrequested config knobs. If 200 lines could be 50, rewrite. Determinism in the grader/oracle
   path beats cleverness everywhere.
3. **Surgical changes.** Touch only what you must. No drive-by refactors. Every changed line
   traces to the stated goal.
4. **Goal-driven execution.** Turn tasks into verifiable goals ("write the test, then make it
   pass"). State a brief plan for multi-step work.
5. **Explain before coding.** Say what you're building, why, and how it works conceptually. Then
   code.
6. **Concise code docs.** Comments and docstrings are short one-liners; detail goes in chat, not
   source. After a change, update `PLAN.md` so it matches the codebase.

---

## Working agreements

- **Plan before building.** When asked to build, first scope it in `PLAN.md` (current task +
  ordered steps), then code. You don't have to show the plan — just go.
- **One feature, one commit.** Each capability lands on its own commit before the next starts.
  Name with `feat`/`fix`/etc.; keep messages concise. pull and review before committing anything.
- **`PLAN.md` is your personal working doc, and it is NOT tracked** (gitignored — each
  collaborator keeps their own). It holds the current task, a `## Deferred` backlog, a
  `## Decisions` log, and a `## Resume` note. No separate HANDOFF / BACKLOG / DECISIONS files —
  fold them in. (Deviation from the source template, which was built for a long-lived project; a
  weekend doesn't need the ceremony.)
- **Verify before every commit.** Run `make check` (ruff + pytest — the deterministic gate the
  hook also runs), then a self-review pass against `.claude/skills/review/SKILL.md`. Blockers fix
  before commit; minors → `## Deferred` in `PLAN.md`.
- **Push after each commit** if a remote exists; no batching.
- **Autonomy.** Make design calls as they come up. Log anything non-obvious or surprising to
  `## Decisions` in `PLAN.md`. Genuinely two-sided call, or stuck → **ask**.

---

## File map

Only this file loads automatically. Read the others on their trigger.

| File | Read it when… | Write it when… |
|---|---|---|
| `SPEC.md` | starting a feature; need the what / the mapping / the metric | the design changes — keep it the north star |
| `PLAN.md` | first thing, every session | scope changes, a task completes, session end |
| `.claude/skills/review/SKILL.md` | before every commit (self-review) | the review rubric needs adjusting |
| `.claude/settings.json` | wiring the pre-commit gate | the hook command changes |

- **SPEC.md** — the destination: product definition, the code-domain mechanics, the siege
  metaphor + event schema, metrics, build order, sponsor mapping, demo script. Stays full.
- **PLAN.md** — the working state: current task, deferred items, decisions, resume note.

---

## Session flow

```
start  →  read PLAN.md  →  work the current task
work   →  (per feature) build → make check → self-review (review skill) → commit
end    →  update PLAN.md (current task, deferred, decisions, resume note)
```
