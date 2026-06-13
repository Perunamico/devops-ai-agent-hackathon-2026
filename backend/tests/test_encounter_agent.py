from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from app.agents.encounter_agent import EncounterAgent


def make_agent():
    ai = MagicMock()
    ai.generate_json.return_value = {
        "common_topics": ["音楽"],
        "related_topics": ["ライブ"],
        "conversation_hooks": ["最近聴いてる曲ある？"],
        "followup_suggestions": ["おすすめのアーティスト"],
        "new_interest_candidates": ["レコード"],
        "common_message": "2人とも音楽が好きなんだね！",
    }
    db = MagicMock()
    token_svc = MagicMock()
    return EncounterAgent(ai, db, token_svc), db, token_svc


def test_issue_token_saves_exchange_token():
    agent, db, token_svc = make_agent()
    token_svc.generate_payload_raw.return_value = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    token_svc.payload_to_token_key.return_value = "123456789AB"

    result = agent.issue_token("user1")

    assert result.payload_raw == [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    assert result.token_key == "123456789AB"
    assert result.qr_url.endswith("/exchange?exchangeToken=123456789AB")
    db.save_exchange_token.assert_called_once()


def test_scan_qr_token_creates_session_and_returns_matched():
    agent, db, _ = make_agent()
    db.get_exchange_token.return_value = {
        "token_key": "ABC",
        "issued_by": "user-a",
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
        "used": False,
    }
    db.create_exchange_session.return_value = "session-1"

    with patch.object(agent, "_schedule_common_message_generation") as schedule:
        result = agent.scan_qr_token("user-b", "ABC")

    assert result.status == "matched"
    assert result.session_id == "session-1"
    db.mark_exchange_token_used_with_session.assert_called_once_with("ABC", "session-1")
    schedule.assert_called_once_with("session-1", "user-a", "user-b")


def test_scan_qr_token_rejects_same_user():
    agent, db, _ = make_agent()
    db.get_exchange_token.return_value = {
        "token_key": "ABC",
        "issued_by": "user-a",
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=60)).isoformat(),
        "used": False,
    }

    result = agent.scan_qr_token("user-a", "ABC")

    assert result.status == "self"
    db.create_exchange_session.assert_not_called()
