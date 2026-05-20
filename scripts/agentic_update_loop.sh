#!/usr/bin/env bash
set -euo pipefail

rounds="${AGENT_MAX_ROUNDS:-3}"
release="${POLARIS_RELEASE:-latest}"
mkdir -p .agentic

for round in $(seq 1 "$rounds"); do
  printf 'Agentic update round %s/%s for %s\n' "$round" "$rounds" "$release"
  scripts/fetch_polaris_specs.py --release "$release"

  if scripts/run_checks.sh 2>&1 | tee ".agentic/round-${round}.log"; then
    printf 'Agentic update loop is green.\n'
    exit 0
  fi

  if [[ "$round" == "$rounds" ]]; then
    printf 'Agentic update loop failed after %s rounds.\n' "$rounds" >&2
    exit 1
  fi

  if [[ -n "${AGENT_REPAIR_COMMAND:-}" ]]; then
    bash -lc "$AGENT_REPAIR_COMMAND"
  else
    scripts/agentic_repair.py --failure-log ".agentic/round-${round}.log"
  fi
done
