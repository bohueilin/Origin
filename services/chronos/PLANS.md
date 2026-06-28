# Chronos execution-plan template

An ExecPlan is a living, self-contained implementation document for one collision-free vertical slice. A fresh repository-connected agent must be able to open one numbered plan, follow its dependency and repo-grounding preconditions, implement the behavior, and prove it with observable evidence.

## Required frontmatter

Every `docs/plans/00X-<semantic-slug>.md` uses:

    ---
    name: <semantic-slug>
    description: >
      <third-person routing description with exactly one "Use when..." trigger,
      naming work, owned paths, and preconditions; at most 1024 characters>
    owns: ["<exact repository-relative path or glob>", "..."]
    depends_on: ["<semantic plan id>", "..."]
    wave: <positive integer>
    ---

`name` matches the filename after the numeric prefix. `owns` is exclusive write authority. `depends_on` names plans that must merge first. A dependency must have a lower wave number.

## Required body

### Goal

State one quantitative objective and a binary done condition. Describe user-visible or operator-visible behavior, not file creation alone.

### Context / Why

Orient a stateless reader. Define domain terms locally, explain why the slice matters, summarize its inputs and outputs, and identify the relevant source-of-truth constraints. Reference a sibling `.REFERENCE.md` for optional heavy detail, but keep all mandatory execution logic here.

### Constraints

State scope, ownership, security and correctness invariants, explicit STOP conditions, and how locality, feature modularity, the 500-line target, and behavior-level testing apply.

### Work packets

Use small vertical packets. Each packet says what behavior becomes possible, the repository areas to inspect or change, and its own Pass and Fail observations. Packets are independently verifiable and leave the tree runnable.

### Done-when (self-validation gate)

List exact commands. Unknown repository commands are not guessed: Wave 1 binds them in `docs/plans/repo-map/COMMANDS.json`, and later plans invoke them through `docs/plans/scripts/run_mapped.py`. State expected output and artifacts. Require an updated evidence manifest, no file over 500 lines without an approved seam, and behavior-focused tests.

### Recovery

Explain safe resume, retry, cleanup, and rollback. Steps must be idempotent or include a recovery path.

### Executor prompt

Provide one copy/paste `/goal` block scoped to this file. Keep it below 4,000 characters; point to the plan rather than duplicating it.

### Living-doc log

Keep these append-only subsections:

- Progress
- Surprises & Discoveries
- Decision Log
- Outcomes & Retrospective

Every stopping point gets a timestamped Progress entry. Decisions record rationale. Completion records what actually shipped and any remaining gap.

## Progressive disclosure

Move a section to `00X-<slug>.REFERENCE.md` when it exceeds roughly 100 lines, contains detailed schemas or matrices, or is needed only by one branch of execution. Use a precise pointer such as “Read the Replay record section before WP3.” Never hide a STOP condition, invariant, acceptance criterion, or required command in a reference file.

## Evidence manifest

Each plan updates `docs/plans/evidence/<NNN>/MANIFEST.json`. Planning templates use `status: not-started`; executors set `in-progress`, `blocked`, or `complete`. A complete manifest includes:

- exact commands with exit codes and concise output,
- behavior checks with pass/fail and observations,
- artifact paths and hashes where useful,
- screenshots or trace links when the behavior is visual or remote,
- commit identifier when available,
- unresolved risks and explicit skips.

`validate_evidence.py --plan <NNN> --require-complete` is the final local gate.

## Plan authoring checklist

A valid plan is independently routable, owns a collision-free feature slice, has an acyclic dependency, maps to requirements, defines real behavior, uses no invented repository facts, and gives a downstream agent a safe restart path.
