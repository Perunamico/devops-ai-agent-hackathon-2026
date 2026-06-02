import time
import logging
from typing import Any

from app.config import Settings
from app.utils.json_utils import extract_json_object

logger = logging.getLogger(__name__)


class VertexAIService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = self._build_client()

    def _build_client(self):
        if self._settings.use_vertex_ai and self._settings.google_cloud_project:
            from google import genai
            return genai.Client(
                vertexai=True,
                project=self._settings.google_cloud_project,
                location=self._settings.vertex_ai_location,
            )
        elif self._settings.gemini_api_key:
            from google import genai
            return genai.Client(api_key=self._settings.gemini_api_key)
        else:
            logger.warning("Gemini not configured — all LLM calls will raise errors")
            return None

    def generate_json(self, prompt: str, temperature: float = 0.2) -> dict[str, Any]:
        if self._client is None:
            raise RuntimeError("Gemini client not configured. Set GEMINI_API_KEY or USE_VERTEX_AI.")

        last_error: Exception | None = None
        for attempt in range(3):
            try:
                from google.genai import types
                response = self._client.models.generate_content(
                    model=self._settings.gemini_model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        temperature=temperature,
                        response_mime_type="application/json",
                    ),
                )
                text = response.text or ""
                return extract_json_object(text)
            except Exception as e:
                last_error = e
                logger.warning("Gemini attempt %d failed: %s", attempt + 1, e)
                if attempt < 2:
                    time.sleep(0.2 * (attempt + 1))

        raise RuntimeError(f"Gemini failed after 3 attempts: {last_error}") from last_error
