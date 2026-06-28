#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_paths=(
  ".external/harden-v0/harden/config.py"
  ".external/harden-v0/harden/loop.py"
  ".external/hud-trace-explorer/qa_reward_hacking.py"
  ".external/terminal-wrench/tasks/mongodb-sales-aggregation-engine"
)

missing=()
for path in "${required_paths[@]}"; do
  if [[ ! -e "${root}/${path}" ]]; then
    missing+=("${path}")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Missing required external dependency paths:\n' >&2
  printf '  %s\n' "${missing[@]}" >&2
  printf '\nSee docs/plans/repo-map/WORKTREES.md or run scripts/bootstrap_external_deps.sh.\n' >&2
  exit 1
fi

printf 'External dependency check passed.\n'
