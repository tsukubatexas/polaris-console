from __future__ import annotations

import hashlib
import hmac
import secrets
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, Response, status

from backend.app.core.config import Settings

SESSION_COOKIE = "polaris_console_session"


@dataclass
class PolarisSession:
    session_id: str
    management_url: str
    catalog_url: str
    realm: str | None
    auth_mode: str
    bearer_token: str | None = None
    token_url: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    scope: str | None = None
    access_token: str | None = None
    token_expires_at: float = 0
    created_at: float = 0
    expires_at: float = 0

    def public_view(self) -> dict[str, object]:
        return {
            "connected": True,
            "management_url": self.management_url,
            "catalog_url": self.catalog_url,
            "realm": self.realm,
            "auth_mode": self.auth_mode,
            "created_at": self.created_at,
            "expires_at": self.expires_at,
            "has_token": bool(self.bearer_token or self.access_token or self.client_secret),
        }


class SessionStore:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        self._sessions: dict[str, PolarisSession] = {}

    def _sign(self, session_id: str) -> str:
        return hmac.new(
            self._settings.session_secret.encode("utf-8"),
            session_id.encode("utf-8"),
            hashlib.sha256,
        ).hexdigest()

    def _cookie_value(self, session_id: str) -> str:
        return f"{session_id}.{self._sign(session_id)}"

    def _session_id_from_cookie(self, cookie: str | None) -> str | None:
        if not cookie or "." not in cookie:
            return None
        session_id, signature = cookie.rsplit(".", 1)
        if not hmac.compare_digest(signature, self._sign(session_id)):
            return None
        return session_id

    def create(self, session: PolarisSession, response: Response) -> PolarisSession:
        now = time.time()
        session.session_id = secrets.token_urlsafe(32)
        session.created_at = now
        session.expires_at = now + self._settings.session_ttl_seconds
        self._sessions[session.session_id] = session
        response.set_cookie(
            SESSION_COOKIE,
            self._cookie_value(session.session_id),
            max_age=self._settings.session_ttl_seconds,
            httponly=True,
            samesite="lax",
            secure=self._settings.cookie_secure,
        )
        return session

    def get(self, request: Request) -> PolarisSession:
        session_id = self._session_id_from_cookie(request.cookies.get(SESSION_COOKIE))
        if not session_id:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No active Polaris session.")
        session = self._sessions.get(session_id)
        if session is None or session.expires_at < time.time():
            if session_id in self._sessions:
                del self._sessions[session_id]
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Polaris session expired.")
        return session

    def clear(self, request: Request, response: Response) -> None:
        session_id = self._session_id_from_cookie(request.cookies.get(SESSION_COOKIE))
        if session_id:
            self._sessions.pop(session_id, None)
        response.delete_cookie(SESSION_COOKIE)
