# Environment and secret configuration

Chronos uses the repository-root `.env` file for local-only development
configuration. Real secrets are never committed. `.env.example` is the
canonical committed contract for required and optional variables.

## Rules

- Commit `.env.example`; never commit `.env`, `.env.*`, private keys, service
  tokens, or provider credentials.
- Keep variables orthogonal. Do not encode grouped environment names such as
  `dev`, `staging`, or `prod` as substitutes for individual settings.
- Prefer the platform secret store for remote execution. Modal Functions and
  Sandboxes should receive secrets via Modal Secrets, not by copying the local
  `.env` file into untrusted branch sandboxes.
- Local scripts may load root `.env` before reading `H2F2H_*` settings.
- Evidence manifests must record the non-secret runtime values used by a run,
  such as model ids, branch count, task id, and snapshot mode.
- Evidence manifests must not record secret values. Record presence/absence or
  secret source names instead.

## Canonical variables

| Variable | Required for | Secret | Purpose |
|---|---|---|---|
| `H2F2H_ENV` | local scripts | no | Local profile label, default `local`. |
| `H2F2H_LOG_LEVEL` | local scripts | no | Logging verbosity. |
| `H2F2H_EXTERNAL_DIR` | dependency bootstrap | no | Where source-only dependencies are cloned. |
| `H2F2H_ARTIFACT_DIR` | evidence/release work | no | Root for generated Chronos artifacts. |
| `HUD_API_KEY` | HUD API calls | yes | HUD platform authentication. |
| `MODAL_TOKEN_ID` | Modal CI/service use | yes | Modal token id. |
| `MODAL_TOKEN_SECRET` | Modal CI/service use | yes | Modal token secret. |
| `MODAL_PROFILE` | Modal local use | no | Optional Modal profile selector. |
| `OPENAI_API_KEY` | selected LLM runs | yes | OpenAI provider key. |
| `ANTHROPIC_API_KEY` | selected LLM runs | yes | Anthropic provider key. |
| `GEMINI_API_KEY` | selected LLM runs | yes | Gemini provider key when used. |
| `GOOGLE_API_KEY` | selected LLM runs | yes | Google provider key when used. |
| `H2F2H_HARDEN_V0_PATH` | release work | no | Local harden-v0 checkout path. |
| `H2F2H_TERMINAL_WRENCH_PATH` | controls work | no | Local Terminal Wrench checkout path. |
| `H2F2H_TERMINAL_WRENCH_TASK_ID` | controls work | no | Source task id. |
| `H2F2H_TERMINAL_WRENCH_MODEL` | controls work | no | Source task/model folder. |
| `H2F2H_BRANCH_COUNT` | witness search | no | Default stochastic branch count. |
| `H2F2H_HACKER_MODEL` | harden-v0/Chronos | no | Hacker model id. |
| `H2F2H_FIXER_MODEL` | harden-v0/Chronos | no | Fixer model id. |
| `H2F2H_SOLVER_MODEL` | harden-v0/Chronos | no | Solver model id. |
| `H2F2H_SUMMARY_MODEL` | harden-v0/Chronos | no | Summary model id. |
| `H2F2H_MODAL_APP_NAME` | Modal work | no | Modal app name/prefix. |
| `H2F2H_MODAL_CORE_SNAPSHOT_MODE` | forkpoints | no | Core snapshot mode, default `directory`. |
| `H2F2H_MODAL_SNAPSHOT_TTL_DAYS` | forkpoints | no | Snapshot retention target. |

## Local setup

```sh
cp .env.example .env
uv sync --all-extras --all-groups
scripts/bootstrap_external_deps.sh
```

Fill only the credentials needed for the run. For HUD, set `HUD_API_KEY` in
root `.env`, the process environment, or a developer-local HUD configuration
workflow without placing secret values in shell history. Use
`uv run python -m modal setup` for interactive Modal authentication, or
`MODAL_TOKEN_ID` and `MODAL_TOKEN_SECRET` for service-user/CI contexts.
