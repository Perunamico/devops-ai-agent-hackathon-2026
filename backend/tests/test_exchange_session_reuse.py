"""find_active_session_by_pair が古い放置セッションを再利用しないことのテスト。

バイバイし忘れて "active" のまま残ったセッションを何日も経ってから再利用すると、
新しい交流がセッションとして記録されず、ともだち一覧の交流回数や直近の分析結果が
更新されなくなる。これを防ぐ猶予時間ロジックを検証する。
"""
from datetime import datetime, timedelta, timezone

from app.config import Settings
from app.services.firestore_service import (
    FirestoreService,
    _ACTIVE_SESSION_REUSE_WINDOW_SECONDS,
)


def _db() -> FirestoreService:
    return FirestoreService(Settings(firestore_enabled=False, skip_auth=True))


def test_recent_active_session_is_reused():
    db = _db()
    recent = (datetime.now(timezone.utc) - timedelta(seconds=5)).isoformat()
    session_id = db.create_exchange_session({
        "user_a_id": "A", "user_b_id": "B", "speaker_id": "A", "created_at": recent,
    })

    found = db.find_active_session_by_pair("A", "B")
    assert found is not None
    assert found["id"] == session_id


def test_stale_active_session_is_not_reused():
    db = _db()
    stale = (
        datetime.now(timezone.utc)
        - timedelta(seconds=_ACTIVE_SESSION_REUSE_WINDOW_SECONDS + 60)
    ).isoformat()
    db.create_exchange_session({
        "user_a_id": "A", "user_b_id": "B", "speaker_id": "A", "created_at": stale,
    })

    assert db.find_active_session_by_pair("A", "B") is None
