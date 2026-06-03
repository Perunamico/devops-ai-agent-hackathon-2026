import secrets
from datetime import datetime, timedelta, timezone

_FREQ_BASE = 700
_FREQ_STEP = 200  # 16 steps → 700 to 3700 Hz


class TokenService:
    def generate_exchange_token(self) -> tuple[str, datetime]:
        # 16ニブルを「前と同じにならない値」から選んで生成 → 隣接重複を構造的に排除
        prev = -1
        nibbles: list[int] = []
        for _ in range(16):
            pool = [n for n in range(16) if n != prev]
            n = secrets.choice(pool)
            nibbles.append(n)
            prev = n

        # ニブル列をそのまま16文字の16進数トークン文字列にする
        token = ''.join(f'{n:x}' for n in nibbles)
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
        return token, expires_at

    def encode_token_to_frequencies(self, token: str) -> list[int]:
        # トークンの各16進文字 = ニブル値 → 周波数
        nibbles = [int(c, 16) for c in token[:16]]
        return [_FREQ_BASE + n * _FREQ_STEP for n in nibbles]
