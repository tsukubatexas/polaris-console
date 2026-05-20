#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path

import yaml


def main() -> None:
    workflows = sorted(Path(".github/workflows").glob("*.yml"))
    for workflow in workflows:
        with workflow.open(encoding="utf-8") as handle:
            payload = yaml.safe_load(handle)
        if not isinstance(payload, dict):
            raise SystemExit(f"{workflow} does not contain a YAML mapping.")
        if "jobs" not in payload:
            raise SystemExit(f"{workflow} does not define jobs.")
    print(f"Workflow YAML parsed successfully for {len(workflows)} workflows.")


if __name__ == "__main__":
    main()
