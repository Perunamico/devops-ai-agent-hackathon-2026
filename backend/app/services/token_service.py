import random
import logging
from datetime import datetime, timedelta, timezone

from app.config import Settings

logger = logging.getLogger(__name__)

PAYLOAD_LEN = 11
BASE = 13           # シンボル値の範囲: 0–12
START_SYMBOL = 14
END_SYMBOL = 15
VERSION = 0
TOKEN_EXPIRE_SECONDS = 60

# hex 文字マッピング: 0–9 → '0'–'9', 10 → 'A', 11 → 'B', 12 → 'C'
_HEX_CHARS = "0123456789ABC"


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

    def generate_payload_raw(self) -> list[int]:
        """0–12 の整数を PAYLOAD_LEN 個ランダム生成"""
        return [random.randint(0, BASE - 1) for _ in range(PAYLOAD_LEN)]

    def payload_to_token_key(self, payload_raw: list[int]) -> str:
        """[3,10,1,...] → "3A1C50826B4" (11文字, 0-C の hex 表記)"""
        return "".join(_HEX_CHARS[v] for v in payload_raw)

    def token_key_to_payload(self, key: str) -> list[int]:
        """"3A1C50826B4" → [3,10,1,...]"""
        return [_HEX_CHARS.index(c) for c in key.upper()]

    def compute_checksum(self, payload_raw: list[int]) -> tuple[int, int]:
        """(sum % 13, weighted_sum % 13)"""
        s = sum(payload_raw) % BASE
        w = sum(v * (i + 1) for i, v in enumerate(payload_raw)) % BASE
        return s, w

    def encode_to_data_symbols(self, payload_raw: list[int]) -> list[int]:
        """VERSION + PAYLOAD + CHECKSUM の rawData を候補配列エンコードして返す（14要素）"""
        cs, cw = self.compute_checksum(payload_raw)
        raw_data = [VERSION] + payload_raw + [cs, cw]
        return _encode_symbols(raw_data, START_SYMBOL)

    def decode_from_data_symbols(self, encoded_data: list[int]) -> list[int] | None:
        """エンコード済み 14 シンボル → payloadRaw (11要素)。不正なら None"""
        raw_data = _decode_symbols(encoded_data, START_SYMBOL)
        if raw_data is None:
            return None
        if raw_data[0] != VERSION:
            return None
        payload_raw = raw_data[1:1 + PAYLOAD_LEN]
        expected_cs, expected_cw = self.compute_checksum(payload_raw)
        if raw_data[1 + PAYLOAD_LEN] != expected_cs or raw_data[2 + PAYLOAD_LEN] != expected_cw:
            return None
        return payload_raw


def _encode_symbols(raw_data: list[int], start_symbol: int) -> list[int]:
    prev = start_symbol
    result: list[int] = []
    for raw in raw_data:
        candidates = [s for s in range(BASE + 1) if s != prev]  # 0–13 から prev 除外
        encoded = candidates[raw]
        result.append(encoded)
        prev = encoded
    return result


def _decode_symbols(encoded_data: list[int], start_symbol: int) -> list[int] | None:
    prev = start_symbol
    result: list[int] = []
    for encoded in encoded_data:
        candidates = [s for s in range(BASE + 1) if s != prev]
        if encoded not in candidates:
            return None
        result.append(candidates.index(encoded))
        prev = encoded
    return result
