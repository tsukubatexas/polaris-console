#!/usr/bin/env bash
set -euo pipefail

fail=0

if [[ ! -d .github/workflows ]]; then
  exit 0
fi

while IFS=: read -r file line content; do
  ref="$(printf '%s\n' "$content" | sed -E 's/.*uses:[[:space:]]*([^[:space:]#]+).*/\1/')"
  if [[ "$ref" == ./* || "$ref" == docker://* ]]; then
    continue
  fi
  if [[ ! "$ref" =~ @[a-f0-9]{40}$ ]]; then
    printf 'Unpinned GitHub Action in %s:%s -> %s\n' "$file" "$line" "$ref" >&2
    fail=1
  fi
done < <(rg -n 'uses:[[:space:]]*[^[:space:]#]+@' .github/workflows || true)

if [[ "$fail" -ne 0 ]]; then
  printf 'Pin actions to immutable 40-character commit SHAs.\n' >&2
  exit 1
fi

printf 'All GitHub Actions are pinned to commit SHAs.\n'
