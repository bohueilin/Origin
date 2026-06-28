#!/usr/bin/env bash
# Sterile clean_verify referee entrypoint (Plan 008). Runs the task's own v1
# verification from a trusted tests root with conftest discovery confined to it,
# so agent-planted conftest.py / cache cannot influence the verdict; the task's
# own required pytest plugins still load. The isolated trusted-asset sandbox is
# wired in WP1/WP3.
set -euo pipefail
TRUSTED_TESTS="${CLEAN_VERIFY_TESTS:-task_assets}"
exec python -m pytest -p no:cacheprovider --confcutdir "$TRUSTED_TESTS" -q "$TRUSTED_TESTS" "$@"
