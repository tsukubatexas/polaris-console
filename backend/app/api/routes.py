from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from backend.app.core.config import Settings, get_settings
from backend.app.services.polaris import PolarisGateway
from backend.app.services.sessions import PolarisSession, SessionStore
from backend.app.services.specs import OperationRegistry, load_registry

router = APIRouter(prefix="/api")


def get_registry() -> OperationRegistry:
    return load_registry()


def get_session_store(settings: Settings = Depends(get_settings)) -> SessionStore:
    if not hasattr(get_session_store, "_store"):
        get_session_store._store = SessionStore(settings)  # type: ignore[attr-defined]
    return get_session_store._store  # type: ignore[attr-defined]


class ConnectRequest(BaseModel):
    management_url: str = Field(examples=["http://localhost:8181/api/management/v1"])
    catalog_url: str = Field(examples=["http://localhost:8181/api/catalog"])
    realm: str | None = Field(default="POLARIS")
    auth_mode: str = Field(pattern="^(bearer|client_credentials|none)$")
    bearer_token: str | None = None
    token_url: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    scope: str | None = None


class OperationRequest(BaseModel):
    path_params: dict[str, str] = Field(default_factory=dict)
    query_params: dict[str, str] = Field(default_factory=dict)
    body: Any = None


def validate_target_url(value: str | None, settings: Settings, label: str) -> None:
    if not value:
        return
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"{label} must be an HTTP(S) URL.")
    if settings.allowed_target_hosts and parsed.hostname not in settings.allowed_target_hosts:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"{label} host is not allowed by POLARIS_CONSOLE_ALLOWED_TARGET_HOSTS.",
        )


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/spec/summary")
def spec_summary(registry: OperationRegistry = Depends(get_registry)) -> dict[str, Any]:
    return registry.summary()


@router.get("/spec/operations")
def spec_operations(registry: OperationRegistry = Depends(get_registry)) -> list[dict[str, Any]]:
    return [operation.model_dump() for operation in registry.operations]


@router.post("/session/connect")
def connect(
    payload: ConnectRequest,
    response: Response,
    store: SessionStore = Depends(get_session_store),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    validate_target_url(payload.management_url, settings, "Management URL")
    validate_target_url(payload.catalog_url, settings, "Catalog URL")
    validate_target_url(payload.token_url, settings, "Token URL")
    if payload.auth_mode == "bearer" and not payload.bearer_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bearer token is required.")
    if payload.auth_mode == "client_credentials":
        missing = [
            field
            for field in ("token_url", "client_id", "client_secret")
            if not getattr(payload, field)
        ]
        if missing:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Missing OAuth client credential fields: {', '.join(missing)}",
            )
    session = PolarisSession(
        session_id="",
        management_url=str(payload.management_url).rstrip("/"),
        catalog_url=str(payload.catalog_url).rstrip("/"),
        realm=payload.realm or None,
        auth_mode=payload.auth_mode,
        bearer_token=payload.bearer_token,
        token_url=payload.token_url,
        client_id=payload.client_id,
        client_secret=payload.client_secret,
        scope=payload.scope,
    )
    return store.create(session, response).public_view()


@router.get("/session")
def current_session(
    request: Request,
    store: SessionStore = Depends(get_session_store),
) -> dict[str, Any]:
    try:
        return store.get(request).public_view()
    except HTTPException as exc:
        if exc.status_code == status.HTTP_401_UNAUTHORIZED:
            return {"connected": False}
        raise


@router.post("/session/logout")
def logout(
    request: Request,
    response: Response,
    store: SessionStore = Depends(get_session_store),
) -> dict[str, bool]:
    store.clear(request, response)
    return {"connected": False}


@router.post("/polaris/operations/{operation_id}")
async def execute_operation(
    operation_id: str,
    payload: OperationRequest,
    request: Request,
    registry: OperationRegistry = Depends(get_registry),
    store: SessionStore = Depends(get_session_store),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    operation = registry.by_id.get(operation_id)
    if operation is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Unknown operationId {operation_id}")
    session = store.get(request)
    gateway = PolarisGateway(settings)
    return await gateway.execute(
        session,
        operation,
        path_params=payload.path_params,
        query_params=payload.query_params,
        body=payload.body,
    )
