#!/usr/bin/env bash
set -euo pipefail

days="${STALE_AGENTIC_PR_DAYS:-30}"
label="${AGENTIC_PR_LABEL:-agentic}"

if ! command -v gh >/dev/null 2>&1; then
  printf 'gh is not installed; skipping PR hygiene.\n'
  exit 0
fi
if ! gh auth status >/dev/null 2>&1; then
  printf 'gh is not authenticated; skipping PR hygiene.\n'
  exit 0
fi
if ! git remote get-url origin >/dev/null 2>&1; then
  printf 'No origin remote configured; skipping PR hygiene.\n'
  exit 0
fi

tmp="$(mktemp)"
gh pr list --state open --label "$label" --json number,updatedAt,title >"$tmp"

python - "$tmp" "$days" <<'PY' | while read -r number; do
import datetime as dt
import json
import sys

path, days = sys.argv[1], int(sys.argv[2])
cutoff = dt.datetime.now(dt.UTC) - dt.timedelta(days=days)
for pr in json.loads(open(path, encoding="utf-8").read()):
    updated = dt.datetime.fromisoformat(pr["updatedAt"].replace("Z", "+00:00"))
    if updated < cutoff:
        print(pr["number"])
PY
  gh pr close "$number" --delete-branch --comment "Closed by automated Polaris Console hygiene after ${days} days without updates."
done

rm -f "$tmp"
