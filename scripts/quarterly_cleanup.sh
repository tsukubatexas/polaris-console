#!/usr/bin/env bash
set -euo pipefail

PYTHON_BIN="${PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  if [[ -z "${CI:-}" && -x .venv/bin/python ]]; then
    PYTHON_BIN=.venv/bin/python
  elif [[ -z "${CI:-}" ]] && command -v python3.12 >/dev/null 2>&1; then
    python3.12 -m venv .venv
    PYTHON_BIN=.venv/bin/python
  elif command -v python3.12 >/dev/null 2>&1; then
    PYTHON_BIN=python3.12
  elif command -v python3 >/dev/null 2>&1; then
    PYTHON_BIN=python3
  else
    PYTHON_BIN=python
  fi
fi

scripts/agentic_update_loop.sh

"$PYTHON_BIN" -m pip list --outdated || true

pushd frontend >/dev/null
npm outdated || true
npm audit --audit-level=high
popd >/dev/null
