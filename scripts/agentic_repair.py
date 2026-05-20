#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[1]
PATCH_PATH = ROOT / ".agentic" / "last-repair.patch"


def run(command: list[str]) -> str:
    return subprocess.run(
        command,
        cwd=ROOT,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    ).stdout


def read_trimmed(path: Path | None, limit: int = 28_000) -> str:
    if not path or not path.exists():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    return text[-limit:]


def extract_text(payload: dict[str, object]) -> str:
    if isinstance(payload.get("output_text"), str):
        return str(payload["output_text"])
    chunks: list[str] = []
    for item in payload.get("output", []) if isinstance(payload.get("output"), list) else []:
        if not isinstance(item, dict):
            continue
        for content in item.get("content", []) if isinstance(item.get("content"), list) else []:
            if isinstance(content, dict) and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    return "\n".join(chunks)


def extract_patch(text: str) -> str:
    fenced = re.search(r"```(?:diff|patch)?\s*(.*?)```", text, re.DOTALL)
    if fenced:
        text = fenced.group(1)
    start = text.find("diff --git ")
    if start == -1:
        start = text.find("*** Begin Patch")
    if start == -1:
        start = text.find("--- ")
    if start == -1:
        return ""
    return text[start:].strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Ask OpenAI to repair failing checks by returning a patch."
    )
    parser.add_argument("--failure-log", type=Path)
    args = parser.parse_args()

    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("OPENAI_API_KEY is not set; cannot run agentic repair.", file=sys.stderr)
        return 2

    status = run(["git", "status", "--short"])
    diff = run(["git", "diff", "--", ":!frontend/node_modules", ":!.agentic"])
    failure = read_trimmed(args.failure_log)
    model = os.environ.get("OPENAI_REPAIR_MODEL", "gpt-5.2")
    prompt = f"""You are repairing the Apache Polaris Console repository.

Return only a unified git diff. Do not include prose.

Rules:
- Keep the product a dynamic Apache Polaris web console.
- Preserve the Python FastAPI backend and React frontend architecture.
- Do not add secrets.
- Prefer small fixes that make the checks pass.

Git status:
{status}

Current diff:
{diff[-34_000:]}

Failing check output:
{failure}
"""

    response = requests.post(
        "https://api.openai.com/v1/responses",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": model,
            "input": prompt,
            "max_output_tokens": 12_000,
        },
        timeout=120,
    )
    if response.status_code >= 300:
        print(response.text, file=sys.stderr)
        return 1

    patch = extract_patch(extract_text(response.json()))
    if not patch:
        print("Model response did not contain an applyable patch.", file=sys.stderr)
        print(json.dumps(response.json(), indent=2)[:4000], file=sys.stderr)
        return 1

    PATCH_PATH.parent.mkdir(exist_ok=True)
    PATCH_PATH.write_text(patch, encoding="utf-8")
    result = subprocess.run(
        ["git", "apply", "--whitespace=fix", str(PATCH_PATH)],
        cwd=ROOT,
        text=True,
    )
    return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
