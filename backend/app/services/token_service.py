import secrets
import logging
from datetime import datetime, timedelta, timezone

from app.config import Settings

logger = logging.getLogger(__name__)

_FREQ_BASE = 17000
_FREQ_STEP = 200  # 16 steps → 17000 to 20000 Hz


class TokenService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._firebase_initialized = False

    def _ensure_firebase(self) -> None:
        if self._firebase_initialized:
            return
        if self._settings.skip_auth:
            return
        try:
            import firebase_admin
            from firebase_admin import credentials
            if not firebase_admin._apps:
                firebase_admin.initialize_app()
            self._firebase_initialized = True
        except Exception as e:
            logger.warning("Firebase init failed: %s", e)

    def verify_firebase_token(self, id_token: str) -> str:
        self._ensure_firebase()
        from firebase_admin import auth
        decoded = auth.verify_id_token(id_token)
        return decoded["uid"]

    def generate_exchange_token(self) -> tuple[str, datetime]:
        token = secrets.token_urlsafe(16)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
        return token, expires_at

    def encode_token_to_frequencies(self, token: str) -> list[int]:
        token_bytes = token.encode()[:8]
        freqs = []
        for b in token_bytes:
            high = (b >> 4) & 0xF
            low = b & 0xF
            freqs.append(_FREQ_BASE + high * _FREQ_STEP)
            freqs.append(_FREQ_BASE + low * _FREQ_STEP)
        return freqs
