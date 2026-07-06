"""ともだち一覧（get_friends_overview）のテスト。実インメモリ FirestoreService で検証する。"""
from app.config import Settings
from app.services.firestore_service import FirestoreService


def _db() -> FirestoreService:
    return FirestoreService(Settings(firestore_enabled=False, skip_auth=True))


def test_no_sessions_returns_empty():
    db = _db()
    overview = db.get_friends_overview("A")
    assert overview["friends"] == []
    assert overview["friend_count"] == 0
    assert overview["common_topic_count"] == 0
    assert overview["last_interaction_at"] is None


def test_friends_come_only_from_own_sessions():
    db = _db()
    # 他人同士のセッションは自分のともだちに影響しない
    db.create_exchange_session({"user_a_id": "X", "user_b_id": "Y", "speaker_id": "X"})
    overview = db.get_friends_overview("A")
    assert overview["friend_count"] == 0


def test_same_partner_multiple_sessions_counts_once_with_latest_data():
    db = _db()
    db.create_pet("B", {"name": "ミライ", "personality": "p", "tone": "t"})
    old = db.create_exchange_session({
        "user_a_id": "A", "user_b_id": "B", "speaker_id": "A",
        "created_at": "2026-07-01T00:00:00+00:00",
    })
    new = db.create_exchange_session({
        "user_a_id": "B", "user_b_id": "A", "speaker_id": "B",
        "created_at": "2026-07-02T00:00:00+00:00",
    })
    db.save_exchange_analysis(old, {"common_topics": ["古い話題"]})
    db.save_exchange_analysis(new, {"common_topics": ["宇宙", "ねこ", "AIの未来", "カフェ"]})

    overview = db.get_friends_overview("A")
    assert overview["friend_count"] == 1
    friend = overview["friends"][0]
    assert friend["user_id"] == "B"
    assert friend["pet_name"] == "ミライ"
    # 最新セッションの分析を採用し、表示はベスト3に切り詰める
    assert friend["common_topics"] == ["宇宙", "ねこ", "AIの未来"]
    assert friend["last_interacted_at"] == "2026-07-02T00:00:00+00:00"
    assert friend["session_id"] == new
    # 統計のトピック数は最新分析の全件（4件）
    assert overview["common_topic_count"] == 4
    assert overview["last_interaction_at"] == "2026-07-02T00:00:00+00:00"


def test_friends_sorted_by_latest_interaction_and_topics_summed():
    db = _db()
    s_b = db.create_exchange_session({
        "user_a_id": "A", "user_b_id": "B", "speaker_id": "A",
        "created_at": "2026-07-01T00:00:00+00:00",
    })
    s_c = db.create_exchange_session({
        "user_a_id": "C", "user_b_id": "A", "speaker_id": "C",
        "created_at": "2026-07-02T00:00:00+00:00",
    })
    db.save_exchange_analysis(s_b, {"common_topics": ["ゲーム", "映画"]})
    db.save_exchange_analysis(s_c, {"common_topics": ["旅行"]})

    overview = db.get_friends_overview("A")
    assert [f["user_id"] for f in overview["friends"]] == ["C", "B"]
    assert overview["friend_count"] == 2
    assert overview["common_topic_count"] == 3
    assert overview["last_interaction_at"] == "2026-07-02T00:00:00+00:00"


def test_comment_prefers_personal_message_over_common():
    db = _db()
    session = db.create_exchange_session({"user_a_id": "A", "user_b_id": "B", "speaker_id": "A"})
    db.update_exchange_session(session, {
        "common_message": "2人ともねこが好きなんだね！",
        "common_message_by_user": {"A": "Aだけへのメッセージ"},
    })

    assert db.get_friends_overview("A")["friends"][0]["comment"] == "Aだけへのメッセージ"
    # 本人向けが無い側は共通メッセージへフォールバック
    assert db.get_friends_overview("B")["friends"][0]["comment"] == "2人ともねこが好きなんだね！"


def test_missing_pet_and_analysis_are_tolerated():
    db = _db()
    session = db.create_exchange_session({"user_a_id": "A", "user_b_id": "B", "speaker_id": "A"})
    overview = db.get_friends_overview("A")
    friend = overview["friends"][0]
    assert friend["pet_name"] == "なまえのないペット"
    assert friend["common_topics"] == []
    assert friend["comment"] == ""
    assert friend["session_id"] == session
    assert overview["common_topic_count"] == 0
