from __future__ import annotations

import json
import re
import time
from typing import Any
from urllib.parse import quote, urlencode

import httpx
from fastapi import HTTPException, status

from backend.app.core.config import Settings
from backend.app.services.sessions import PolarisSession
from backend.app.services.specs import Operation

PATH_PARAM_RE = re.compile(r"\{([^}]+)}")


def _join_url(base: str, path: str) -> str:
    return f"{base.rstrip('/')}/{path.lstrip('/')}"


def _expand_path(path: str, params: dict[str, str]) -> str:
    def replace(match: re.Match[str]) -> str:
        name = match.group(1)
        value = params.get(name)
        if value is None or value == "":
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Missing path parameter: {name}")
        return quote(str(value), safe="")

    return PATH_PARAM_RE.sub(replace, path)


class PolarisGateway:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def execute(
        self,
        session: PolarisSession,
        operation: Operation,
        *,
        path_params: dict[str, str],
        query_params: dict[str, str],
        body: Any,
    ) -> dict[str, Any]:
        token = await self._access_token(session)
        expanded_path = _expand_path(operation.path, path_params)
        query = {k: v for k, v in query_params.items() if v not in ("", None)}
        if query:
            expanded_path = f"{expanded_path}?{urlencode(query)}"

        base = session.management_url if operation.service == "management" else session.catalog_url
        url = _join_url(base, expanded_path)
        headers = {
            "Accept": "application/json",
            "User-Agent": "polaris-console/0.1.0",
        }
        if token:
            headers["Authorization"] = f"Bearer {token}"
        if session.realm:
            headers["Polaris-Realm"] = session.realm

        json_body = None if body in (None, "", {}) else body
        try:
            async with httpx.AsyncClient(
                timeout=self._settings.request_timeout_seconds,
                verify=not self._settings.allow_insecure_tls,
            ) as client:
                response = await client.request(
                    operation.method,
                    url,
                    headers=headers,
                    json=json_body,
                )
        except httpx.RequestError as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, f"Could not reach Polaris: {exc}"
            ) from exc

        payload: Any
        try:
            payload = response.json()
        except json.JSONDecodeError:
            payload = response.text

        return {
            "status_code": response.status_code,
            "ok": 200 <= response.status_code < 300,
            "headers": {
                key: value
                for key, value in response.headers.items()
                if key.lower() in {"content-type", "request-id", "x-request-id"}
            },
            "body": payload,
            "operation": {
                "id": operation.id,
                "method": operation.method,
                "path": operation.path,
                "service": operation.service,
            },
        }

    async def _access_token(self, session: PolarisSession) -> str | None:
        if session.auth_mode == "none":
            return None
        if session.auth_mode == "bearer":
            return session.bearer_token
        if session.auth_mode != "client_credentials":
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Unsupported auth mode {session.auth_mode}",
            )
        if session.access_token and session.token_expires_at > time.time() + 30:
            return session.access_token
        if not session.token_url or not session.client_id or not session.client_secret:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "OAuth client credentials are incomplete.",
            )

        data = {
            "grant_type": "client_credentials",
            "client_id": session.client_id,
            "client_secret": session.client_secret,
        }
        if session.scope:
            data["scope"] = session.scope

        try:
            async with httpx.AsyncClient(
                timeout=self._settings.request_timeout_seconds,
                verify=not self._settings.allow_insecure_tls,
            ) as client:
                response = await client.post(session.token_url, data=data)
        except httpx.RequestError as exc:
            raise HTTPException(
                status.HTTP_502_BAD_GATEWAY, f"Could not reach OAuth token endpoint: {exc}"
            ) from exc
        if response.status_code < 200 or response.status_code >= 300:
            raise HTTPException(
                status.HTTP_401_UNAUTHORIZED,
                f"OAuth token request failed with HTTP {response.status_code}.",
            )
        payload = response.json()
        access_token = payload.get("access_token")
        if not access_token:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "OAuth response has no access_token.")
        session.access_token = access_token
        expires_in = int(payload.get("expires_in", 3600))
        session.token_expires_at = time.time() + expires_in
        return access_token
