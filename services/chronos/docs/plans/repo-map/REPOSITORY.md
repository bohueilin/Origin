# Repository orientation

Status: **accepted**

Gate 1 was accepted on 2026-06-20T23:55Z by Akhil (Claude Code) against commit
`e6ea5e3b49286de93a817b1182c5bd3ca74b7a6e`. `STATUS.json` is the canonical gate
state, repository identity, and verified commit; this orientation was refreshed
on 2026-06-21 to match it after the prior `blocked` text drifted behind the
accepted gate.

## Identity

- Root: `/Users/ashtonchew/projects/hack2fix2hack`
- Remote: `https://github.com/ashtonchew/hack2fix2hack.git`
- Branch inspected: `main`
- Current branch for this update: `chore/plan-001-dev-bootstrap`

## Checked-in structure

The repository is a planning bundle with a dependency bootstrap. It does not
yet contain product source, a source package, a test package, a CI workflow, or
real HUD/Modal adapter code.

Tracked top-level files:

- `.gitignore`
- `.env.example`
- `.python-version`
- `AGENTS.md`
- `CLAUDE.md`
- `PLANS.md`
- `README.md`
- `docs/plans/**`
- `pyproject.toml`
- `requirements/harden-v0.txt`
- `scripts/bootstrap_external_deps.sh`
- `uv.lock`
- `docs/spec/hack2fix2hack-handoff (4).html`

## Toolchain

The checked-in dependency workflow is managed by uv.

Observed local interpreter:

- `python --version` -> `Python 3.12.13`

Primary setup commands:

```sh
uv sync --all-extras --all-groups
scripts/bootstrap_external_deps.sh
```

See `DEPENDENCIES.md` for exact packages, external source revisions, and
authentication/system prerequisites.

Root `.env` is the local secret/config file and is ignored by git. The committed
contract is `.env.example`; the canonical variable documentation is
`docs/plans/specs/07-environment.md`.

## Agent instructions

The applicable repository instruction file is `AGENTS.md`. It requires:

- `docs/plans/ASSUMPTIONS.md` before implementation,
- one selected numbered ExecPlan under `docs/plans/`,
- evidence-backed completion,
- no source implementation until Gate 1 is accepted,
- no fabricated HUD, Modal, grader, trace, task, or harden-v0 interface claims.

## Baseline command

The smallest passing checked-in health command is:

```sh
uv run python docs/plans/scripts/validate_graph.py
```

This is recorded as `baseline` in `COMMANDS.json`.

Additional useful local checks while the repo remains planning-only:

```sh
python docs/plans/scripts/validate_sections.py
python docs/plans/scripts/validate_ownership.py
python docs/plans/scripts/validate_traceability.py
python docs/plans/scripts/validate_evidence.py
python docs/plans/scripts/validate_file_sizes.py --plan 001
```

`python docs/plans/scripts/run_all.py` is not the baseline because the global
file-size check scans `docs/spec/hack2fix2hack-handoff (4).html`, a checked-in
1359-line source artifact. Plan-scoped file-size validation avoids treating that
source handoff as implementation code.

## Development state

The future source, test, fixture, script, and artifact boundaries are accepted
as new repository-native paths in `OWNERSHIP-BINDINGS.json` because no existing
package layout is available to remap into.

Gate 1 is accepted: each required surface in `STATUS.json` and `INTERFACES.md`
is either verified-present with evidence or located-and-owned by its later plan,
per the `000-index.md` acceptance wording. Implementation waves are unblocked,
and the core stack (Plans 002–005) has merged and consumes the accepted repo
map. Any surface still marked `Not present` (for example HUD environment version
publish/compare, located-owned by Plan 006) is a recorded later-wave ownership
boundary, not a Gate-1 blocker.
