#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

read_env_value() {
  local key="$1"
  local line value

  [[ -f "${root}/.env" ]] || return 1
  while IFS= read -r line; do
    line="${line#"${line%%[![:space:]]*}"}"
    line="${line#export }"
    [[ "${line}" == "${key}="* ]] || continue
    value="${line#*=}"
    value="${value%$'\r'}"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    value="${value#\"}"
    value="${value%\"}"
    value="${value#\'}"
    value="${value%\'}"
    printf '%s\n' "${value}"
    return 0
  done < "${root}/.env"
  return 1
}

external_dir="${H2F2H_EXTERNAL_DIR:-}"
if [[ -z "${external_dir}" ]]; then
  external_dir="$(read_env_value "H2F2H_EXTERNAL_DIR" || true)"
fi
external_dir="${external_dir:-"${root}/.external"}"

harden_repo="https://github.com/few-sh/harden-v0.git"
harden_rev="b9dd28c732e7e5435da4a2ac90ae92ac6ea65007"

terminal_wrench_repo="https://github.com/few-sh/terminal-wrench.git"
terminal_wrench_rev="d8a29613235a0ef56a8b70b3142626a533da28c2"

hud_trace_explorer_repo="https://github.com/hud-evals/hud-trace-explorer.git"
hud_trace_explorer_rev="96a72fb4ca579921a0b83ffe4ca3d68bc85dd9eb"

checkout_repo() {
  local name="$1"
  local repo="$2"
  local rev="$3"
  local target="${external_dir}/${name}"

  mkdir -p "${external_dir}"
  if ! git -C "${target}" rev-parse --git-dir >/dev/null 2>&1; then
    git clone "${repo}" "${target}"
  fi

  git -C "${target}" fetch --tags origin
  git -C "${target}" checkout --detach "${rev}"
}

checkout_sparse_repo() {
  local name="$1"
  local repo="$2"
  local rev="$3"
  local sparse_path="$4"
  local target="${external_dir}/${name}"

  mkdir -p "${external_dir}"
  if ! git -C "${target}" rev-parse --git-dir >/dev/null 2>&1; then
    git clone --filter=blob:none --sparse "${repo}" "${target}"
  fi

  git -C "${target}" sparse-checkout set "${sparse_path}"
  git -C "${target}" fetch --tags origin
  git -C "${target}" checkout --detach "${rev}"
}

checkout_repo "harden-v0" "${harden_repo}" "${harden_rev}"
checkout_repo "hud-trace-explorer" "${hud_trace_explorer_repo}" "${hud_trace_explorer_rev}"
checkout_sparse_repo "terminal-wrench" "${terminal_wrench_repo}" "${terminal_wrench_rev}" "tasks/mongodb-sales-aggregation-engine"

"${root}/scripts/verify_external_deps.sh"

printf 'External dependencies are pinned under %s\n' "${external_dir}"
