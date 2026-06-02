from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    google_cloud_project: str | None = None
    vertex_ai_location: str = "asia-northeast1"
    gemini_model: str = "gemini-2.5-flash"
    gemini_api_key: str | None = None
    use_vertex_ai: bool = False
    firestore_database: str = "(default)"
    firestore_enabled: bool = True
    firebase_project_id: str | None = None
    skip_auth: bool = False
    log_level: str = "INFO"

    @property
    def gemini_configured(self) -> bool:
        return bool(self.gemini_api_key or (self.use_vertex_ai and self.google_cloud_project))


_settings: Settings | None = None


def get_settings() -> Settings:
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings
