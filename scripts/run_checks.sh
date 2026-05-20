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

"$PYTHON_BIN" -m pip install -e ".[dev]"
scripts/check_workflows_yaml.py
scripts/check_generated_current.py
scripts/check_actions_pinned.sh
"$PYTHON_BIN" -m ruff check .
"$PYTHON_BIN" -m pytest

pushd frontend >/dev/null
if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi
npm run typecheck
npm run build
popd >/dev/null

scripts/helm_checks.sh
