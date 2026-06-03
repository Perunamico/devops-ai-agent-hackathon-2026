import secrets
from datetime import datetime, timedelta, timezone

_FREQ_BASE = 700
_FREQ_STEP = 200  # 16 steps → 700 to 3700 Hz


class TokenService:
    def generate_exchange_token(self) -> tuple[str, datetime]:
        token = secrets.token_urlsafe(6)
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
