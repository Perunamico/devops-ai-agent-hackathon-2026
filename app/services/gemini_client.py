from __future__ import annotations

import logging
import time
from typing import Any

from app.config import Settings, get_settings
from app.utils.json_utils import extract_json_object

logger = logging.getLogger(__name__)


class GeminiClient:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or get_settings()
        self._client: Any | None = None
        self._init_error: Exception | None = None

    @property
    def configured(self) -> bool:
        return self.settings.gemini_configured

    def _get_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self.configured:
            raise RuntimeError("Gemini is not configured")
        try:
            from google import genai

            if self.settings.use_vertex_ai:
                self._client = genai.Client(
                    vertexai=True,
                    project=self.settings.google_cloud_project,
                    location=self.settings.google_cloud_location,
                )
            else:
                self._client = genai.Client(api_key=self.settings.gemini_api_key)
            return self._client
        except Exception as exc:  # pragma: no cover - depends on environment credentials
            self._init_error = exc
            raise

    def generate_text(self, prompt: str) -> str:
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                client = self._get_client()
                response = client.models.generate_content(
                    model=self.settings.gemini_model,
                    contents=prompt,
                    config={"temperature": 0.2, "response_mime_type": "application/json"},
                )
                return getattr(response, "text", "") or "{}"
            except Exception as exc:  # no secrets in logs
                last_exc = exc
                logger.warning("Gemini generation failed on attempt %s: %s", attempt + 1, exc.__class__.__name__)
                time.sleep(0.2 * (attempt + 1))
        raise RuntimeError("Gemini generation failed") from last_exc

    def generate_json(self, prompt: str, schema_hint: str | None = None) -> dict[str, Any]:
        full_prompt = prompt if schema_hint is None else f"{prompt}\n\nSchema hint:\n{schema_hint}"
        text = self.generate_text(full_prompt)
        return extract_json_object(text)
