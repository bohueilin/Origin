# Dependency map

Status: **partially verified**

Verified on 2026-06-20 with `uv 0.11.9` and Python 3.12.

## Python environment

The repository is now a uv-managed Python project:

```sh
uv sync --all-extras --all-groups
```

Pinned project inputs:

- Python: `>=3.12,<3.13`
- HUD: `hud-python[modal]==0.6.4`
- Modal SDK: `modal==1.5.0`
- harden-v0 support deps: `harbor`, `litellm`, `pydantic`, `tenacity`,
  `PyYAML`, `python-dotenv`, `tqdm`
- dev deps: `pytest`, `ruff`

Observed install results:

- `hud-python==0.6.4`
- `modal==1.5.0`
- `harbor==0.15.0`
- `litellm==1.89.2`

The exact transitive set is in `uv.lock`.

## External source checkouts

harden-v0 is not a normal Python package at the verified revision: the upstream
has `requirements.txt` but no `pyproject.toml`. Terminal Wrench is a sparse
dataset source checkout. HUD Trace Explorer provides the canonical Reward
Hacking QA scenario required by Plan 003. These are fetched as pinned external
source checkouts:

```sh
scripts/bootstrap_external_deps.sh
scripts/verify_external_deps.sh
```

The script writes ignored checkouts under `.external/`.

Plan 004 uses the Terminal Wrench checkout as pinned source evidence, not as a
committed dependency. `python docs/plans/scripts/run_mapped.py plan-004-tests`
and `python docs/plans/scripts/run_mapped.py integration-controls` preflight the
required task files and print the bootstrap or `H2F2H_TERMINAL_WRENCH_PATH`
remedy before running pytest or Docker baselines.

| Dependency | Source | Revision | Local path | Verification |
|---|---|---:|---|---|
| harden-v0 | `https://github.com/few-sh/harden-v0.git` | `b9dd28c732e7e5435da4a2ac90ae92ac6ea65007` | `.external/harden-v0` | `env PYTHONPATH=.external/harden-v0 uv run python -m harden --help` exits 0 |
| Terminal Wrench | `https://github.com/few-sh/terminal-wrench.git` | `d8a29613235a0ef56a8b70b3142626a533da28c2` | `.external/terminal-wrench` sparse checkout | `tasks/mongodb-sales-aggregation-engine` exists |
| HUD Trace Explorer | `https://github.com/hud-evals/hud-trace-explorer.git` | `96a72fb4ca579921a0b83ffe4ca3d68bc85dd9eb` | `.external/hud-trace-explorer` | `qa_reward_hacking.py` exists |

## Authentication and system prerequisites

These are not installed by the repository:

- Root `.env`: copy `.env.example` to `.env` for local development. The real
  `.env` file is ignored and must not be committed.
- HUD API key: set with root `.env`, `HUD_API_KEY`, or a developer-local HUD
  configuration workflow that does not put secret values in shell history.
- Modal credentials: run `uv run python -m modal setup`.
- LLM provider key for harden-v0/LiteLLM, such as Anthropic or Gemini.
- Docker for harden-v0/Harbor task execution.
- Linux Docker Engine `>=20.10` if using harden-v0 `--pool-enabled`.

See `docs/plans/specs/07-environment.md` for the canonical variable list.

## Project-level agent skills

The repository installs the HUD docs skill as project-local agent guidance:

```sh
npx skills add https://docs.hud.ai --yes
```

This creates `.agents/skills/hud-environment-builder/SKILL.md` and records the
well-known source plus hash in `skills-lock.json`. `.agents/skills` is the
canonical repo skill location; `.claude/skills/hud-environment-builder` is a
symlink to the same folder for Claude Code compatibility. Restore project
skills from the lockfile with:

```sh
npx skills experimental_install
```

## Still blocked

Dependency setup does not create the missing product integration surfaces. Gate
1 still needs a real source trace, HUD adapter, Modal adapter, grader/verifier,
artifact store, and sandbox security controls.
