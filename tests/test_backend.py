from __future__ import annotations

import httpx
import respx
from fastapi.testclient import TestClient

from backend.app.api import routes
from backend.app.main import create_app


def client() -> TestClient:
    if hasattr(routes.get_session_store, "_store"):
        delattr(routes.get_session_store, "_store")
    return TestClient(create_app())


def test_spec_summary_contains_generated_operations() -> None:
    response = client().get("/api/spec/summary")

    assert response.status_code == 200
    body = response.json()
    assert body["polaris_release"].startswith("apache-polaris-")
    assert body["operation_count"] >= 100
    assert body["services"]["management"] > 0


def test_operation_ids_are_unique() -> None:
    response = client().get("/api/spec/operations")

    assert response.status_code == 200
    operations = response.json()
    operation_ids = [operation["id"] for operation in operations]
    assert len(operation_ids) == len(set(operation_ids))


def test_connect_rejects_non_http_targets() -> None:
    response = client().post(
        "/api/session/connect",
        json={
            "management_url": "file:///etc/passwd",
            "catalog_url": "https://polaris.example/api/catalog",
            "realm": "POLARIS",
            "auth_mode": "none",
        },
    )

    assert response.status_code == 400
    assert "HTTP(S)" in response.json()["detail"]


def test_invalid_session_cookie_is_rejected() -> None:
    app = client()
    app.cookies.set("polaris_console_session", "tampered.invalid")

    response = app.get("/api/session")

    assert response.status_code == 200
    assert response.json() == {"connected": False}


@respx.mock
def test_bearer_session_forwards_authorization_and_realm() -> None:
    app = client()
    connected = app.post(
        "/api/session/connect",
        json={
            "management_url": "https://polaris.example/api/management/v1",
            "catalog_url": "https://polaris.example/api/catalog",
            "realm": "POLARIS",
            "auth_mode": "bearer",
            "bearer_token": "test-token",
        },
    )
    assert connected.status_code == 200

    route = respx.get("https://polaris.example/api/management/v1/catalogs").mock(
        return_value=httpx.Response(200, json={"catalogs": []})
    )
    response = app.post(
        "/api/polaris/operations/listCatalogs",
        json={"path_params": {}, "query_params": {}, "body": None},
    )

    assert response.status_code == 200
    assert response.json()["ok"] is True
    forwarded = route.calls[0].request
    assert forwarded.headers["authorization"] == "Bearer test-token"
    assert forwarded.headers["polaris-realm"] == "POLARIS"


@respx.mock
def test_client_credentials_session_gets_token_and_forwards_it() -> None:
    app = client()
    connected = app.post(
        "/api/session/connect",
        json={
            "management_url": "https://polaris.example/api/management/v1",
            "catalog_url": "https://polaris.example/api/catalog",
            "realm": "POLARIS",
            "auth_mode": "client_credentials",
            "token_url": "https://id.example/oauth/token",
            "client_id": "principal",
            "client_secret": "secret",
            "scope": "PRINCIPAL_ROLE:ALL",
        },
    )
    assert connected.status_code == 200

    token = respx.post("https://id.example/oauth/token").mock(
        return_value=httpx.Response(200, json={"access_token": "oauth-token", "expires_in": 3600})
    )
    catalogs = respx.get("https://polaris.example/api/management/v1/catalogs").mock(
        return_value=httpx.Response(200, json={"catalogs": []})
    )
    response = app.post(
        "/api/polaris/operations/listCatalogs",
        json={"path_params": {}, "query_params": {}, "body": None},
    )

    assert response.status_code == 200
    assert token.called
    assert catalogs.calls[0].request.headers["authorization"] == "Bearer oauth-token"
