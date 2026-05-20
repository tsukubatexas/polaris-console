#!/usr/bin/env python3
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

import requests
import yaml

ROOT = Path(__file__).resolve().parents[1]
SPEC_FILES = {
    "management": "polaris-management-service.yml",
    "catalog": "polaris-catalog-service.yaml",
    "iceberg": "iceberg-rest-catalog-open-api.yaml",
}
HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "polaris-console-generator",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def latest_release() -> str:
    response = requests.get(
        "https://api.github.com/repos/apache/polaris/releases/latest",
        headers=github_headers(),
        timeout=30,
    )
    response.raise_for_status()
    return response.json()["tag_name"]


def fetch_specs(tag: str, output_dir: Path) -> Path:
    spec_dir = output_dir / tag / "spec"
    spec_dir.mkdir(parents=True, exist_ok=True)
    wanted = [
        "polaris-management-service.yml",
        "polaris-catalog-service.yaml",
        "iceberg-rest-catalog-open-api.yaml",
        "polaris-catalog-apis/policy-apis.yaml",
        "polaris-catalog-apis/notifications-api.yaml",
        "polaris-catalog-apis/generic-tables-api.yaml",
        "polaris-catalog-apis/oauth-tokens-api.yaml",
    ]
    for spec_path in wanted:
        url = f"https://raw.githubusercontent.com/apache/polaris/{tag}/spec/{spec_path}"
        response = requests.get(url, headers=github_headers(), timeout=30)
        response.raise_for_status()
        target = spec_dir / spec_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(response.text, encoding="utf-8")
    return spec_dir


def load_yaml(path: Path) -> dict[str, Any]:
    return yaml.safe_load(path.read_text(encoding="utf-8"))


def pointer_get(document: Any, pointer: str) -> Any:
    if pointer in ("", "#"):
        return document
    pointer = pointer[1:] if pointer.startswith("#") else pointer
    pointer = pointer[1:] if pointer.startswith("/") else pointer
    current = document
    for raw_part in pointer.split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        current = current[part]
    return current


def resolve_ref(ref: str, current_file: Path, cache: dict[Path, dict[str, Any]]) -> tuple[Any, str]:
    if "#" in ref:
        file_part, pointer = ref.split("#", 1)
        pointer = "#" + pointer
    else:
        file_part, pointer = ref, "#"
    target_file = (
        (current_file.parent / file_part).resolve() if file_part else current_file.resolve()
    )
    if target_file not in cache:
        cache[target_file] = load_yaml(target_file)
    return pointer_get(cache[target_file], pointer), str(target_file)


def schema_name(schema: dict[str, Any] | None) -> str | None:
    if not schema:
        return None
    ref = schema.get("$ref")
    if isinstance(ref, str):
        return ref.rsplit("/", 1)[-1]
    title = schema.get("title")
    if isinstance(title, str):
        return title
    return schema.get("type") if isinstance(schema.get("type"), str) else None


def parameter_record(parameter: dict[str, Any]) -> dict[str, Any]:
    schema = parameter.get("schema") or {}
    return {
        "name": parameter.get("name", ""),
        "location": parameter.get("in", ""),
        "required": bool(parameter.get("required")),
        "description": parameter.get("description", "") or "",
        "schema_type": schema.get("type", "string"),
    }


def request_schema(operation: dict[str, Any]) -> tuple[str | None, dict[str, Any] | None, bool]:
    body = operation.get("requestBody")
    if not isinstance(body, dict):
        return None, None, False
    content = body.get("content") or {}
    json_content = content.get("application/json") or next(iter(content.values()), {})
    schema = json_content.get("schema") if isinstance(json_content, dict) else None
    return schema_name(schema), schema, bool(body.get("required"))


def summarize_operation(
    *,
    service: str,
    source_name: str,
    path: str,
    method: str,
    path_item: dict[str, Any],
    operation: dict[str, Any],
) -> dict[str, Any] | None:
    operation_id = operation.get("operationId")
    if not operation_id:
        operation_id = (
            f"{source_name}_{method}_{path}".replace("/", "_").replace("{", "").replace("}", "")
        )
    parameters = []
    for parameter in path_item.get("parameters", []) + operation.get("parameters", []):
        if isinstance(parameter, dict):
            parameters.append(parameter_record(parameter))
    known_path_params = {item["name"] for item in parameters if item["location"] == "path"}
    for name in re.findall(r"\{([^}]+)}", path):
        if name not in known_path_params:
            parameters.append(
                {
                    "name": name,
                    "location": "path",
                    "required": True,
                    "description": f"Path parameter `{name}`.",
                    "schema_type": "string",
                }
            )
    request_name, schema, required = request_schema(operation)
    method_upper = method.upper()
    return {
        "id": operation_id,
        "service": service,
        "method": method_upper,
        "path": path,
        "summary": operation.get("summary") or operation.get("description", "").split("\n", 1)[0],
        "description": operation.get("description", "") or "",
        "tags": operation.get("tags", []),
        "path_params": [item for item in parameters if item["location"] == "path"],
        "query_params": [item for item in parameters if item["location"] == "query"],
        "header_params": [item for item in parameters if item["location"] == "header"],
        "request_body_required": required,
        "request_schema_name": request_name,
        "request_schema": schema,
        "responses": sorted(str(key) for key in (operation.get("responses") or {})),
        "source": source_name,
        "mutating": method_upper in {"POST", "PUT", "PATCH", "DELETE"},
    }


def build_registry(spec_dir: Path, tag: str) -> dict[str, Any]:
    cache: dict[Path, dict[str, Any]] = {}
    operations: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()

    for service, filename in SPEC_FILES.items():
        spec_file = (spec_dir / filename).resolve()
        if not spec_file.exists():
            continue
        spec = load_yaml(spec_file)
        cache[spec_file] = spec
        for path, path_item in (spec.get("paths") or {}).items():
            source_file = spec_file
            resolved_path_item = path_item
            if isinstance(path_item, dict) and "$ref" in path_item:
                resolved_path_item, resolved_source = resolve_ref(
                    path_item["$ref"],
                    spec_file,
                    cache,
                )
                source_file = Path(resolved_source)
            if not isinstance(resolved_path_item, dict):
                continue
            for method, operation in resolved_path_item.items():
                if method not in HTTP_METHODS or not isinstance(operation, dict):
                    continue
                key = (service, method.upper(), path)
                if key in seen:
                    continue
                seen.add(key)
                record = summarize_operation(
                    service=service,
                    source_name=str(source_file.relative_to(spec_dir.parent)),
                    path=path,
                    method=method,
                    path_item=resolved_path_item,
                    operation=operation,
                )
                if record:
                    operations.append(record)

    id_counts: dict[str, int] = {}
    for operation in operations:
        id_counts[operation["id"]] = id_counts.get(operation["id"], 0) + 1
    for operation in operations:
        if id_counts[operation["id"]] > 1:
            operation["id"] = f"{operation['service']}_{operation['id']}"

    operations.sort(key=lambda item: (item["service"], item["path"], item["method"]))
    return {
        "generated_at": dt.datetime.now(dt.UTC).isoformat(timespec="seconds"),
        "polaris_release": tag,
        "source_url": f"https://github.com/apache/polaris/tree/{tag}/spec",
        "operations": operations,
    }


def write_frontend_operations(registry: dict[str, Any]) -> None:
    output = ROOT / "frontend" / "src" / "generated" / "operations.ts"
    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(registry, indent=2, sort_keys=True)
    output.write_text(
        "/* Generated by scripts/fetch_polaris_specs.py. Do not edit by hand. */\n"
        f"export const operationRegistry = {payload} as const;\n",
        encoding="utf-8",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Fetch Apache Polaris OpenAPI specs and generate operation metadata."
    )
    parser.add_argument("--release", default=os.environ.get("POLARIS_RELEASE", "latest"))
    parser.add_argument("--spec-cache-dir", default="specs")
    parser.add_argument("--source-dir", default=os.environ.get("POLARIS_SPEC_SOURCE_DIR"))
    args = parser.parse_args()

    tag = latest_release() if args.release == "latest" else args.release
    if args.source_dir:
        spec_dir = Path(args.source_dir).resolve()
    else:
        spec_dir = fetch_specs(tag, ROOT / args.spec_cache_dir)

    registry = build_registry(spec_dir, tag)
    if len(registry["operations"]) < 20:
        print(
            f"Expected at least 20 operations, generated {len(registry['operations'])}",
            file=sys.stderr,
        )
        return 1

    backend_output = ROOT / "backend" / "app" / "generated" / "operations.json"
    if backend_output.exists():
        existing = json.loads(backend_output.read_text(encoding="utf-8"))
        if (
            existing.get("polaris_release") == registry["polaris_release"]
            and existing.get("source_url") == registry["source_url"]
            and existing.get("operations") == registry["operations"]
        ):
            registry["generated_at"] = existing.get("generated_at", registry["generated_at"])

    backend_output.parent.mkdir(parents=True, exist_ok=True)
    backend_output.write_text(
        json.dumps(registry, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    write_frontend_operations(registry)
    print(
        f"Generated {len(registry['operations'])} operations from {tag} ({registry['source_url']})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
