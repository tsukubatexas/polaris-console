from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="POLARIS_CONSOLE_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    session_secret: Annotated[str, Field(min_length=32)] = "dev-only-change-me-dev-only-change-me"
    session_ttl_seconds: int = 8 * 60 * 60
    request_timeout_seconds: float = 45.0
    allow_insecure_tls: bool = False
    cookie_secure: bool = False
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173"]
    )
    allowed_target_hosts: Annotated[list[str], NoDecode] = Field(default_factory=list)

    @field_validator("allowed_origins", "allowed_target_hosts", mode="before")
    @classmethod
    def parse_origins(cls, value: object) -> list[str]:
        if isinstance(value, str):
            return [item.strip() for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return value
        return []


@lru_cache
def get_settings() -> Settings:
    return Settings()
