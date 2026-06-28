#!/usr/bin/env bash
# Fixture TW harness: runs the v1 grader.
set -euo pipefail
python -m pytest -q "$(dirname "$0")/test_outputs.py"
