import pytest

from app.config import Settings
from app.services.token_service import EmailNotVerifiedError, TokenService


def _service_with_decoded(monkeypatch, decoded: dict) -> TokenService:
    service = TokenService(Settings(firestore_enabled=False))
    # Firebase 初期化と実トークン検証をスキップし、decode 結果だけ差し替える
    service._firebase_initialized = True
    from firebase_admin import auth
    monkeypatch.setattr(auth, "verify_id_token", lambda _token: decoded)
    return service


def test_verify_allows_verified_password_user(monkeypatch):
    service = _service_with_decoded(monkeypatch, {
        "uid": "user-1",
        "email_verified": True,
        "firebase": {"sign_in_provider": "password"},
    })
    assert service.verify_firebase_token("dummy") == "user-1"


def test_verify_rejects_unverified_password_user(monkeypatch):
    service = _service_with_decoded(monkeypatch, {
        "uid": "user-1",
        "email_verified": False,
        "firebase": {"sign_in_provider": "password"},
    })
    with pytest.raises(EmailNotVerifiedError):
        service.verify_firebase_token("dummy")


def test_verify_allows_non_password_provider(monkeypatch):
    # 匿名認証など password 以外のプロバイダは email_verified を要求しない
    service = _service_with_decoded(monkeypatch, {
        "uid": "anon-1",
        "firebase": {"sign_in_provider": "anonymous"},
    })
    assert service.verify_firebase_token("dummy") == "anon-1"
