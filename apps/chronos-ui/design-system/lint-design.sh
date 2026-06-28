#!/usr/bin/env bash
# Design-system compliance lint. Fails (exit 1) if UI bypasses tokens.
# Usage: bash design-system/lint-design.sh <dir>   (default: design-system/examples)
#
# Catches the escape hatches the design system forbids:
#   - Tailwind arbitrary-value brackets:  bg-[#fff]  text-[14px]  p-[13px]  rounded-[7px]
#   - raw hex colors in style="" / inline CSS
# It deliberately ignores the token source files (tokens.css, *-preset.js, *.json,
# *-extraction.md) and the inline <script>tailwind.config</script> theme block,
# which are the ONLY places literal values may live.

set -uo pipefail
DIR="${1:-design-system/examples}"
fail=0

# 1) Tailwind arbitrary-value brackets on design utilities.
arb=$(grep -rEno '(bg|text|border|fill|stroke|ring|from|via|to|p|px|py|pt|pb|pl|pr|m|mx|my|gap|w|h|min-w|max-w|rounded|shadow|leading|tracking)-\[[^]]+\]' "$DIR" \
  --include='*.html' --include='*.jsx' --include='*.tsx' --include='*.vue' --include='*.svelte' 2>/dev/null)
if [ -n "$arb" ]; then
  echo "✗ Arbitrary Tailwind values (bypass tokens — use named utilities):"
  echo "$arb"
  fail=1
fi

# 2) Raw hex colors inside inline style attributes / style blocks (token files excluded).
hex=$(grep -rEno 'style="[^"]*#[0-9a-fA-F]{3,8}' "$DIR" \
  --include='*.html' --include='*.jsx' --include='*.tsx' --include='*.vue' --include='*.svelte' 2>/dev/null)
if [ -n "$hex" ]; then
  echo "✗ Raw hex in inline styles (use tokens / utilities):"
  echo "$hex"
  fail=1
fi

if [ "$fail" -eq 0 ]; then
  echo "✓ design-system compliance: 0 violations in $DIR"
fi
exit "$fail"
