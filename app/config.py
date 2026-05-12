from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    google_cloud_project: str | None = Field(default=None, alias="GOOGLE_CLOUD_PROJECT")
    google_cloud_location: str = Field(default="asia-northeast1", alias="GOOGLE_CLOUD_LOCATION")
    gemini_model: str = Field(default="gemini-2.5-flash", alias="GEMINI_MODEL")
    gemini_api_key: str | None = Field(default=None, alias="GEMINI_API_KEY")
    use_vertex_ai: bool = Field(default=False, alias="USE_VERTEX_AI")
    firestore_enabled: bool = Field(default=False, alias="FIRESTORE_ENABLED")
    runtime_mode: Literal["auto", "adk", "fallback"] = Field(default="auto", alias="RUNTIME_MODE")
    log_level: str = Field(default="INFO", alias="LOG_LEVEL")

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", populate_by_name=True)

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key or (self.use_vertex_ai and self.google_cloud_project))


@lru_cache
def get_settings() -> Settings:
    return Settings()
