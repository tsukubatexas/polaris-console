from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel

GENERATED_DIR = Path(__file__).resolve().parents[1] / "generated"
OPERATIONS_FILE = GENERATED_DIR / "operations.json"


class Parameter(BaseModel):
    name: str
    location: str
    required: bool = False
    description: str = ""
    schema_type: str = "string"


class Operation(BaseModel):
    id: str
    service: str
    method: str
    path: str
    summary: str = ""
    description: str = ""
    tags: list[str] = []
    path_params: list[Parameter] = []
    query_params: list[Parameter] = []
    header_params: list[Parameter] = []
    request_body_required: bool = False
    request_schema_name: str | None = None
    request_schema: dict[str, Any] | None = None
    responses: list[str] = []
    source: str
    mutating: bool = False


class OperationRegistry(BaseModel):
    generated_at: str
    polaris_release: str
    source_url: str
    operations: list[Operation]

    @property
    def by_id(self) -> dict[str, Operation]:
        return {operation.id: operation for operation in self.operations}

    def summary(self) -> dict[str, Any]:
        services: dict[str, int] = {}
        mutating = 0
        for operation in self.operations:
            services[operation.service] = services.get(operation.service, 0) + 1
            mutating += int(operation.mutating)
        return {
            "generated_at": self.generated_at,
            "polaris_release": self.polaris_release,
            "source_url": self.source_url,
            "operation_count": len(self.operations),
            "services": services,
            "mutating_operations": mutating,
        }


@lru_cache
def load_registry() -> OperationRegistry:
    if not OPERATIONS_FILE.exists():
        raise FileNotFoundError(
            f"{OPERATIONS_FILE} is missing. Run scripts/fetch_polaris_specs.py first."
        )
    payload = json.loads(OPERATIONS_FILE.read_text(encoding="utf-8"))
    return OperationRegistry.model_validate(payload)
