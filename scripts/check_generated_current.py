#!/usr/bin/env python3
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend/app/generated/operations.json"
FRONTEND = ROOT / "frontend/src/generated/operations.ts"


def main() -> int:
    payload = json.loads(BACKEND.read_text(encoding="utf-8"))
    frontend = FRONTEND.read_text(encoding="utf-8")
    operation_ids = [operation["id"] for operation in payload["operations"]]
    duplicates = sorted(
        {operation_id for operation_id in operation_ids if operation_ids.count(operation_id) > 1}
    )
    if duplicates:
        print("Generated registry has duplicate operation IDs:")
        for operation_id in duplicates[:20]:
            print(f"- {operation_id}")
        return 1
    missing = []
    for operation in payload["operations"]:
        if operation["id"] not in frontend:
            missing.append(operation["id"])
    if missing:
        print("Frontend generated registry is missing operations:")
        for operation_id in missing[:20]:
            print(f"- {operation_id}")
        return 1
    print(f"Generated registries agree on {len(payload['operations'])} operations.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
